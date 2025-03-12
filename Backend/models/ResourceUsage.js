const mongoose = require('mongoose');

const ResourceUsageSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  cpu: { type: Number }, // Percentage
  memoryUsed: { type: Number }, // GB
  memoryTotal: { type: Number }, // GB
  diskUsed: { type: Number }, // GB
  diskTotal: { type: Number }, // GB
});
// Add TTL index to expire documents after 7 days
ResourceUsageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 }); // 7 days

module.exports = mongoose.model('ResourceUsage', ResourceUsageSchema);
