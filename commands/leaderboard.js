// commands/leaderboard.js (REPLACE - Upgraded with streak subcommand)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View leaderboards for XP, coins, or streaks.')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Leaderboard type')
        .setRequired(true)
        .addChoices(
          { name: 'XP/Level', value: 'xp' },
          { name: 'Coins', value: 'coins' },
          { name: 'Daily Streak', value: 'streak' },
        )),
  async execute(interaction) {
    const type = interaction.options.getString('type');

    let users;
    let title;
    let sortField;

    if (type === 'xp') {
      users = await User.find().sort({ level: -1, xp: -1 }).limit(10);
      title = 'XP/Level Leaderboard';
      sortField = 'level';
    } else if (type === 'coins') {
      users = await User.find().sort({ coins: -1 }).limit(10);
      title = 'Coins Leaderboard';
      sortField = 'coins';
    } else if (type === 'streak') {
      users = await User.find().sort({ dailyStreak: -1 }).limit(10);
      title = 'Daily Streak Leaderboard';
      sortField = 'dailyStreak';
    }

    if (!users.length) {
      return interaction.reply({ content: 'No data available for this leaderboard.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(0x00FF00)
      .setTimestamp();

    let description = '';
    users.forEach((user, index) => {
      const displayName = interaction.guild.members.cache.get(user.userId)?.displayName || user.userId;
      const value = type === 'xp' ? `Level ${user.level} (${user.xp} XP)` : type === 'coins' ? `${user.coins} coins` : `${user.dailyStreak} days`;
      description += `${index + 1}. ${displayName}: ${value}\n`;
    });

    embed.setDescription(description);

    await interaction.reply({ embeds: [embed] });
  },
};
