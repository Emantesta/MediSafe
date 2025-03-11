const mongoose = require('mongoose');

const EventLogSchema = new mongoose.Schema({
  eventName: { type: String, required: true },
  blockNumber: { type: Number, required: true },
  timestamp: { type: Date, required: true },
  data: { type: Object, required: true }, // Event args as JSON
  transactionHash: { type: String, required: true },
});

EventLogSchema.index({ eventName: 1, timestamp: -1 });
module.exports = mongoose.model('EventLog', EventLogSchema);
