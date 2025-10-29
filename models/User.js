// models/User.js (REPLACE - Fixed extraneous space in model name)
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
  reminders: [{
    message: { type: String, required: true },
    remindAt: { type: Date, required: true },
    channelId: { type: String, required: true },
  }],
  currentJob: { type: String, default: null },
  successfulWorks: { type: Number, default: 0 }, // NEW: Track successful work attempts
  lastResigned: { type: Date, default: null },   // NEW: Track last resignation time for cooldown
});

// FIX: Removed the trailing space from 'User '
module.exports = mongoose.model('User', userSchema);
