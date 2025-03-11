// routes/admin.js
const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const UserOp = require('../models/UserOp');

const authMiddleware = require('./utils').authMiddleware;

router.get('/dashboard', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

  try {
    // System Health
    const health = {
      server: { status: 'ok', uptime: process.uptime() },
      mongo: { status: mongoose.connection.readyState === 1 ? 'ok' : 'down' },
      ipfs: { status: await checkIpfs() ? 'ok' : 'down' }, // Custom function
      blockchain: { status: await provider.getNetwork().then(() => 'ok').catch(() => 'down') },
    };

    // Total Registered Users (mocked; extend with contract calls if tracking on-chain)
    const users = {
      patients: await contract.queryFilter('PatientRegistered').then(events => events.length),
      doctors: await contract.queryFilter('DoctorVerified').then(events => events.length),
      labs: await contract.queryFilter('LabTechnicianVerified').then(events => events.length),
      pharmacies: await contract.queryFilter('PharmacyRegistered').then(events => events.length),
    };

    // Recent UserOps (last 24 hours)
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const userOps = await UserOp.find({ createdAt: { $gte: last24h } });
    const totalUserOps = userOps.length;
    const successUserOps = userOps.filter(op => op.status === 'submitted').length;
    const failureRate = totalUserOps ? ((totalUserOps - successUserOps) / totalUserOps * 100).toFixed(2) : 0;

    // Blockchain Sync
    const blockNumber = await provider.getBlockNumber();
    const gasPrice = ethers.utils.formatUnits(await provider.getGasPrice(), 'gwei');

    // Paymaster Status
    const paymasterAddress = await contract.paymaster();
    const paymasterBalance = ethers.utils.formatEther(await paymasterContract.getBalance());

    // Alerts
    const alerts = [];
    if (parseFloat(paymasterBalance) < 0.1) alerts.push('Low paymaster balance: ' + paymasterBalance + ' ETH');
    if (failureRate > 10) alerts.push(`High UserOp failure rate: ${failureRate}%`);

    res.json({
      health,
      users,
      userOps: { total: totalUserOps, successRate: 100 - failureRate, failureRate },
      blockchain: { blockNumber, gasPrice },
      paymaster: { address: paymasterAddress, balance: paymasterBalance },
      alerts,
    });
  } catch (error) {
    logger.error('Dashboard fetch error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// Mock IPFS check (implement based on your IPFS setup)
async function checkIpfs() {
  try {
    await ipfs.version();
    return true;
  } catch {
    return false;
  }
}

module.exports = router;
