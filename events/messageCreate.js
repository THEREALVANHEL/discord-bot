// MultipleFiles/messageCreate.js
const User = require('../models/User');
const Settings = require('../models/Settings');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    if (settings && settings.noXpChannels.includes(message.channel.id)) return; // No XP in these channels

    // Fetch or create user data
    let user = await User.findOne({ userId: message.author.id });
    if (!user) {
      user = new User({ userId: message.author.id });
    }

    // XP gain logic (hard but not too hard)
    // For example: XP gain = random 5-10, level up requires 100 * level^1.5 XP
    const xpGain = Math.floor(Math.random() * 6) + 5; // 5-10 XP per message
    user.xp += xpGain;

    const nextLevelXp = Math.floor(100 * Math.pow(user.level + 1, 1.5)); // Exponential scaling
    let leveledUp = false;
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp; // Carry over excess XP
      leveledUp = true;

      // Assign leveling roles
      const levelingRoles = client.config.levelingRoles;
      const member = message.member;

      // Remove all current leveling roles first
      for (const roleConfig of levelingRoles) {
        if (member.roles.cache.has(roleConfig.roleId)) {
          await member.roles.remove(roleConfig.roleId).catch(() => {});
        }
      }

      // Add highest role for current level
      const newLevelRole = levelingRoles
        .filter(r => r.level <= user.level)
        .sort((a, b) => b.level - a.level)[0]; // Get the highest applicable role
      if (newLevelRole) {
        await member.roles.add(newLevelRole.roleId).catch(() => {});
      }

      message.channel.send(`${message.author}, congratulations! You leveled up to level ${user.level}! 🎉`);
    }

    // Auto assign cookie roles (check on every message to ensure it's up-to-date)
    const cookieRoles = client.config.cookieRoles;
    const member = message.member;

    // Remove all current cookie roles first
    for (const roleConfig of cookieRoles) {
      if (member.roles.cache.has(roleConfig.roleId)) {
        await member.roles.remove(roleConfig.roleId).catch(() => {});
      }
    }

    // Add highest cookie role for current cookies
    const newCookieRole = cookieRoles
      .filter(r => r.cookies <= user.cookies)
      .sort((a, b) => b.cookies - a.cookies)[0]; // Get the highest applicable role
    if (newCookieRole) {
      await member.roles.add(newCookieRole.roleId).catch(() => {});
    }

    // Update user data
    await user.save();

    // Auto assign auto join role if not present (redundant if handled by guildMemberAdd, but good as a fallback)
    const autoJoinRoleId = client.config.roles.autoJoin;
    if (autoJoinRoleId && !message.member.roles.cache.has(autoJoinRoleId)) {
      await message.member.roles.add(autoJoinRoleId).catch(() => {});
    }
  },
};
