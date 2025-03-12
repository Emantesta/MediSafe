const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ResourceUsage = require('../models/ResourceUsage');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = (provider, logger, redisClient, wss) => {
  router.get('/health', async (req, res) => {
    const { startTime, endTime } = req.query; // For historical data

    try {
      // Current status
      const uptime = process.uptime();
      const lastRestart = new Date(Date.now() - uptime * 1000);
      const mongoStatus = mongoose.connection.readyState === 1 ? 'Up' : 'Down';
      const ipfsStatus = await checkIpfs() ? 'Up' : 'Down';
      const blockchainStatus = await provider.getNetwork().then(() => 'Up').catch(() => 'Down');
      const wsStatus = wss.clients.size > 0 ? 'Up' : 'Down';

      // Current resource usage
      let resources = { cpu: 'N/A', memory: 'N/A', disk: 'N/A' };
      try {
        const { stdout } = await execPromise('docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}}" telemedicine_app');
        const [cpu, memUsage] = stdout.trim().split(',');
        const [usedMem, totalMem] = memUsage.split('/');
        const disk = await getDiskUsage();
        resources = {
          cpu: parseFloat(cpu.replace('%', '')),
          memory: `${parseFloat(usedMem) / 1024} / ${parseFloat(totalMem) / 1024}`, // Convert to GB
          disk: disk.split('/').map(v => v.trim()),
        };

        // Store in MongoDB
        await new ResourceUsage({
          cpu: resources.cpu,
          memoryUsed: parseFloat(usedMem) / 1024,
          memoryTotal: parseFloat(totalMem) / 1024,
          diskUsed: parseFloat(disk.split('/')[0]),
          diskTotal: parseFloat(disk.split('/')[1]),
        }).save();
      } catch (error) {
        logger.warn('Docker stats unavailable:', error.message);
      }

      // Historical resource usage
      const query = {};
      if (startTime) query.timestamp = { $gte: new Date(parseInt(startTime)) };
      if (endTime) query.timestamp.$lte = new Date(parseInt(endTime));
      const history = await ResourceUsage.find(query)
        .sort({ timestamp: 1 })
        .limit(100); // Limit to last 100 points for performance

      // Alerts
      const alerts = [];
      if (mongoStatus === 'Down') alerts.push({ message: 'MongoDB is down', timestamp: new Date() });
      if (blockchainStatus === 'Down') alerts.push({ message: 'Blockchain RPC is down', timestamp: new Date() });
      if (ipfsStatus === 'Down') alerts.push({ message: 'IPFS is down', timestamp: new Date() });
      if (wsStatus === 'Down') alerts.push({ message: 'WebSocket is down', timestamp: new Date() });
      if (resources.cpu !== 'N/A' && resources.cpu > 80) {
        alerts.push({ message: 'High CPU usage detected', timestamp: new Date() });
      }

      const response = {
        status: { server: 'Up', mongo: mongoStatus, ipfs: ipfsStatus, blockchain: blockchainStatus, websocket: wsStatus },
        resources: {
          current: resources,
          history: history.map(h => ({
            timestamp: h.timestamp,
            cpu: h.cpu,
            memoryUsed: h.memoryUsed,
            memoryTotal: h.memoryTotal,
            diskUsed: h.diskUsed,
            diskTotal: h.diskTotal,
          })),
        },
        uptime: uptime.toFixed(2),
        lastRestart,
        alerts,
      };

      await redisClient.setEx('health_status', 10, JSON.stringify(response));
      res.json(response);
    } catch (error) {
      logger.error('Health check error:', error);
      res.status(500).json({ error: 'Health check failed' });
    }
  });

  async function checkIpfs() {
    return true; // Replace with actual IPFS check
  }

  async function getDiskUsage() {
    try {
      const { stdout } = await execPromise('df -h / | tail -n 1');
      const [, , used, avail] = stdout.trim().split(/\s+/);
      return `${parseFloat(used.replace('G', ''))}/${parseFloat(avail.replace('G', ''))}`;
    } catch {
      return 'N/A/N/A';
    }
  }

  // Periodic resource collection
  setInterval(async () => {
    try {
      const { stdout } = await execPromise('docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}}" telemedicine_app');
      const [cpu, memUsage] = stdout.trim().split(',');
      const [usedMem, totalMem] = memUsage.split('/');
      const disk = await getDiskUsage();
      await new ResourceUsage({
        cpu: parseFloat(cpu.replace('%', '')),
        memoryUsed: parseFloat(usedMem) / 1024,
        memoryTotal: parseFloat(totalMem) / 1024,
        diskUsed: parseFloat(disk.split('/')[0]),
        diskTotal: parseFloat(disk.split('/')[1]),
      }).save();
      wss.clients.forEach(client => client.send(JSON.stringify({ type: 'resourceUpdate', data: { cpu: parseFloat(cpu.replace('%', '')), memoryUsed: parseFloat(usedMem) / 1024, diskUsed: parseFloat(disk.split('/')[0]) } })));
    } catch (error) {
      logger.warn('Resource collection error:', error.message);
    }
  }, 60000); // Every minute

  return router;
};
