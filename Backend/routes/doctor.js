const express = require('express');
const { createUserOperation, submitUserOperation } = require('./utils');
const router = express.Router();

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) throw new Error('Token required');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    req.logger.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = (wallet, contract, logger) => {
  router.post('/confirm-appointment', authMiddleware, async (req, res) => {
    const { appointmentId } = req.body;
    try {
      const callData = contract.interface.encodeFunctionData('confirmAppointment', [appointmentId]);
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('Confirmation error:', error);
      res.status(500).json({ error: 'Confirmation failed' });
    }
  });

  router.post('/review-ai-analysis', authMiddleware, async (req, res) => {
    const { aiAnalysisId, analysisIpfsHash } = req.body;
    try {
      const callData = contract.interface.encodeFunctionData('reviewAISymptomAnalysis', [aiAnalysisId, analysisIpfsHash]);
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('AI review error:', error);
      res.status(500).json({ error: 'Review failed' });
    }
  });

  router.get('/ai-analysis/:id', async (req, res) => {
    try {
      const analysis = await contract.getAIAnalysisDetails(req.params.id);
      res.json({ analysis });
    } catch (error) {
      logger.error('AI analysis fetch error:', error);
      res.status(500).json({ error: 'Fetch failed' });
    }
  });

  return router;
};
