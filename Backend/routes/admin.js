const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const UserOp = require('../models/UserOp');
const { authMiddleware, submitUserOperation } = require('./utils');
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
      await new AuditLog({
        adminAddress: req.user.address,
        action: 'fund_paymaster',
        details: `Funded ${amount} ETH to paymaster`,
      }).save();
      res.json({ txHash: tx.hash });
    } catch (error) {
      logger.error('Fund paymaster error:', error);
      res.status(500).json({ error: 'Funding failed' });
    }
  });

  return router;
};
