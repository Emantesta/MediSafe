const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  adminAddress: String,
  action: String,
  details: String,
  timestamp: { type: Date, default: Date.now }
});
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

router.get('/audit-logs', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100);
  res.json({ logs });
});

module.exports = router;
// Mount in server.js: app.use('/admin', require('./routes/admin')(wallet, logger));
