const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = (provider, logger, redisClient, wss) => {
  router.get('/health', async (req, res) => {
    try {
      // Server uptime
      const uptime = process.uptime();
      const lastRestart = new Date(Date.now() - uptime * 1000);

      // MongoDB status
      const mongoStatus = mongoose.connection.readyState === 1 ? 'Up' : 'Down';

      // IPFS status (mocked; replace with actual check)
      const ipfsStatus = await checkIpfs() ? 'Up' : 'Down';

      // Blockchain RPC status
      const blockchainStatus = await provider.getNetwork()
        .then(() => 'Up')
        .catch(() => 'Down');

      // WebSocket status
      const wsStatus = wss.clients.size > 0 ? 'Up' : 'Down'; // Simplified; refine as needed

      // Resource usage (Docker stats if containerized)
      let resources = { cpu: 'N/A', memory: 'N/A', disk: 'N/A' };
      try {
        const { stdout } = await execPromise('docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}}" telemedicine_app');
        const [cpu, memUsage] = stdout.trim().split(',');
        const [usedMem, totalMem] = memUsage.split('/');
        resources = {
          cpu: cpu.replace('%', ''),
          memory: `${usedMem.trim()} / ${totalMem.trim()}`,
          disk: await getDiskUsage(), // Custom function
        };
      } catch (error) {
        logger.warn('Docker stats unavailable:', error.message);
      }

      // Alerts (example logic)
      const alerts = [];
      if (mongoStatus === 'Down') alerts.push({ message: 'MongoDB is down', timestamp: new Date() });
      if (blockchainStatus === 'Down') alerts.push({ message: 'Blockchain RPC is down', timestamp: new Date() });
      if (ipfsStatus === 'Down') alerts.push({ message: 'IPFS is down', timestamp: new Date() });
      if (wsStatus === 'Down') alerts.push({ message: 'WebSocket is down', timestamp: new Date() });
      if (resources.cpu !== 'N/A' && parseFloat(resources.cpu) > 80) {
        alerts.push({ message: 'High CPU usage detected', timestamp: new Date() });
      }

      const response = {
        status: {
          server: 'Up',
          mongo: mongoStatus,
          ipfs: ipfsStatus,
          blockchain: blockchainStatus,
          websocket: wsStatus,
        },
        resources,
        uptime: uptime.toFixed(2), // In seconds
        lastRestart,
        alerts,
      };

      // Cache for 10 seconds
      await redisClient.setEx('health_status', 10, JSON.stringify(response));
      res.json(response);
    } catch (error) {
      logger.error('Health check error:', error);
      res.status(500).json({ error: 'Health check failed' });
    }
  });

  async function checkIpfs() {
    // Replace with actual IPFS health check (e.g., ipfs.id())
    return true; // Mocked
  }

  async function getDiskUsage() {
    try {
      const { stdout } = await execPromise('df -h / | tail -n 1');
      const [, , used, avail] = stdout.trim().split(/\s+/);
      return `${used} / ${avail}`;
    } catch {
      return 'N/A';
    }
  }

  return router;
};
