// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true },
  role: { type: String, enum: ['patient', 'doctor', 'lab', 'pharmacy'], required: true },
  registrationDate: { type: Date, default: Date.now },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'deactivated'], default: 'pending' },
  lastActivity: Date,
});

module.exports = mongoose.model('User', UserSchema);
