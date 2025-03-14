const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const FundingHistory = require('../models/FundingHistory');
const mongoose = require('mongoose');
const User = require('../models/User');
const UserOp = require('../models/UserOp');
const AuditLog = require('../models/AuditLog');
const { authMiddleware, submitUserOperation } = require('./utils');
const authMiddleware = require('./utils').authMiddleware;
const config = require('../config');

// AuditLog Model (ideally moved to models/AuditLog.js)
const AuditLogSchema = new mongoose.Schema({
  adminAddress: String,
  action: String,
  details: String,
  timestamp: { type: Date, default: Date.now },
});
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

module.exports = (wallet, contract, provider, logger, redisClient) => {
     router.get('/paymaster-status', authMiddleware, async (req, res) => {
     if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

     const cacheKey = 'paymaster_status';
     try {
      // Check Redis cache
       const cached = await redisClient.get(cacheKey);
       if (cached) {
        logger.info('Cache hit for paymaster status');
        return res.json(JSON.parse(cached));
      }
  
  // Audit Logs
    router.get('/audit-logs', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    try {
      const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100);
      res.json({ logs });
    } catch (error) {
      logger.error('Audit logs fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // Enhanced /userop-status/:txHash
 router.get('/userop-status/:txHash', authMiddleware, async (req, res) => {
   if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
   const { txHash } = req.params;

   try {
     const userOp = await UserOp.findOne({ txHash });
     if (!userOp) return res.status(404).json({ error: 'UserOp not found' });
     res.json({ status: userOp.status, userOp });
   } catch (error) {
     logger.error('UserOp status error:', error);
     res.status(500).json({ error: 'Status check failed' });
   }
 });
   
   // UserOps Management
  router.get('/userops', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { page = 1, limit = 10, status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { txHash: { $regex: search, $options: 'i' } },
        { sender: { $regex: search, $options: 'i' } },
      ];
    }

    const cacheKey = `userops:${page}:${limit}:${status || 'all'}:${search || 'none'}`;
    try {
      const cached = await client.get(`userops:${page}:${status}:${search}`);
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.info(`Cache hit for ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }

      const userOps = await UserOp.find(query)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });
      const total = await UserOp.countDocuments(query);

      const response = { userOps, total };
      await client.setEx(`userops:${page}:${status}:${search}`, 300, JSON.stringify({ userOps, total }));
      await redisClient.setEx(cacheKey, 300, JSON.stringify(response));
      logger.info(`Cache set for ${cacheKey}`);

      res.json(response);
    } catch (error) {
      logger.error('UserOps fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch UserOps' });
    }
  });

  router.post('/userops/:id/retry', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;

    try {
      const userOp = await UserOp.findById(id);
      if (!userOp || userOp.status !== 'failed') {
        return res.status(400).json({ error: 'Invalid UserOp or not failed' });
      }

      const txHash = await submitUserOperation(userOp.toObject(), contract, provider, logger);
      await new AuditLog({
        adminAddress: req.user.address,
        action: 'retry_userop',
        details: `Retried UserOp ${id}, new txHash: ${txHash}`,
      }).save();

      const keys = await redisClient.keys('userops:*');
      for (const key of keys) await redisClient.del(key);

      res.json({ txHash });
    } catch (error) {
      logger.error('Retry UserOp error:', error);
      res.status(500).json({ error: 'Retry failed' });
    }
  });

  router.post('/userops/:id/resolve', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;

    try {
      const userOp = await UserOp.findByIdAndUpdate(id, { status: 'resolved' }, { new: true });
      if (!userOp) return res.status(404).json({ error: 'UserOp not found' });

      await new AuditLog({
        adminAddress: req.user.address,
        action: 'resolve_userop',
        details: `Marked UserOp ${id} as resolved`,
      }).save();

      const keys = await redisClient.keys('userops:*');
      for (const key of keys) await redisClient.del(key);

      res.json({ message: 'UserOp marked as resolved', userOp });
    } catch (error) {
      logger.error('Resolve UserOp error:', error);
      res.status(500).json({ error: 'Resolve failed' });
    }
  });

  // User Management
  router.get('/users/:address', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  const { address } = req.params;

  try {
    const user = await User.findOne({ address });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userOps = await UserOp.find({ sender: address }).sort({ createdAt: -1 }).limit(10);
    const appointments = await contract.getPatientAppointments(address);
    const labTests = user.role === 'patient' || user.role === 'lab' 
      ? await Promise.all((await UserOp.find({ sender: address, callData: /orderLabTest/ })).map(async op => {
          const id = ethers.utils.defaultAbiCoder.decode(['uint256'], op.callData.slice(-64))[0];
          return await contract.getLabTestDetails(id);
        }))
      : [];
    const prescriptions = user.role === 'patient' || user.role === 'pharmacy' 
      ? await Promise.all((await UserOp.find({ sender: address, callData: /verifyPrescription/ })).map(async op => {
          const id = ethers.utils.defaultAbiCoder.decode(['uint256'], op.callData.slice(-64))[0];
          return await contract.getPrescriptionDetails(id);
        }))
      : [];

    res.json({
      info: {
        address: user.address,
        role: user.role,
        registrationDate: user.registrationDate,
        verificationStatus: user.verificationStatus,
        dataMonetization: user.role === 'patient' ? (await contract.getPatientDataStatus(address))[0] === 1 : null,
      },
      userOps,
      appointments,
      labTests,
      prescriptions,
    });
  } catch (error) {
    logger.error('User details fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

  router.get('/users', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { page = 1, limit = 10, role, status } = req.query;
    const query = {};
    if (role) query.role = role;
    if (status) query.verificationStatus = status;

    try {
      const users = await User.find(query)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ registrationDate: -1 });
      const total = await User.countDocuments(query);

      const enrichedUsers = await Promise.all(
        users.map(async (user) => {
          const nonce = await contract.nonces(user.address);
          const dataStatus = await contract.getPatientDataStatus(user.address).catch(() => [0, 0]);
          return {
            address: user.address,
            role: user.role,
            registrationDate: user.registrationDate,
            verificationStatus: user.verificationStatus,
            lastActivity: user.lastActivity || null,
            nonce: nonce.toString(),
            dataMonetization: user.role === 'patient' ? dataStatus[0] === 1 : null,
          };
        })
      );

      res.json({ users: enrichedUsers, total });
    } catch (error) {
      logger.error('User list fetch error:', error);
      res.status(500).json1 json({ error: 'Failed to fetch users' });
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Action: Reset Nonce (mocked; requires contract support)
  router.post('/users/:address/reset-nonce', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin || req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin access required' });
    const { address } = req.params;
    // Implement contract call if supported, otherwise just log
    await new AuditLog({ adminAddress: req.user.address, action: 'reset_nonce', details: `Reset nonce for ${address}` }).save();
    res.json({ message: 'Nonce reset requested' });
  });
 
  router.post('/users/verify', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const { address, role, verificationData } = req.body;

    try {
      let callData;
      if (role === 'doctor') callData = contract.interface.encodeFunctionData('verifyDoctor', [address, verificationData, 0]);
      else if (role === 'lab') callData = contract.interface.encodeFunctionData('verifyLabTechnician', [address, verificationData]);
      else if (role === 'pharmacy') callData = contract.interface.encodeFunctionData('registerPharmacy', [address, verificationData]);
      else return res.status(400).json({ error: 'Invalid role' });

      const userOp = {
        sender: wallet.address,
        nonce: await contract.nonces(wallet.address),
        callData,
        callGasLimit: 200000,
        verificationGasLimit: 100000,
        preVerificationGas: 21000,
        maxFeePerGas: ethers.utils.parseUnits('10', 'gwei').toString(),
        maxPriorityFeePerGas: ethers.utils.parseUnits('1', 'gwei').toString(),
        paymasterAndData: config.blockchain.paymasterAddress + '00',
        signature: '0x', // Dummy; sign properly in production
      };
      const txHash = await submitUserOperation(userOp, contract, provider, logger);

      await User.updateOne({ address }, { verificationStatus: 'verified' });
      await new AuditLog({
        adminAddress: req.user.address,
        action: `verify_${role}`,
        details: `Verified ${address}`,
      }).save();

      res.json({ txHash });
    } catch (error) {
      logger.error('User verification error:', error);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

    // Action: Deactivate User
  router.post('/users/deactivate', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const { address } = req.body;

    try {
      await User.updateOne({ address }, { verificationStatus: 'deactivated' });
      await new AuditLog({
        adminAddress: req.user.address,
        action: 'deactivate_user',
        details: `Deactivated ${address}`,
      }).save();
      res.json({ message: 'User deactivated' });
    } catch (error) {
      logger.error('User deactivation error:', error);
      res.status(500).json({ error: 'Deactivation failed' });
    }
  });

  router.post('/users/:address/ban', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin || req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin access required' });
  const { address } = req.params;
  await User.updateOne({ address }, { verificationStatus: 'deactivated' });
  await new AuditLog({ adminAddress: req.user.address, action: 'ban_user', details: `Banned ${address}` }).save();
  res.json({ message: 'User banned' });
});

  // Action: Update Trusted Paymasters
  router.post('/paymaster/trusted', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin || req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin access required' });
    const { action, address } = req.body; // action: 'add' or 'remove'

    try {
      let callData;
      if (action === 'add') callData = contract.interface.encodeFunctionData('addTrustedPaymaster', [address]);
      else if (action === 'remove') callData = contract.interface.encodeFunctionData('removeTrustedPaymaster', [address]);
      else return res.status(400).json({ error: 'Invalid action' });
      const userOp = {
        sender: wallet.address,
        nonce: await contract.nonces(wallet.address),
        callData,
        callGasLimit: 200000,
        verificationGasLimit: 100000,
        preVerificationGas: 21000,
        maxFeePerGas: ethers.utils.parseUnits('10', 'gwei').toString(),
        maxPriorityFeePerGas: ethers.utils.parseUnits('1', 'gwei').toString(),
        paymasterAndData: config.blockchain.paymasterAddress + '00',
        signature: '0x', // Dummy; sign properly in production
      };
      const txHash = await submitUserOperation(userOp, contract, provider, logger);

      await new AuditLog({
        adminAddress: req.user.address,
        action: `${action}_trusted_paymaster`,
        details: `${action === 'add' ? 'Added' : 'Removed'} ${address} as trusted paymaster, txHash: ${txHash}`,
      }).save();

      await redisClient.del('paymaster_status');
      res.json({ txHash });
    } catch (error) {
      logger.error('Update trusted paymasters error:', error);
      res.status(500).json({ error: 'Update failed' });
    }
  });
       
  // Paymaster Management
  router.post('/fund-paymaster', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin || req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    const { amount } = req.body;

    try {
      const tx = await wallet.sendTransaction({
        to: config.blockchain.paymasterAddress,
        value: ethers.utils.parseEther(amount),
      });
      // Invalidate cache
      await redisClient.del('paymaster_status');
      wss.clients.forEach(client => client.send(JSON.stringify({ type: 'paymasterUpdate', data: { balance: amount } })));
      await new AuditLog({
        adminAddress: req.user.address,
        action: 'fund_paymaster',
        details: `Added ${amount} ETH to paymaster, txHash: ${receipt.transactionHash}`,
      }).save();
      res.json({ txHash: tx.hash });
    } catch (error) {
      logger.error('Fund paymaster error:', error);
      res.status(500).json({ error: 'Funding failed' });
    }
  });

   // Fetch current paymaster and balance
      const paymasterAddress = config.blockchain.paymasterAddress; // Or await contract.paymaster() if dynamic
      const paymasterContract = new ethers.Contract(paymasterAddress, ['function getBalance() view returns (uint256)'], provider);
      const balance = ethers.utils.formatEther(await paymasterContract.getBalance());
      // Fetch trusted paymasters (assumes contract function exists)
      const trustedPaymasters = await contract.trustedPaymasters().catch(() => [paymasterAddress]); // Fallback to current if not implemented

      // Fetch funding history
      const fundingHistory = await FundingHistory.find().sort({ timestamp: -1 }).limit(50);

      const response = {
        paymaster: { address: paymasterAddress, balance },
        trustedPaymasters,
        fundingHistory,
      };
         // Cache for 1 minute
        await redisClient.setEx(cacheKey, 60, JSON.stringify(response));
        res.json(response);
     }  catch (error) {
        logger.error('Paymaster status fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch paymaster status' });
     } 
  });

  return router;
};
