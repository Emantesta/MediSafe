// routes/admin.js
const express = require('express');
const router = express.Router();
const UserOp = require('../models/UserOp');
const AuditLog = require('../models/AuditLog');
const { authMiddleware, submitUserOperation } = require('./utils');

module.exports = (wallet, contract, provider, logger, redisClient) => {
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
      // Check Redis cache
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.info(`Cache hit for ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }

      // Fetch from MongoDB
      const userOps = await UserOp.find(query)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });
      const total = await UserOp.countDocuments(query);

      const response = { userOps, total };

      // Cache result for 5 minutes (300 seconds)
      await redisClient.setEx(cacheKey, 300, JSON.stringify(response));
      logger.info(`Cache set for ${cacheKey}`);

      res.json(response);
    } catch (error) {
      logger.error('UserOps fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch UserOps' });
    }
  });

  // Retry Failed UserOp
  router.post('/userops/:id/retry', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;

    try {
      const userOp = await UserOp.findById(id);
      if (!userOp || userOp.status !== 'failed') return res.status(400).json({ error: 'Invalid UserOp or not failed' });

      const txHash = await submitUserOperation(userOp.toObject(), contract, provider, logger);
      await new AuditLog({
        adminAddress: req.user.address,
        action: 'retry_userop',
        details: `Retried UserOp ${id}, new txHash: ${txHash}`,
      }).save();

      // Invalidate cache for affected queries
      const keys = await redisClient.keys('userops:*');
      for (const key of keys) await redisClient.del(key);

      res.json({ txHash });
    } catch (error) {
      logger.error('Retry UserOp error:', error);
      res.status(500).json({ error: 'Retry failed' });
    }
  });

  // Mark as Resolved
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

      // Invalidate cache for affected queries
      const keys = await redisClient.keys('userops:*');
      for (const key of keys) await redisClient.del(key);

      res.json({ message: 'UserOp marked as resolved', userOp });
    } catch (error) {
      logger.error('Resolve UserOp error:', error);
      res.status(500).json({ error: 'Resolve failed' });
    }
  });

  router.post('/fund-paymaster', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  // Funding logic here
});

  return router;
};
