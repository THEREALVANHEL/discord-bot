const mongoose = require('mongoose');

// Define a schema for basic server configuration/tracking.
const serverSchema = new mongoose.Schema({
  // Guild ID is essential for identifying the server
  serverId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  
  // Placeholder field to confirm the server record is created
  setupComplete: {
    type: Boolean,
    default: false,
  },
  
  // Optional: Track when the server was first recorded
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
});

// Export the Mongoose model named 'Server'
module.exports = mongoose.model('Server', serverSchema);
