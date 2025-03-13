// models/Admin.js
const mongoose = require('mongoose');
const AdminSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true },
  role: { type: String, enum: ['super_admin', 'moderator'], default: 'moderator' },
  lastLogin: Date
});
module.exports = mongoose.model('Admin', AdminSchema);
