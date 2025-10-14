// commands/profile.js (REPLACE - Premium GUI, Progress Bar, Fixed timestamps + MODERATE XP Formula)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

// Function to calculate XP needed for the next level (MODERATE formula)
const getNextLevelXp = (level) => {
    // New Moderate: 100 * Math.pow(level + 1, 1.5)
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

// Function to generate the visual progress bar
const createProgressBar = (current, needed, length = 15) => {
    const percent = current / needed;
    const filledLength = Math.round(length * percent);
    const emptyLength = length - filledLength;
    const filled = '█'.repeat(filledLength); // Filled block
    const empty = '░'.repeat(emptyLength); // Empty block
    const progress = (percent * 100).toFixed(1);

    return `\`[${filled}${empty}]\` **${progress}%**`;
};


module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your or another user\'s profile.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user whose profile you want to view')
        .setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply();
    
    const targetUser = interaction.options.getUser('target') || interaction.user;
    const member = interaction.guild.members.cache.get(targetUser.id) || await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      user = new User({ userId: targetUser.id });
      await user.save();
    }

    const nextLevelXp = getNextLevelXp(user.level);
    const xpProgress = user.xp;
    const totalXpInLevel = user.level > 0 ? getNextLevelXp(user.level - 1) : 0;
    const xpNeededForNext = nextLevelXp;

    const progressBar = createProgressBar(xpProgress, xpNeededForNext);
    
    // Get the highest role color or default
    const color = member?.displayColor === 0 ? 0x7289DA : member?.displayColor || 0x7289DA; 

    const embed = new EmbedBuilder()
      .setTitle(`⭐ ${targetUser.username}'s Profile Card`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
      .setColor(color) 
      .setDescription(`Welcome to **${targetUser.username}'s** current standing!`)
      .addFields(
        // Level Progress Bar
        { name: `Level ${user.level} Progress:`, 
          value: `${progressBar}\n(XP: **${xpProgress} / ${xpNeededForNext}** needed for Level ${user.level + 1})`, 
          inline: false 
        },
        // Currency
        { name: 'Coins 💰', value: `\`${user.coins.toLocaleString()}\``, inline: true },
        { name: 'Cookies 🍪', value: `\`${user.cookies.toLocaleString()}\``, inline: true },
        { name: 'Daily Streak 🔥', value: `\`${user.dailyStreak || 0} days\``, inline: true },
        // Dates
        // FIX: Use full timestamp (:F)
        { name: 'Joined Discord', value: `<t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:F>`, inline: false },
        // FIX: Use full timestamp (:F)
        { name: 'Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'N/A', inline: false },
      )
      .setFooter({ text: `User ID: ${targetUser.id}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
