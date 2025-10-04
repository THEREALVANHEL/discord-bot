// MultipleFiles/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  cookies: { type: Number, default: 0 },
  coins: { type: Number, default: 0 },
  lastDaily: { type: Date, default: null },
  lastWork: { type: Date, default: null }, // Added for work command cooldown
  // Add more fields as needed
});

module.exports = mongoose.model('User', userSchema);
