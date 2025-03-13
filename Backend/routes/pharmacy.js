const express = require('express');
const { createUserOperation, submitUserOperation } = require('./utils');
const QRCode = require('qrcode');
const router = express.Router();

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) throw new Error('Token required');
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    req.logger.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = (wallet, contract, logger) => {
  router.post('/verify-prescription', authMiddleware, async (req, res) => {
    const { prescriptionId, verificationCodeHash } = req.body;
    try {
      const callData = contract.interface.encodeFunctionData('verifyPrescription', [prescriptionId, ethers.utils.hexlify(verificationCodeHash)]);
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('Prescription verification error:', error);
      res.status(500).json({ error: 'Verification failed' });
    }
  });
  
  router.post('/fund-paymaster', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  // Funding logic here
});

  router.post('/fulfill-prescription', authMiddleware, async (req, res) => {
    const { prescriptionId } = req.body;
    try {
      const callData = contract.interface.encodeFunctionData('fulfillPrescription', [prescriptionId]);
      const userOp = await createUserOperation(req.user.address, callData, wallet, contract);
      const txHash = await submitUserOperation(userOp);
      res.json({ txHash });
    } catch (error) {
      logger.error('Prescription fulfillment error:', error);
      res.status(500).json({ error: 'Fulfillment failed' });
    }
  });

  router.get('/generate-qr/:prescriptionId', authMiddleware, async (req, res) => {
    try {
      const prescription = await contract.getPrescriptionDetails(req.params.prescriptionId);
      const qrData = JSON.stringify({
        id: prescription[0].toString(),
        verificationCodeHash: ethers.utils.hexlify(prescription[3])
      });
      const qrCode = await QRCode.toDataURL(qrData);
      res.json({ qrCode });
    } catch (error) {
      logger.error('QR generation error:', error);
      res.status(500).json({ error: 'QR generation failed' });
    }
  });

  router.get('/prescription/:id', async (req, res) => {
    try {
      const prescription = await contract.getPrescriptionDetails(req.params.id);
      res.json({ prescription });
    } catch (error) {
      logger.error('Prescription fetch error:', error);
      res.status(500).json({ error: 'Fetch failed' });
    }
  });

  return router;
};
