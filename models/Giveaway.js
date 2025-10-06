// models/Giveaway.js (NEW)
const mongoose = require('mongoose');

const giveawaySchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  prize: { type: String, required: true },
  title: { type: String, default: 'Giveaway' },
  winnersCount: { type: Number, required: true },
  endTime: { type: Date, required: true },
  creatorId: { type: String, required: true },
});

module.exports = mongoose.model('Giveaway', giveawaySchema);
