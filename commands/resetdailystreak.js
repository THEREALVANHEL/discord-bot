// commands/resetdailystreak.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resetdailystreak')
    .setDescription('Reset all users\' daily streaks to zero (Administrator only).'),
  async execute(interaction) {
    // Permission check for Administrator roles is handled in interactionCreate.js
    
    await interaction.deferReply({ ephemeral: true });

    try {
      // Reset all dailyStreak fields to 0 for all users
      // Use $set directly for efficiency, no need to load all documents
      const result = await User.updateMany(
        { dailyStreak: { $ne: 0 } }, // Only update users who have a streak
        { $set: { dailyStreak: 0 } }
      );

      const embed = new EmbedBuilder()
        .setTitle('🔥 Daily Streaks Cleared')
        .setDescription(`Moderator ${interaction.user} has reset the daily streak for **${result.modifiedCount} users** in the database.`)
        .setColor(0xFF4500)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error resetting daily streaks:', error);
      await interaction.editReply({ content: '❌ **Error:** Failed to reset streaks. Check database connection/permissions.', ephemeral: true });
    }
  },
};
