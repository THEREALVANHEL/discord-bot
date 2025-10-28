// commands/leaderboard.js (REPLACE - Added Pagination and Filtering of Non-Members + FIX: Deferred Reply moved to top)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

const PAGE_SIZE = 10;

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
          { name: 'Cookies', value: 'cookies' }, 
          { name: 'Daily Streak', value: 'streak' },
        ))
    .addIntegerOption(option => // NEW: Page option
      option.setName('page')
        .setDescription('The page number to view (Default: 1)')
        .setRequired(false)),
  execute: async (interaction) => {
    // FIX: Move deferReply to the absolute beginning to prevent "Unknown Interaction"
    await interaction.deferReply();

    const type = interaction.options.getString('type');
    const page = interaction.options.getInteger('page') || 1;

    if (page < 1) return interaction.editReply({ content: '❌ Page number must be 1 or higher.' });

    let sortQuery;
    let title;
    let emoji;

    if (type === 'xp') {
      sortQuery = { level: -1, xp: -1 };
      title = '🚀 XP/Level Leaderboard';
      emoji = '✨';
    } else if (type === 'coins') {
      sortQuery = { coins: -1 };
      title = '💰 Coins Leaderboard';
      emoji = '🪙';
    } else if (type === 'cookies') {
      sortQuery = { cookies: -1 };
      title = '🍪 Cookie Leaderboard';
      emoji = '🍪';
    } else if (type === 'streak') {
      sortQuery = { dailyStreak: -1 };
      title = '🔥 Daily Streak Leaderboard';
      emoji = '🔥';
    }

    // Fetch all users for proper ranking *after* filtering
    // NOTE: This can be slow on very large databases but is necessary for accurate ranking.
    const allUsers = await User.find().sort(sortQuery);

    // Fetch all members in the guild (required for filtering non-members)
    const currentMembers = await interaction.guild.members.fetch().catch(() => new Map());
    // Filter the user data to only include users currently in the server
    const memberUsers = allUsers.filter(user => currentMembers.has(user.userId));
    
    // Calculate total pages and apply pagination
    const totalUsers = memberUsers.length;
    const totalPages = Math.ceil(totalUsers / PAGE_SIZE);
    
    if (page > totalPages && totalPages > 0) {
        return interaction.editReply({ content: `❌ Page ${page} not found. There are only ${totalPages} pages.` });
    }
    if (totalUsers === 0) {
        return interaction.editReply({ content: '⚠️ No current members found with data for this leaderboard.' });
    }

    const startIndex = (page - 1) * PAGE_SIZE;
    const paginatedUsers = memberUsers.slice(startIndex, startIndex + PAGE_SIZE);

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(0x7289DA)
      .setTimestamp()
      .setFooter({ text: `Page ${page} of ${totalPages} | Total Ranked Members: ${totalUsers}` }); // Added pagination info

    let description = '';
    
    // Fetch display names for the current page only
    const fetchPromises = paginatedUsers.map(user => 
        interaction.guild.members.fetch(user.userId).catch(() => null)
    );
    const members = await Promise.all(fetchPromises);
    
    paginatedUsers.forEach((user, index) => {
      const rank = startIndex + index + 1; // Correct rank based on filtering
      const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🔹';
      
      const member = members[index];
      // Use the fetched member's display name or tag
      const displayName = member ? member.displayName : user.userId; 
      
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
      
      description += `${rankEmoji} **#${rank}** **${displayName}**: **${value}**\n`;
    });

    embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });
  },
};
