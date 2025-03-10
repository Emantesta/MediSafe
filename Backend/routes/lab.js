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
  router.post('/order-lab-test', authMiddleware, async (req, res) => {
    const { patientAddress, testType } = req.body;
    try {
      const callData = contract.interface.encodeFunctionData('orderLabTest', [patientAddress, testType]);
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('Lab test order error:', error);
      res.status(500).json({ error: 'Order failed' });
    }
  });

  router.post('/collect-sample', authMiddleware, async (req, res) => {
    const { labTestId, ipfsHash } = req.body;
    try {
      const callData = contract.interface.encodeFunctionData('collectSample', [labTestId, ipfsHash]);
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('Sample collection error:', error);
      res.status(500).json({ error: 'Collection failed' });
    }
  });

  router.post('/upload-lab-results', authMiddleware, async (req, res) => {
    const { labTestId, resultsIpfsHash } = req.body;
    try {
      const callData = contract.interface.encodeFunctionData('uploadLabResults', [labTestId, resultsIpfsHash]);
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('Results upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  router.post('/review-lab-results', authMiddleware, async (req, res) => {
    const { labTestId, medicationDetails, prescriptionIpfsHash } = req.body;
    try {
      const callData = contract.interface.encodeFunctionData('reviewLabResults', [labTestId, medicationDetails, prescriptionIpfsHash]);
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('Lab results review error:', error);
      res.status(500).json({ error: 'Review failed' });
    }
  });

  router.get('/lab-test/:id', async (req, res) => {
    try {
      const labTest = await contract.getLabTestDetails(req.params.id);
      res.json({ labTest });
    } catch (error) {
      logger.error('Lab test fetch error:', error);
      res.status(500).json({ error: 'Fetch failed' });
    }
  });

  return router;
};
