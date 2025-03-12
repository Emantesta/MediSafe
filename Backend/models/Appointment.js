const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  appointmentId: { type: Number, required: true, unique: true },
  patientAddress: { type: String, required: true, index: true },
  doctorAddress: { type: String, required: true, index: true },
  timestamp: { type: Date, required: true },
  status: { type: String, enum: ['booked', 'confirmed', 'completed', 'cancelled'], required: true },
  videoCallLink: { type: String },
  txHash: { type: String },
});

module.exports = mongoose.model('Appointment', AppointmentSchema);
