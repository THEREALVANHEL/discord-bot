// models/User.js (REPLACE - Added warnings and dailyGives)
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  cookies: { type: Number, default: 0 },
  coins: { type: Number, default: 0 },
  lastDaily: { type: Date, default: null },
  dailyStreak: { type: Number, default: 0 },
  lastWork: { type: Date, default: null },
  warnings: [{
    reason: { type: String, required: true },
    moderatorId: { type: String, required: true },
    date: { type: Date, default: Date.now },
  }],
  dailyGives: {
    count: { type: Number, default: 0 },
    lastGive: { type: Date, default: null },
  },
});

module.exports = mongoose.model('User ', userSchema);
