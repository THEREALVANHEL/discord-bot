// commands/removewarn.js (REPLACE - Success reply now visible to everyone)
const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removewarn')
    .setDescription('Remove a warning from a user by index.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User  to remove warning from')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('index')
        .setDescription('Warning number to remove (1-based)')
        .setRequired(true)),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const index = interaction.options.getInteger('index');

    let user = await User.findOne({ userId: target.id });
    if (!user || !user.warnings.length) {
      return interaction.reply({ content: `${target.tag} has no warnings.`, ephemeral: true });
    }

    if (index < 1 || index > user.warnings.length) {
      return interaction.reply({ content: `Invalid warning number (1-${user.warnings.length}).`, ephemeral: true });
    }

    const removedWarn = user.warnings.splice(index - 1, 1)[0];
    await user.save();

    // Public confirmation (visible to everyone)
    await interaction.reply({
      content: `🗑️ **Warning Removed:** Warning #${index} has been removed from ${target.tag} by ${interaction.user.tag}. (Reason was: "${removedWarn.reason}") Remaining warnings: ${user.warnings.length}`,
      ephemeral: false
    });
  },
};
