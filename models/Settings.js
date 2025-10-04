// models/Settings.js (REPLACE - Added levelUpChannelId)
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  welcomeChannelId: { type: String, default: null },
  leaveChannelId: { type: String, default: null },
  suggestionChannelId: { type: String, default: null },
  autologChannelId: { type: String, default: null },
  modlogChannelId: { type: String, default: null },
  noXpChannels: { type: [String], default: [] },
  reactionRoles: [{
    messageId: String,
    emoji: String,
    roleId: String,
  }],
  ticketPanelChannelId: { type: String, default: null },
  ticketCategoryId: { type: String, default: null },
  levelUpChannelId: { type: String, default: null }, // NEW
});

module.exports = mongoose.model('Settings', settingsSchema);
