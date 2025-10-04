// events/messageCreate.js (REPLACE - Harder XP Formula + Level Up Channel)
const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder } = require('discord.js');

// Function to calculate XP needed for the next level (Made harder)
const getNextLevelXp = (level) => {
    // Original: 100 * Math.pow(level + 1, 1.5)
    // New (Harder): 150 * Math.pow(level + 1, 1.8)
    return Math.floor(150 * Math.pow(level + 1, 1.8));
};

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

    // XP gain is now 1-3 per message (slower)
    const xpGain = Math.floor(Math.random() * 3) + 1; // 1-3 XP
    user.xp += xpGain;

    const nextLevelXp = getNextLevelXp(user.level);
    let leveledUp = false;
    
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;
      leveledUp = true;

      const member = message.member;

      // Remove all leveling roles and add highest one
      const levelingRoles = client.config.levelingRoles;
      for (const roleConfig of levelingRoles) {
        if (member.roles.cache.has(roleConfig.roleId)) {
          await member.roles.remove(roleConfig.roleId).catch(() => {});
        }
      }

      const newLevelRole = levelingRoles
        .filter(r => r.level <= user.level)
        .sort((a, b) => b.level - a.level)[0];
      if (newLevelRole) {
        await member.roles.add(newLevelRole.roleId).catch(() => {});
      }

      // Send level-up message to the configured channel or the current channel
      const levelUpChannel = settings?.levelUpChannelId ? 
        message.guild.channels.cache.get(settings.levelUpChannelId) : 
        message.channel;

      if (levelUpChannel) {
        const levelUpEmbed = new EmbedBuilder()
          .setTitle('🚀 Level UP!')
          .setDescription(`${message.author}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setColor(0xFFD700) // Gold
          .setTimestamp();
        
        await levelUpChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] });
      }
    }

    // Cookie roles update (This block remains the same)
    const member = message.member;
    const cookieRoles = client.config.cookieRoles;
    for (const roleConfig of cookieRoles) {
      if (member.roles.cache.has(roleConfig.roleId)) {
        await member.roles.remove(roleConfig.roleId).catch(() => {});
      }
    }
    const newCookieRole = cookieRoles
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
