const express = require('express');
const router = express.Router();
const LabTest = require('../models/LabTest');
const { authMiddleware } = require('./utils');
const fetch = require('node-fetch'); // For IPFS retrieval

module.exports = (wallet, contract, provider, logger, redisClient, wss) => {
  router.get('/lab-tests', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { page = 1, limit = 10, status, startTime, endTime } = req.query;
    const query = {};
    if (status) query.status = status;
    if (startTime || endTime) query.orderedAt = {};
    if (startTime) query.orderedAt.$gte = new Date(parseInt(startTime));
    if (endTime) query.orderedAt.$lte = new Date(parseInt(endTime));

    const cacheKey = `lab-tests:${page}:${limit}:${status || 'all'}:${startTime || 'none'}:${endTime || 'none'}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.info(`Cache hit for ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }

      const labTests = await LabTest.find(query)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ orderedAt: -1 });
      const total = await LabTest.countDocuments(query);

      const response = { labTests, total };
      await redisClient.setEx(cacheKey, 300, JSON.stringify(response));
      res.json(response);
    } catch (error) {
      logger.error('Lab tests fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch lab tests' });
    }
  });

  router.get('/lab-test/:id', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;

    try {
      const labTest = await LabTest.findOne({ testId: id });
      if (!labTest) return res.status(404).json({ error: 'Lab test not found' });

      let details = { ...labTest._doc };
      if (labTest.ipfsHash && labTest.status === 'uploaded' || labTest.status === 'reviewed') {
        const ipfsResponse = await fetch(`${config.ipfs.gateway}/${labTest.ipfsHash}`);
        details.results = await ipfsResponse.text(); // Assuming text; adjust for binary data if needed
      }

      res.json(details);
    } catch (error) {
      logger.error('Lab test details fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch lab test details' });
    }
  });

  return router;
};
