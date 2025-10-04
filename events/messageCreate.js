// events/messageCreate.js
const User = require('../models/User');
const Settings = require('../models/Settings');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    if (settings && settings.noXpChannels.includes(message.channel.id)) return;

    let user = await User.findOne({ userId: message.author.id });
    if (!user) {
      user = new User({ userId: message.author.id });
    }

    // XP gain 5-10 per message
    const xpGain = Math.floor(Math.random() * 6) + 5;
    user.xp += xpGain;

    const nextLevelXp = Math.floor(100 * Math.pow(user.level + 1, 1.5));
    let leveledUp = false;
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;
      leveledUp = true;

      const member = message.member;

      // Remove all leveling roles
      for (const roleConfig of client.config.levelingRoles) {
        if (member.roles.cache.has(roleConfig.roleId)) {
          await member.roles.remove(roleConfig.roleId).catch(() => {});
        }
      }

      // Add highest leveling role
      const newLevelRole = client.config.levelingRoles
        .filter(r => r.level <= user.level)
        .sort((a, b) => b.level - a.level)[0];
      if (newLevelRole) {
        await member.roles.add(newLevelRole.roleId).catch(() => {});
      }

      message.channel.send(`${message.author}, congratulations! You leveled up to level ${user.level}! 🎉`);
    }

    // Cookie roles update
    const member = message.member;
    for (const roleConfig of client.config.cookieRoles) {
      if (member.roles.cache.has(roleConfig.roleId)) {
        await member.roles.remove(roleConfig.roleId).catch(() => {});
      }
    }
    const newCookieRole = client.config.cookieRoles
      .filter(r => r.cookies <= user.cookies)
      .sort((a, b) => b.cookies - a.cookies)[0];
    if (newCookieRole) {
      await member.roles.add(newCookieRole.roleId).catch(() => {});
    }

    // Auto assign auto join role fallback
    const autoJoinRoleId = client.config.roles.autoJoin;
    if (autoJoinRoleId && !member.roles.cache.has(autoJoinRoleId)) {
      await member.roles.add(autoJoinRoleId).catch(() => {});
    }

    await user.save();
  },
};
