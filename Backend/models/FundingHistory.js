const mongoose = require('mongoose');

const FundingHistorySchema = new mongoose.Schema({
  txHash: { type: String, required: true, unique: true },
  amount: { type: String, required: true }, // Stored as wei string
  type: { type: String, enum: ['deposit', 'withdrawal'], required: true },
  timestamp: { type: Date, default: Date.now },
  adminAddress: { type: String, required: true },
});

module.exports = mongoose.model('FundingHistory', FundingHistorySchema);
