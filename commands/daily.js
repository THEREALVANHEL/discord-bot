// commands/daily.js (REPLACE - Fixed streak logic for missed day reset to 1/0 + MODERATE XP Formula)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');
const ms = require('ms');

// Function to calculate XP needed for the next level (MODERATE formula)
const getNextLevelXp = (level) => {
    // New Moderate: 100 * Math.pow(level + 1, 1.5)
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coins and XP!'),
  execute: async (interaction) => {
    
    // FIX: Move deferral to the top to prevent 'Unknown interaction' due to latency.
    await interaction.deferReply(); 

    let user = await User.findOne({ userId: interaction.user.id });

    if (!user) {
      user = new User({ userId: interaction.user.id });
    }

    // --- Midnight Reset Logic (UTC) ---
    const now = new Date();
    // Get the start of today in UTC (00:00:00.000 UTC of the current date)
    const startOfTodayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    if (user.lastDaily && user.lastDaily.getTime() >= startOfTodayUTC.getTime()) {
      // Already claimed today (UTC date check)
      
      // Calculate time left until next UTC midnight (start of tomorrow UTC)
      const startOfTomorrowUTC = new Date(startOfTodayUTC.getTime() + ms('24h'));
      const timeLeft = ms(startOfTomorrowUTC.getTime() - now.getTime(), { long: true });

      return interaction.editReply({ content: `⏱️ You can claim your daily reward again in **${timeLeft}** (resets at UTC midnight).`, ephemeral: true });
    }
    // --- END MIDNIGHT CHECK ---

    let coinsEarned = Math.floor(Math.random() * 50) + 50;
    let xpEarned = Math.floor(Math.random() * 20) + 10;
    let streakBonus = '';
    
    // --- UPDATED STREAK LOGIC ---
    let currentStreak = user.dailyStreak || 0;

    if (!user.lastDaily) {
        // First ever claim
        currentStreak = 1;
    } else {
        const timeSinceLastClaim = now.getTime() - user.lastDaily.getTime();

        if (timeSinceLastClaim > ms('48h')) {
            // Missed an entire day's window (missed yesterday), reset streak.
            currentStreak = 1; // Start a new streak of 1 on successful claim
        } else if (timeSinceLastClaim > ms('24h')) {
            // Claimed in the previous UTC day (24-48h window), streak continues.
            currentStreak++;
        } else {
            // Claimed today but the first check failed somehow (shouldn't happen here)
            // Or a very fast second claim which is blocked by the first check.
        }
    }
    
    // 7-Day Streak Bonus Logic
    if (currentStreak > 0 && currentStreak % 7 === 0) {
        coinsEarned *= 2; // Double the reward
        xpEarned *= 2;     // Double the reward
        streakBonus = `\n\n**✨ 7-Day Mega-Bonus!** You received **double** rewards!`;
    }
    
    // Update user data
    user.dailyStreak = currentStreak; 
    user.coins += coinsEarned;
    user.xp += xpEarned;
    user.lastDaily = now;

    // Check for level up
    const settings = await Settings.findOne({ guildId: interaction.guild.id });
    const levelUpChannel = settings?.levelUpChannelId ? 
      interaction.guild.channels.cache.get(settings.levelUpChannelId) : 
      interaction.channel;

    const nextLevelXpCheck = getNextLevelXp(user.level);
    if (user.xp >= nextLevelXpCheck) {
      user.level++;
      user.xp -= nextLevelXpCheck;

      const member = interaction.guild.members.cache.get(interaction.user.id);
      if (member) {
        const levelingRoles = interaction.client.config.levelingRoles;
        
        // FIX: Find the single highest eligible role (logic copied from addxp/messagecreate)
        const targetLevelRole = levelingRoles
            .filter(r => r.level <= user.level)
            .sort((a, b) => b.level - a.level)[0];
        
        const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;

        for (const roleConfig of levelingRoles) {
          const roleId = roleConfig.roleId;
          const hasRole = member.roles.cache.has(roleId);
          
          if (roleId === targetLevelRoleId) {
              // If this is the correct role but the user doesn't have it, add it.
              if (!hasRole) {
                  await member.roles.add(roleId).catch(() => {});
              }
          } else {
              // If the user has a different leveling role, remove it.
              if (hasRole) {
                  await member.roles.remove(roleId).catch(() => {});
              }
          }
        }
      }
      
      // Send level-up message
      if (levelUpChannel) {
        const levelUpEmbed = new EmbedBuilder()
          .setTitle('🚀 Level UP!')
          .setDescription(`${interaction.user}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setColor(0xFFD700)
          .setTimestamp();
        
        await levelUpChannel.send({ content: `${interaction.user}`, embeds: [levelUpEmbed] });
      }
    }

    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('🎁 Daily Reward Claimed!')
      .setDescription(`You received your daily spoils!${streakBonus}`)
      .addFields(
        { name: 'Coins Earned', value: `${coinsEarned} 💰`, inline: true },
        { name: 'XP Earned', value: `${xpEarned} ✨`, inline: true },
        { name: 'Daily Streak', value: `${user.dailyStreak} days 🔥`, inline: true }
      )
      .setColor(0x32CD32)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
