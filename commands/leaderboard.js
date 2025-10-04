// commands/leaderboard.js (REPLACE - Added cookies leaderboard)
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
          { name: 'Cookies', value: 'cookies' }, // NEW
          { name: 'Daily Streak', value: 'streak' },
        )),
  async execute(interaction) {
    const type = interaction.options.getString('type');
    await interaction.deferReply();

    let users;
    let title;
    let emoji;

    if (type === 'xp') {
      users = await User.find().sort({ level: -1, xp: -1 }).limit(10);
      title = '🚀 XP/Level Leaderboard';
      emoji = '✨';
    } else if (type === 'coins') {
      users = await User.find().sort({ coins: -1 }).limit(10);
      title = '💰 Coins Leaderboard';
      emoji = '🪙';
    } else if (type === 'cookies') {
      users = await User.find().sort({ cookies: -1 }).limit(10);
      title = '🍪 Cookie Leaderboard';
      emoji = '🍪';
    } else if (type === 'streak') {
      users = await User.find().sort({ dailyStreak: -1 }).limit(10);
      title = '🔥 Daily Streak Leaderboard';
      emoji = '🔥';
    }

    if (!users.length) {
      return interaction.editReply({ content: '⚠️ No data available for this leaderboard.' });
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(0x7289DA)
      .setTimestamp();

    let description = '';
    users.forEach((user, index) => {
      const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔹';
      const displayName = interaction.guild.members.cache.get(user.userId)?.displayName || user.userId;
      
      let value;
      if (type === 'xp') {
          value = `Level ${user.level} (${user.xp} XP)`;
      } else if (type === 'coins') {
          value = `${user.coins} coins`;
      } else if (type === 'cookies') {
          value = `${user.cookies} cookies`;
      } else if (type === 'streak') {
          value = `${user.dailyStreak} days`;
      }
      
      description += `${rankEmoji} **#${index + 1}** ${displayName}: **${value}**\n`;
    });

    embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });
  },
};
