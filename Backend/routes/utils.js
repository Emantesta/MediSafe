const { ethers } = require('ethers');
const { UserOp } = require('../models/UserOp');
const { packUserOp } = require('@account-abstraction/utils');
const { EntryPoint } = require('@account-abstraction/contracts');

const paymasterABI = [
  'function validatePaymasterUserOp(tuple(address, uint256, bytes, bytes, uint256, uint256, uint256, uint256, uint256, bytes), bytes32, uint256) external returns (uint256, bytes)',
  'function getBalance() external view returns (uint256)'
];

async function createUserOperation(sender, callData, wallet, contract, gasParams = {}) {
  const entryPoint = new ethers.Contract(process.env.ENTRYPOINT_ADDRESS, EntryPoint.abi, wallet);

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

  if (process.env.PAYMASTER_ADDRESS) {
    const paymasterData = await generatePaymasterData(userOp);
    userOp.paymasterAndData = ethers.utils.hexConcat([process.env.PAYMASTER_ADDRESS, paymasterData]);
  }

  const userOpHash = ethers.utils.keccak256(packUserOp(userOp));
  const signature = await wallet.signMessage(ethers.utils.arrayify(userOpHash));
  userOp.signature = signature;

  return userOp;
}

async function generatePaymasterData(userOp) {
  const deadline = Math.floor(Date.now() / 1000) + 3600;
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
    if (userOp.nonce < onChainNonce) throw new Error('Nonce too low');

    if (userOp.paymasterAndData !== '0x') {
      const paymasterAddress = userOp.paymasterAndData.slice(0, 42);
      const paymasterData = '0x' + userOp.paymasterAndData.slice(42);
      const isTrusted = await contract.trustedPaymasters(paymasterAddress);
      if (!isTrusted) throw new Error('Untrusted paymaster');

      const paymaster = new ethers.Contract(paymasterAddress, paymasterABI, provider);
      const balance = await paymaster.getBalance();
      const totalGasCost = ethers.BigNumber.from(userOp.maxFeePerGas)
        .mul(userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas);
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

async function submitUserOperation(userOp, contract, provider, logger) {
  const dbUserOp = new UserOp({ ...userOp, status: 'pending' });
  await dbUserOp.save();

  const isValid = await validateUserOp(userOp, contract, provider, logger);
  if (!isValid) {
    dbUserOp.status = 'failed';
    await dbUserOp.save();
    throw new Error('UserOp validation failed');
  }

  dbUserOp.status = 'validated';
  await dbUserOp.save();

  try {
    const tx = await contract.executeUserOp(userOp);
    await tx.wait();
    dbUserOp.txHash = tx.hash;
    dbUserOp.status = 'submitted';
    await dbUserOp.save();
    return tx.hash;
  } catch (error) {
    dbUserOp.status = 'failed';
    await dbUserOp.save();
    throw error;
  }
}

module.exports = { createUserOperation, submitUserOperation };
