// utils/findOrCreateUser.js (Placeholder)
import User from "../models/User.js";

// Mock implementation to prevent deployment crash
export async function findOrCreateUser(userId, guildId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId });
    await user.save();
  }
  return user;
}
