// commands/dbstatus.js (NEW - MongoDB Diagnostics)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dbstatus')
    .setDescription('Check MongoDB connection and data status (Admin only)'),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const embed = new EmbedBuilder()
        .setTitle('🗄️ MongoDB Status Report')
        .setColor(0x00FF00)
        .setTimestamp();
      
      // Connection status
      const connectionStates = {
        0: 'Disconnected',
        1: 'Connected',
        2: 'Connecting',
        3: 'Disconnecting',
      };
      
      const state = mongoose.connection.readyState;
      embed.addFields({
        name: 'Connection Status',
        value: `${connectionStates[state]} (${state})`,
        inline: true,
      });
      
      if (state !== 1) {
        embed.setColor(0xFF0000);
        embed.setDescription('⚠️ **WARNING:** MongoDB is not connected!');
        return interaction.editReply({ embeds: [embed] });
      }
      
      // Count documents
      const userCount = await User.countDocuments();
      const usersWithData = await User.countDocuments({ $or: [
        { xp: { $gt: 0 } },
        { coins: { $gt: 0 } },
        { cookies: { $gt: 0 } },
      ]});
      
      embed.addFields(
        { name: 'Total Users', value: `${userCount}`, inline: true },
        { name: 'Users with Data', value: `${usersWithData}`, inline: true }
      );
      
      // Sample user data
      const sampleUser = await User.findOne({ $or: [
        { xp: { $gt: 0 } },
        { coins: { $gt: 0 } },
      ]}).limit(1);
      
      if (sampleUser) {
        embed.addFields({
          name: 'Sample User Data',
          value: `User ID: ${sampleUser.userId}\nLevel: ${sampleUser.level}\nXP: ${sampleUser.xp}\nCoins: ${sampleUser.coins}\nCookies: ${sampleUser.cookies}`,
          inline: false,
        });
      } else {
        embed.addFields({
          name: 'Sample User Data',
          value: 'No users with XP/coins found',
          inline: false,
        });
      }
      
      // Check specific user
      const testUser = await User.findOne({ userId: interaction.user.id });
      if (testUser) {
        embed.addFields({
          name: 'Your Data',
          value: `Level: ${testUser.level}\nXP: ${testUser.xp}\nCoins: ${testUser.coins}\nCookies: ${testUser.cookies}`,
          inline: false,
        });
      } else {
        embed.addFields({
          name: 'Your Data',
          value: 'No data found for your account',
          inline: false,
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('dbstatus error:', error);
      await interaction.editReply({ 
        content: `❌ Error checking database: ${error.message}`,
        ephemeral: true 
      });
    }
  },
};
