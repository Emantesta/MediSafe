const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const readline = require('readline');
const User = require('../models/User');
const UserOp = require('../models/UserOp');
const FundingHistory = require('../models/FundingHistory');
const AuditLog = require('../models/AuditLog');
const EventLog = require('../models/EventLog');
const ResourceUsage = require('../models/ResourceUsage');
const { authMiddleware, submitUserOperation } = require('./utils');
const config = require('../config');
const { Parser } = require('json2csv');

module.exports = (wallet, contract, provider, logger, redisClient) => {
  // Middleware for all routes
  router.use(authMiddleware);

  // Paymaster Management
  router.get('/paymaster-status', async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    
    const cacheKey = 'paymaster_status';
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.info('Cache hit for paymaster status');
        return res.json(JSON.parse(cached));
      }

      const paymasterAddress = config.blockchain.paymasterAddress;
      const paymasterContract = new ethers.Contract(paymasterAddress, ['function getBalance() view returns (uint256)'], provider);
      const balance = ethers.utils.formatEther(await paymasterContract.getBalance());
      const trustedPaymasters = await contract.trustedPaymasters().catch(() => [paymasterAddress]);
      const fundingHistory = await FundingHistory.find().sort({ timestamp: -1 }).limit(50);

      const response = { paymaster: { address: paymasterAddress, balance }, trustedPaymasters, fundingHistory };
      await redisClient.setEx(cacheKey, 60, JSON.stringify(response));
      res.json(response);
    } catch (error) {
      logger.error('Paymaster status fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch paymaster status' });
    }
  });

  router.post('/fund-paymaster', async (req, res) => {
    if (!req.user.isAdmin || req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    const { amount } = req.body;

    try {
      const tx = await wallet.sendTransaction({
        to: config.blockchain.paymasterAddress,
        value: ethers.utils.parseEther(amount),
      });
      await redisClient.del('paymaster_status');
      await new AuditLog({
        adminAddress: req.user.address,
        action: 'fund_paymaster',
        details: `Added ${amount} ETH to paymaster, txHash: ${tx.hash}`,
      }).save();
      res.json({ txHash: tx.hash });
    } catch (error) {
      logger.error('Fund paymaster error:', error);
      res.status(500).json({ error: 'Funding failed' });
    }
  });

  router.post('/paymaster/trusted', async (req, res) => {
    if (!req.user.isAdmin || req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    const { action, address } = req.body;

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
        signature: '0x',
      };
      const txHash = await submitUserOperation(userOp, contract, provider, logger, wss);

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

  // Audit Logs
  router.get('/audit-logs', async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    try {
      const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100);
      res.json({ logs });
    } catch (error) {
      logger.error('Audit logs fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // UserOp Management
  router.get('/userop-status/:txHash', async (req, res) => {
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

  router.get('/userops', async (req, res) => {
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
        return res.json(JSON.decode(cached));
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

  router.post('/userops/:id/retry', async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;

    try {
      const userOp = await UserOp.findById(id);
      if (!userOp || userOp.status !== 'failed') {
        return res.status(400).json({ error: 'Invalid UserOp or not failed' });
      }

      const txHash = await submitUserOperation(userOp.toObject(), contract, provider, logger, wss);
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

  router.post('/userops/:id/resolve', async (req, res) => {
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
  router.get('/users', async (req, res) => {
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
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  router.get('/users/:address', async (req, res) => {
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

  router.post('/users/verify', async (req, res) => {
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
        signature: '0x',
      };
      const txHash = await submitUserOperation(userOp, contract, provider, logger, wss);

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

  router.post('/users/deactivate', async (req, res) => {
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

  router.post('/users/:address/ban', async (req, res) => {
    if (!req.user.isAdmin || req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    const { address } = req.params;

    try {
      await User.updateOne({ address }, { verificationStatus: 'deactivated' });
      await new AuditLog({
        adminAddress: req.user.address,
        action: 'ban_user',
        details: `Banned ${address}`,
      }).save();
      res.json({ message: 'User banned' });
    } catch (error) {
      logger.error('User ban error:', error);
      res.status(500).json({ error: 'Ban failed' });
    }
  });

  router.post('/users/:address/reset-nonce', async (req, res) => {
    if (!req.user.isAdmin || req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    const { address } = req.params;

    try {
      await new AuditLog({
        adminAddress: req.user.address,
        action: 'reset_nonce',
        details: `Reset nonce for ${address}`,
      }).save();
      res.json({ message: 'Nonce reset requested' });
    } catch (error) {
      logger.error('Nonce reset error:', error);
      res.status(500).json({ error: 'Nonce reset failed' });
    }
  });

  // Event Logs
  router.get('/events', async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { page = 1, limit = 10, eventName, startTime, endTime, userAddress, exportCsv } = req.query;
    const query = {};
    if (eventName) query.eventName = eventName;
    if (startTime || endTime) query.timestamp = {};
    if (startTime) query.timestamp.$gte = new Date(parseInt(startTime));
    if (endTime) query.timestamp.$lte = new Date(parseInt(endTime));
    if (userAddress) query['data.userAddress'] = { $regex: userAddress, $options: 'i' };

    const cacheKey = `events:${page}:${limit}:${eventName || 'all'}:${startTime || 'none'}:${endTime || 'none'}:${userAddress || 'none'}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached && !exportCsv) {
        logger.info(`Cache hit for ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }

      let events = await EventLog.find(query)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ timestamp: -1 });
      let total = await EventLog.countDocuments(query);

      if (!events.length && !query.eventName) {
        const filter = contract.filters[eventName] ? contract.filters[eventName](userAddress || null) : null;
        events = await contract.queryFilter(filter || '*', 0, 'latest');
        events = events.map(event => ({
          eventName: event.event,
          blockNumber: event.blockNumber,
          timestamp: new Date((await provider.getBlock(event.blockNumber)).timestamp * 1000),
          data: event.args,
          transactionHash: event.transactionHash,
        })).filter(e => (!userAddress || JSON.stringify(e.data).includes(userAddress)) &&
                       (!startTime || e.timestamp >= new Date(parseInt(startTime))) &&
                       (!endTime || e.timestamp <= new Date(parseInt(endTime))))
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice((page - 1) * limit, page * limit);
        total = events.length;
      }

      const response = { events, total };

      if (exportCsv) {
        const fields = ['eventName', 'blockNumber', 'timestamp', 'data', 'transactionHash'];
        const csv = new Parser({ fields }).parse(events);
        res.header('Content-Type', 'text/csv');
        res.attachment('events.csv');
        return res.send(csv);
      }

      await redisClient.setEx(cacheKey, 300, JSON.stringify(response));
      res.json(response);
    } catch (error) {
      logger.error('Events fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  // Resource Usage
  router.get('/resource-usage', async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    try {
      const usage = await ResourceUsage.find().sort({ timestamp: -1 }).limit(50);
      res.json({ usage });
    } catch (error) {
      logger.error('Resource usage fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch resource usage' });
    }
  });

  // Logs Management
  router.get('/logs', async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { page = 1, limit = 10, level, startTime, endTime, keyword, download } = req.query;
    const cacheKey = `logs:${page}:${limit}:${level || 'all'}:${startTime || 'none'}:${endTime || 'none'}:${keyword || 'none'}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached && !download) {
        logger.info(`Cache hit for ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }

      const logs = [];
      const fileStream = require('fs').createReadStream('logs/combined.log');
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      for await (const line of rl) {
        const log = JSON.parse(line);
        if (level && log.level !== level) continue;
        if (startTime && new Date(log.timestamp) < new Date(parseInt(startTime))) continue;
        if (endTime && new Date(log.timestamp) > new Date(parseInt(endTime))) continue;
        if (keyword && !log.message.toLowerCase().includes(keyword.toLowerCase())) continue;
        logs.push(log);
      }

      const total = logs.length;
      const paginatedLogs = logs
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice((page - 1) * limit, page * limit);

      if (download) {
        const logText = logs.map(log => `${log.timestamp} [${log.level}] ${log.message}`).join('\n');
        res.header('Content-Type', 'text/plain');
        res.attachment('logs.txt');
        return res.send(logText);
      }

      const response = { logs: paginatedLogs, total };
      await redisClient.setEx(cacheKey, 300, JSON.stringify(response));
      res.json(response);
    } catch (error) {
      logger.error('Log fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  return router;
};
