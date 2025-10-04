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
    const xpGain = Math.floor(Math.random() * 6) + 5;
    user.xp += xpGain;

    const nextLevelXp = Math.floor(100 * Math.pow(user.level + 1, 1.5));
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;

      // Assign leveling roles
      const levelingRoles = client.config.levelingRoles;
      const member = message.member;

      // Remove all leveling roles first
      for (const role of levelingRoles) {
        if (member.roles.cache.has(role.roleId)) {
          await member.roles.remove(role.roleId).catch(() => {});
        }
      }

      // Add highest role for current level
      const newRole = levelingRoles.filter(r => r.level <= user.level).sort((a, b) => b.level - a.level)[0];
      if (newRole) {
        await member.roles.add(newRole.roleId).catch(() => {});
      }

      message.channel.send(`${message.author}, congratulations! You leveled up to level ${user.level}! 🎉`);
    }

    // Update user data
    await user.save();

    // Auto assign auto join role if not present
    const autoJoinRoleId = client.config.roles.autoJoin;
    if (!message.member.roles.cache.has(autoJoinRoleId)) {
      await message.member.roles.add(autoJoinRoleId).catch(() => {});
    }
  },
};
