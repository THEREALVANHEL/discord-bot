// models/Settings.js (UPDATED - Added AI channel settings)
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  welcomeChannelId: { type: String, default: null },
  leaveChannelId: { type: String, default: null },
  suggestionChannelId: { type: String, default: null },
  autologChannelId: { type: String, default: null },
  modlogChannelId: { type: String, default: null },
  aiLogChannelId: { type: String, default: null },
  aiChannelId: { type: String, default: null }, // NEW: Designated AI chat channel
  aiAnonymousMode: { type: Boolean, default: false }, // NEW: Default anonymity for AI channel
  aiMathMode: { type: Boolean, default: false }, // NEW: Enable math expression evaluation
  noXpChannels: { type: [String], default: [] },
  reactionRoles: [{
    messageId: String,
    emoji: String,
    roleId: String,
  }],
  ticketPanelChannelId: { type: String, default: null },
  ticketCategoryId: { type: String, default: null },
  levelUpChannelId: { type: String, default: null },
});

module.exports = mongoose.model('Settings', settingsSchema);
