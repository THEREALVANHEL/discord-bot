// commands/reminders.js (REPLACE - View made public)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
// ... (data block)
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    let user = await User.findOne({ userId: interaction.user.id });

    if (!user || user.reminders.length === 0) {
      return interaction.reply({ content: '✅ **No Reminders:** You have no active reminders set.', ephemeral: true });
    }
    
    // FIX: Defer reply, but only ephemeral if it's 'remove'
    await interaction.deferReply({ ephemeral: subcommand !== 'view' }); 

    if (subcommand === 'view') {
      const embed = new EmbedBuilder()
// ... (embed creation code)

      user.reminders.forEach((reminder, index) => {
// ... (addFields code)
      });

      await interaction.editReply({ embeds: [embed] }); // Removed ephemeral: true for view

    } else if (subcommand === 'remove') {
// ... (rest of remove subcommand logic remains ephemeral: true)
