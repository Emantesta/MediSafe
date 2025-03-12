const mongoose = require('mongoose');

const PrescriptionSchema = new mongoose.Schema({
  prescriptionId: { type: Number, required: true, unique: true },
  patientAddress: { type: String, required: true, index: true },
  doctorAddress: { type: String, required: true, index: true },
  pharmacyAddress: { type: String, index: true },
  status: { type: String, enum: ['issued', 'verified', 'fulfilled', 'revoked'], required: true },
  verificationCodeHash: { type: String, required: true },
  issuedAt: { type: Date, required: true },
  updatedAt: { type: Date },
  txHash: { type: String },
});

module.exports = mongoose.model('Prescription', PrescriptionSchema);
