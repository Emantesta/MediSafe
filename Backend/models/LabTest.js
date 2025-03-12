const mongoose = require('mongoose');

const LabTestSchema = new mongoose.Schema({
  testId: { type: Number, required: true, unique: true },
  patientAddress: { type: String, required: true, index: true },
  labAddress: { type: String, required: true, index: true },
  testType: { type: String, required: true },
  status: { type: String, enum: ['ordered', 'collected', 'uploaded', 'reviewed'], required: true },
  ipfsHash: { type: String }, // Hash of results when uploaded
  orderedAt: { type: Date, required: true },
  updatedAt: { type: Date },
  txHash: { type: String },
});

module.exports = mongoose.model('LabTest', LabTestSchema);
