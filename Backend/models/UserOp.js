const mongoose = require('mongoose');

const UserOpSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  nonce: { type: Number, required: true },
  callData: { type: String, required: true },
  callGasLimit: Number,
  verificationGasLimit: Number,
  preVerificationGas: Number,
  maxFeePerGas: String,
  maxPriorityFeePerGas: String,
  paymasterAndData: String,
  signature: { type: String, required: true },
  txHash: String,
  status: { type: String, enum: ['pending', 'validated', 'submitted', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserOp', UserOpSchema);
