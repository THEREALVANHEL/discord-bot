// commands/daily.js (REPLACE - Premium GUI + Level Up Channel + Harder XP Formula)
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
  async execute(interaction) {
    const cooldown = ms('24h');
    let user = await User.findOne({ userId: interaction.user.id });
    await interaction.deferReply();

    if (!user) {
      user = new User({ userId: interaction.user.id });
    }

    if (user.lastDaily && cooldown - (Date.now() - user.lastDaily.getTime()) > 0) {
      const timeLeft = ms(cooldown - (Date.now() - user.lastDaily.getTime()), { long: true });
      return interaction.editReply({ content: `⏱️ You can claim your daily reward again in **${timeLeft}**.`, ephemeral: true });
    }

    const coinsEarned = Math.floor(Math.random() * 50) + 50;
    const xpEarned = Math.floor(Math.random() * 20) + 10;
    
    // Streak logic
    const now = new Date();
    if (user.lastDaily) {
        const lastDailyTime = user.lastDaily.getTime();
        if (now.getTime() - lastDailyTime < ms('48h')) {
            user.dailyStreak = (user.dailyStreak || 0) + 1;
        } else {
            user.dailyStreak = 1;
        }
    } else {
        user.dailyStreak = 1;
    }

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
      .setDescription(`You received your daily spoils!`)
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
