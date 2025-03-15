const { ethers } = require('ethers');
const UserOp = require('../models/UserOp'); // Singular model name
const { packUserOp } = require('@account-abstraction/utils');
const { EntryPoint } = require('@account-abstraction/contracts');
const Semaphore = require('async-mutex').Semaphore;
const config = require('../config');

const paymasterABI = [
  'function validatePaymasterUserOp(tuple(address, uint256, bytes, bytes, uint256, uint256, uint256, uint256, uint256, bytes), bytes32, uint256) external returns (uint256, bytes)',
  'function getBalance() external view returns (uint256)'
];

async function createUserOperation(sender, callData, wallet, contract, gasParams = {}) {
  const entryPoint = new ethers.Contract(process.env.ENTRYPOINT_ADDRESS || config.blockchain.entryPointAddress, EntryPoint.abi, wallet);

  const userOp = {
    sender,
    nonce: await contract.nonces(sender),
    initCode: '0x',
    callData,
    callGasLimit: gasParams.callGasLimit || 200000,
    verificationGasLimit: gasParams.verificationGasLimit || 100000,
    preVerificationGas: gasParams.preVerificationGas || 21000,
    maxFeePerGas: gasParams.maxFeePerGas || ethers.utils.parseUnits('10', 'gwei'),
    maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas || ethers.utils.parseUnits('1', 'gwei'),
    paymasterAndData: '0x',
    signature: '0x'
  };

  if (process.env.PAYMASTER_ADDRESS || config.blockchain.paymasterAddress) {
    const paymasterData = await generatePaymasterData(userOp);
    userOp.paymasterAndData = ethers.utils.hexConcat([
      process.env.PAYMASTER_ADDRESS || config.blockchain.paymasterAddress,
      paymasterData
    ]);
  }

  const userOpHash = ethers.utils.keccak256(packUserOp(userOp));
  const signature = await wallet.signMessage(ethers.utils.arrayify(userOpHash));
  userOp.signature = signature;

  return userOp;
}

async function generatePaymasterData(userOp) {
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
  return ethers.utils.defaultAbiCoder.encode(['uint256'], [deadline]);
}

async function validateUserOp(userOp, contract, provider, logger) {
  try {
    const userOpHash = ethers.utils.keccak256(packUserOp(userOp));
    const recoveredAddress = ethers.utils.verifyMessage(ethers.utils.arrayify(userOpHash), userOp.signature);
    if (recoveredAddress.toLowerCase() !== userOp.sender.toLowerCase()) {
      throw new Error('Invalid signature');
    }

    const onChainNonce = await contract.nonces(userOp.sender);
    if (ethers.BigNumber.from(userOp.nonce).lt(onChainNonce)) throw new Error('Nonce too low');

    if (userOp.paymasterAndData !== '0x') {
      const paymasterAddress = userOp.paymasterAndData.slice(0, 42);
      const paymasterData = '0x' + userOp.paymasterAndData.slice(42);
      const isTrusted = await contract.trustedPaymasters(paymasterAddress);
      if (!isTrusted) throw new Error('Untrusted paymaster');

      const paymaster = new ethers.Contract(paymasterAddress, paymasterABI, provider);
      const balance = await paymaster.getBalance();
      const totalGasCost = ethers.BigNumber.from(userOp.maxFeePerGas)
        .mul(ethers.BigNumber.from(userOp.callGasLimit).add(userOp.verificationGasLimit).add(userOp.preVerificationGas));
      if (balance.lt(totalGasCost)) throw new Error('Insufficient paymaster funding');

      const [validationResult] = await paymaster.validatePaymasterUserOp(userOp, userOpHash, totalGasCost);
      if (validationResult.toNumber() !== 0) throw new Error('Paymaster validation failed');
    }

    return true;
  } catch (error) {
    logger.error('UserOp validation error:', error);
    return false;
  }
}

const semaphore = new Semaphore(config.performance.maxConcurrentUserOps || 5);

function notifyUpdate(userOp, wss) {
  if (wss && wss.clients) {
    wss.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'userOpUpdate', data: userOp }));
      }
    });
  }
}

async function submitUserOperation(userOp, contract, provider, logger, wss) {
  const [release] = await semaphore.acquire();
  let dbUserOp;

  try {
    // Validate UserOp before submission
    const isValid = await validateUserOp(userOp, contract, provider, logger);
    if (!isValid) throw new Error('UserOp validation failed');

    // Save to database before submission
    dbUserOp = new UserOp({
      sender: userOp.sender,
      nonce: userOp.nonce.toString(),
      callData: userOp.callData,
      txHash: '',
      status: 'pending',
      createdAt: new Date(),
    });
    await dbUserOp.save();
    notifyUpdate(dbUserOp, wss); // Notify clients of pending status

    // Submit to EntryPoint contract
    const entryPoint = new ethers.Contract(
      process.env.ENTRYPOINT_ADDRESS || config.blockchain.entryPointAddress,
      EntryPoint.abi,
      provider.getSigner()
    );
    const tx = await entryPoint.handleOps([userOp], wallet.address, {
      gasLimit: ethers.BigNumber.from(userOp.callGasLimit)
        .add(userOp.verificationGasLimit)
        .add(userOp.preVerificationGas),
    });
    const receipt = await tx.wait();

    // Update database with transaction details
    dbUserOp.txHash = receipt.transactionHash;
    dbUserOp.status = 'submitted';
    await dbUserOp.save();
    notifyUpdate(dbUserOp, wss); // Notify clients of submitted status

    logger.info(`UserOp submitted successfully: ${receipt.transactionHash}`);
    return receipt.transactionHash;
  } catch (error) {
    logger.error('UserOp submission error:', error);
    if (dbUserOp) {
      dbUserOp.status = 'failed';
      await dbUserOp.save();
      notifyUpdate(dbUserOp, wss); // Notify clients of failed status
    }
    throw error;
  } finally {
    release();
  }
}

module.exports = { createUserOperation, submitUserOperation };
