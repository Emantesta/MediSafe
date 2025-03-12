const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const AuditLog = require('../models/AuditLog');
const { authMiddleware, submitUserOperation } = require('./utils');

module.exports = (wallet, contract, provider, logger, redisClient, wss) => {
  router.get('/appointments', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { page = 1, limit = 10, status, startTime, endTime, userAddress } = req.query;
    const query = {};
    if (status) query.status = status;
    if (startTime || endTime) query.timestamp = {};
    if (startTime) query.timestamp.$gte = new Date(parseInt(startTime));
    if (endTime) query.timestamp.$lte = new Date(parseInt(endTime));
    if (userAddress) query.$or = [{ patientAddress: userAddress }, { doctorAddress: userAddress }];

    const cacheKey = `appointments:${page}:${limit}:${status || 'all'}:${startTime || 'none'}:${endTime || 'none'}:${userAddress || 'none'}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.info(`Cache hit for ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }

      const appointments = await Appointment.find(query)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ timestamp: -1 });
      const total = await Appointment.countDocuments(query);

      const response = { appointments, total };
      await redisClient.setEx(cacheKey, 300, JSON.stringify(response));
      res.json(response);
    } catch (error) {
      logger.error('Appointments fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch appointments' });
    }
  });

  router.post('/appointments/:id/cancel', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;

    try {
      const appointment = await Appointment.findOne({ appointmentId: id });
      if (!appointment || appointment.status === 'cancelled') {
        return res.status(400).json({ error: 'Invalid or already cancelled appointment' });
      }

      const userOp = {
        sender: wallet.address,
        nonce: await contract.nonces(wallet.address),
        callData: contract.interface.encodeFunctionData('cancelAppointment', [id]),
        callGasLimit: 200000,
        verificationGasLimit: 100000,
        preVerificationGas: 21000,
        maxFeePerGas: ethers.utils.parseUnits('10', 'gwei').toString(),
        maxPriorityFeePerGas: ethers.utils.parseUnits('1', 'gwei').toString(),
        paymasterAndData: config.blockchain.paymasterAddress + '00',
        signature: '0x', // Dummy; sign properly in production
      };
      const txHash = await submitUserOperation(userOp, contract, provider, logger);

      await Appointment.findOneAndUpdate({ appointmentId: id }, { status: 'cancelled', txHash });
      await new AuditLog({
        adminAddress: req.user.address,
        action: 'cancel_appointment',
        details: `Cancelled appointment ${id}, txHash: ${txHash}`,
      }).save();

      await redisClient.del(cacheKey);
      res.json({ txHash });
    } catch (error) {
      logger.error('Cancel appointment error:', error);
      res.status(500).json({ error: 'Cancellation failed' });
    }
  });

  router.post('/appointments/:id/reschedule', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const { id } = req.params;
    const { newTimestamp } = req.body;

    try {
      const appointment = await Appointment.findOne({ appointmentId: id });
      if (!appointment || ['cancelled', 'completed'].includes(appointment.status)) {
        return res.status(400).json({ error: 'Invalid or non-reschedulable appointment' });
      }

      const userOp = {
        sender: wallet.address,
        nonce: await contract.nonces(wallet.address),
        callData: contract.interface.encodeFunctionData('rescheduleAppointment', [id, Math.floor(new Date(newTimestamp).getTime() / 1000)]),
        callGasLimit: 200000,
        verificationGasLimit: 100000,
        preVerificationGas: 21000,
        maxFeePerGas: ethers.utils.parseUnits('10', 'gwei').toString(),
        maxPriorityFeePerGas: ethers.utils.parseUnits('1', 'gwei').toString(),
        paymasterAndData: config.blockchain.paymasterAddress + '00',
        signature: '0x', // Dummy; sign properly in production
      };
      const txHash = await submitUserOperation(userOp, contract, provider, logger);

      await Appointment.findOneAndUpdate({ appointmentId: id }, { timestamp: new Date(newTimestamp), txHash });
      await new AuditLog({
        adminAddress: req.user.address,
        action: 'reschedule_appointment',
        details: `Rescheduled appointment ${id} to ${newTimestamp}, txHash: ${txHash}`,
      }).save();

      await redisClient.del(cacheKey);
      res.json({ txHash });
    } catch (error) {
      logger.error('Reschedule appointment error:', error);
      res.status(500).json({ error: 'Rescheduling failed' });
    }
  });

  return router;
};
