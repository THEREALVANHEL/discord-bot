// utils/findOrCreateUser.js (REPLACED - Converted to CommonJS)
const User = require("../models/User.js"); // Assuming models/User.js is in the parent directory

// Mock implementation to prevent deployment crash
async function findOrCreateUser(userId, guildId) { // guildId might not be needed depending on your schema
  let user = await User.findOne({ userId });
  if (!user) {
    console.log(`Creating new user entry for ${userId}`); // Added log
    user = new User({ userId });
    try {
        await user.save();
    } catch (error) {
        console.error(`Error saving new user ${userId}:`, error);
        // Depending on usage, might need to throw or return null
        return null;
    }
  }
  return user;
}

module.exports = { findOrCreateUser };
