// commands/leaderboard.js (REPLACE - Fixed Member Display Name Logic)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
// ... (data remains the same)
  async execute(interaction) {
    const type = interaction.options.getString('type');
    await interaction.deferReply();

    let users;
    let title;
    let emoji;

    // ... (logic for fetching users and setting title/emoji remains the same)
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
    
    // Use Promise.all to fetch all members concurrently for a smoother display
    const fetchPromises = users.map(user => 
        interaction.guild.members.fetch(user.userId).catch(() => null)
    );
    const members = await Promise.all(fetchPromises);
    
    users.forEach((user, index) => {
      const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔹';
      
      // Use the fetched member's display name or tag if available
      const member = members[index];
      const displayName = member ? member.displayName : 
                          interaction.guild.members.cache.get(user.userId)?.displayName || 
                          user.userId; // Fallback to ID if all else fails
      
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
      
      // Use bold for the display name
      description += `${rankEmoji} **#${index + 1}** **${displayName}**: **${value}**\n`;
    });

    embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });
  },
};
