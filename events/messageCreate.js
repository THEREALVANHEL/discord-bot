// events/messageCreate.js (REPLACE - Fixed infinite role add/remove loop in leveling and cookie role logic + MODERATE XP GAIN + 5s SPAM COOLDOWN)
const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder } = require('discord.js');

// Cooldown Map: Stores last time a user gained XP in a channel { userId-channelId: timestamp }
const xpCooldowns = new Map();
const XP_COOLDOWN_MS = 5000; // 5 seconds to prevent spamming XP gain

// Function to calculate XP needed for the next level (Made MODERATE HARD)
const getNextLevelXp = (level) => {
    // Original Hard: 150 * Math.pow(level + 1, 1.8)
    // New Moderate: 100 * Math.pow(level + 1, 1.5)
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

// Helper function to manage a set of roles efficiently
async function manageTieredRoles(member, userValue, roleConfigs, property) {
    if (!roleConfigs || roleConfigs.length === 0) return; 
    
    // 1. Determine the highest eligible role (the target role)
    const targetRoleConfig = roleConfigs
      .filter(r => r[property] <= userValue)
      .sort((a, b) => b[property] - a[property])[0];
      
    const targetRoleId = targetRoleConfig ? targetRoleConfig.roleId : null;

    for (const roleConfig of roleConfigs) {
        const roleId = roleConfig.roleId;
        const hasRole = member.roles.cache.has(roleId);
        
        if (roleId === targetRoleId) {
            // If this is the correct role but the user doesn't have it, add it.
            if (!hasRole) {
                await member.roles.add(roleId).catch(() => {});
            }
        } else {
            // If the user has a role that is NOT the target role (i.e., lower tier or invalid role), remove it.
            if (hasRole) {
                await member.roles.remove(roleId).catch(() => {});
            }
        }
    }
}


module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    if (settings && settings.noXpChannels.includes(message.channel.id)) return;

    // --- XP COOLDOWN CHECK ---
    const cooldownKey = `${message.author.id}-${message.channel.id}`;
    const lastXpTime = xpCooldowns.get(cooldownKey);
    
    if (lastXpTime && (Date.now() - lastXpTime < XP_COOLDOWN_MS)) {
        // User is still on cooldown for this channel
        return;
    }
    
    // Set cooldown timestamp (must be done BEFORE DB/XP logic)
    xpCooldowns.set(cooldownKey, Date.now());


    let user = await User.findOne({ userId: message.author.id });
    if (!user) {
      user = new User({ userId: message.author.id });
    }

    // XP gain is now 3-5 per message (More moderate)
    const xpGain = Math.floor(Math.random() * 3) + 3; // 3-5 XP
    user.xp += xpGain;

    const nextLevelXp = getNextLevelXp(user.level);
    let leveledUp = false;
    
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;
      leveledUp = true;

      const member = message.member;

      // Apply tiered role management on level up
      if (member) {
          await manageTieredRoles(member, user.level, client.config.levelingRoles, 'level');
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

    // Apply tiered role management for cookie roles on every message (unconditional block)
    const member = message.member;
    if (member) {
        await manageTieredRoles(member, user.cookies, client.config.cookieRoles, 'cookies');
    }
    

    // Auto assign auto join role fallback
    const autoJoinRoleId = client.config.roles.autoJoin;
    if (autoJoinRoleId && member && !member.roles.cache.has(autoJoinRoleId)) {
      await member.roles.add(autoJoinRoleId).catch(() => {});
    }

    await user.save();
  },
};
