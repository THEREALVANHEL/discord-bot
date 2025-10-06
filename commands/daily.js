// commands/daily.js (REPLACE - Fixed infinite role add/remove loop)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');
const ms = require('ms');

// Function to calculate XP needed for the next level (Harder formula)
const getNextLevelXp = (level) => {
    return Math.floor(150 * Math.pow(level + 1, 1.8));
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coins and XP!'),
  execute: async (interaction) => { // FIX: Changed 'async execute(interaction)' to 'execute: async (interaction) =>' for deployment stability
    // REMOVED: const cooldown = ms('24h');
    let user = await User.findOne({ userId: interaction.user.id });
    await interaction.deferReply();

    if (!user) {
      user = new User({ userId: interaction.user.id });
    }

    // --- NEW: Midnight Reset Logic (UTC) ---
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
    // --- END NEW LOGIC ---

    let coinsEarned = Math.floor(Math.random() * 50) + 50;
    let xpEarned = Math.floor(Math.random() * 20) + 10;
    let streakBonus = '';
    
    // Streak logic
    // const now = new Date(); // Moved to top for consistency
    let currentStreak = 1;
    if (user.lastDaily) {
        const lastDailyTime = user.lastDaily.getTime();
        if (now.getTime() - lastDailyTime < ms('48h')) {
            // Continued streak
            currentStreak = (user.dailyStreak || 0) + 1;
        } else {
            // Broken streak, reset to 1
            currentStreak = 1;
        }
    } else {
        currentStreak = 1;
    }
    
    // 7-Day Streak Bonus Logic
    if (currentStreak % 7 === 0) {
        coinsEarned *= 2; // Double the reward
        xpEarned *= 2;     // Double the reward
        streakBonus = `\n\n**✨ 7-Day Mega-Bonus!** You received **double** rewards!`;
    }
    
    // Update the highest streak achieved for the leaderboard
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
        
        // FIX: Find the single highest eligible role
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
