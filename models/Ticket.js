// MultipleFiles/models/Ticket.js
const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true }, // Discord channel ID
  userId: { type: String, required: true }, // User who created the ticket
  channelId: { type: String, required: true }, // Discord channel ID
  status: { type: String, enum: ['open', 'claimed', 'closed'], default: 'open' },
  claimedBy: { type: String, default: null }, // User ID of the moderator who claimed it
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Ticket', ticketSchema);
