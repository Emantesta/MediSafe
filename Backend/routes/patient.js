const express = require('express');
const { createUserOperation, submitUserOperation } = require('./utils');
const tf = require('@tensorflow/tfjs-node');
const { create } = require('ipfs-http-client');
const router = express.Router();

const ipfs = create({ host: 'ipfs.infura.io', port: 5001, protocol: 'https' });

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

async function analyzeSymptoms(symptoms) {
  const tensor = tf.tensor([symptoms.split(' ').length]);
  const prediction = tensor.add(0.5);
  return { diagnosis: "Possible condition based on: " + symptoms, confidence: prediction.dataSync()[0] };
}

module.exports = (wallet, contract, wss, logger) => {
  router.post('/register-patient', authMiddleware, async (req, res) => {
    try {
      const callData = contract.interface.encodeFunctionData('registerPatient', [req.body.encryptedSymmetricKey]);
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  router.post('/book-appointment', authMiddleware, async (req, res) => {
    const { doctorAddress, timestamp, paymentType, isVideoCall, videoCallLink, userOp } = req.body;
    try {
      if (userOp) {
        const txHash = await submitUserOperation(userOp);
        wss.clients.forEach(client => client.send(JSON.stringify({ type: 'appointment', id: txHash })));
        res.json({ txHash });
      } else {
        const callData = contract.interface.encodeFunctionData('bookAppointment', [
          doctorAddress, timestamp, paymentType, isVideoCall, videoCallLink || ""
        ]);
        const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
        const txHash = await submitUserOperation(userOp);
        wss.clients.forEach(client => client.send(JSON.stringify({ type: 'appointment', id: txHash })));
        res.json({ txHash });
      }
    } catch (error) {
      logger.error('Booking error:', error);
      res.status(500).json({ error: 'Booking failed' });
    }
  });

  router.post('/analyze-symptoms', authMiddleware, async (req, res) => {
    const { symptoms, userOp } = req.body;
    try {
      if (userOp) {
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
      } else {
        const analysis = await analyzeSymptoms(symptoms);
        const ipfsResult = await ipfs.add(JSON.stringify(analysis));
        const callData = contract.interface.encodeFunctionData('requestAISymptomAnalysis', [symptoms]);
        const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash, ipfsHash: ipfsResult.path });
      }
    } catch (error) {
      logger.error('Symptom analysis error:', error);
      res.status(500).json({ error: 'Analysis failed' });
    }
  });

  router.post('/toggle-data-monetization', authMiddleware, async (req, res) => {
    const { enable } = req.body;
    try {
      const callData = contract.interface.encodeFunctionData('toggleDataMonetization', [enable]);
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('Data monetization toggle error:', error);
      res.status(500).json({ error: 'Toggle failed' });
    }
  });

  router.post('/claim-data-reward', authMiddleware, async (req, res) => {
    try {
      const callData = contract.interface.encodeFunctionData('claimDataReward');
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('Reward claim error:', error);
      res.status(500).json({ error: 'Claim failed' });
    }
  });

  router.get('/appointments/:address', authMiddleware, async (req, res) => {
    try {
      const appointments = await contract.getPatientAppointments(req.params.address);
      res.json({ appointments });
    } catch (error) {
      logger.error('Appointments fetch error:', error);
      res.status(500).json({ error: 'Fetch failed' });
    }
  });

  router.get('/data-status/:address', async (req, res) => {
    try {
      const [dataSharing, lastRewardTimestamp] = await contract.getPatientDataStatus(req.params.address);
      res.json({ dataSharing: dataSharing === 1, lastRewardTimestamp });
    } catch (error) {
      logger.error('Data status fetch error:', error);
      res.status(500).json({ error: 'Fetch failed' });
    }
  });

  return router;
};
