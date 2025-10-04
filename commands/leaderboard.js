// commands/leaderboard.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the top users for XP, Cookies, or Coins.')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('The type of leaderboard to view')
        .setRequired(true)
        .addChoices(
          { name: 'XP', value: 'xp' },
          { name: 'Cookies', value: 'cookies' },
          { name: 'Coins', value: 'coins' },
        )),
  async execute(interaction) {
    const type = interaction.options.getString('type');

    let users;
    let title = '';
    let fieldName = '';
    let color = 0x0099FF; // Default blue

    switch (type) {
      case 'xp':
        users = await User.find().sort({ level: -1, xp: -1 }).limit(10);
        title = '🏆 XP Leaderboard';
        fieldName = 'Level / XP';
        color = 0x00AE86; // Green
        break;
      case 'cookies':
        users = await User.find().sort({ cookies: -1 }).limit(10);
        title = '🍪 Cookie Leaderboard';
        fieldName = 'Cookies';
        color = 0xFFA500; // Orange
        break;
      case 'coins':
        users = await User.find().sort({ coins: -1 }).limit(10);
        title = '💰 Coin Leaderboard';
        fieldName = 'Coins';
        color = 0xFFD700; // Gold
        break;
    }

    if (!users || users.length === 0) {
      return interaction.reply({ content: `No users found for the ${type} leaderboard.`, ephemeral: true });
    }

    const leaderboardDescription = users.map((user, index) => {
      const member = interaction.guild.members.cache.get(user.userId);
      const username = member ? member.user.username : 'Unknown User';
      if (type === 'xp') {
        return `${index + 1}. **${username}** - Level ${user.level} (${user.xp} XP)`;
      } else {
        return `${index + 1}. **${username}** - ${user[type]} ${type}`;
      }
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(leaderboardDescription)
      .setColor(color)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
