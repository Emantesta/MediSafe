const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const readline = require('readline');
const { authMiddleware } = require('./utils');

module.exports = (wallet, contract, provider, logger, redisClient, wss) => {
  router.get('/logs', authMiddleware, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { page = 1, limit = 10, level, startTime, endTime, keyword, source, download } = req.query;
    const logFiles = ['error.log', 'combined.log', 'access.log']; // List of log files to aggregate
    const cacheKey = `logs:${page}:${limit}:${level || 'all'}:${startTime || 'none'}:${endTime || 'none'}:${keyword || 'none'}:${source || 'all'}`;

    try {
      // Check Redis cache (skip for download)
      const cached = await redisClient.get(cacheKey);
      if (cached && !download) {
        logger.info(`Cache hit for ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }

      // Aggregate logs from all files in parallel
      const logsPromises = logFiles.map(async file => {
        const fileLogs = [];
        const fileStream = require('fs').createReadStream(file);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        for await (const line of rl) {
          const log = JSON.parse(line);
          if (level && log.level !== level) continue;
          if (startTime && new Date(log.timestamp) < new Date(parseInt(startTime))) continue;
          if (endTime && new Date(log.timestamp) > new Date(parseInt(endTime))) continue;
          if (keyword && !log.message.toLowerCase().includes(keyword.toLowerCase())) continue;
          if (source && file !== source) continue;
          fileLogs.push({ ...log, source: file });
        }
        return fileLogs;
      });
      const logs = (await Promise.all(logsPromises)).flat();

      const total = logs.length;
      const paginatedLogs = logs
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice((page - 1) * limit, page * limit);

      if (download) {
        const logText = logs.map(log => `${log.timestamp} [${log.level}] ${log.source}: ${log.message}`).join('\n');
        res.header('Content-Type', 'text/plain');
        res.attachment('aggregated_logs.txt');
        return res.send(logText);
      }

      const response = { logs: paginatedLogs, total, sources: logFiles };
      await redisClient.setEx(cacheKey, 300, JSON.stringify(response));
      res.json(response);
    } catch (error) {
      logger.error('Log aggregation error:', error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  // Other routes (e.g., /userops, /paymaster-status) remain unchanged
  return router;
};
