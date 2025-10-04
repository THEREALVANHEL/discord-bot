// commands/removewarn.js (REPLACE - Success reply now visible to everyone, added 'all' option)
const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removewarn')
    .setDescription('Remove a warning from a user by index or remove all.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User to remove warning from')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('index')
        .setDescription('Warning number to remove (1-based)')
        .setRequired(false)) // Changed to false to allow 'all'
    .addStringOption(option =>
      option.setName('all_warns')
        .setDescription('Type "all" to remove all warnings.')
        .setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const index = interaction.options.getInteger('index');
    const allWarns = interaction.options.getString('all_warns')?.toLowerCase();

    let user = await User.findOne({ userId: target.id });
    if (!user || !user.warnings.length) {
      return interaction.reply({ content: `${target.tag} has no warnings.`, ephemeral: true });
    }

    if (allWarns === 'all') {
      const removedCount = user.warnings.length;
      user.warnings = [];
      await user.save();
      
      // Public confirmation (visible to everyone)
      await interaction.reply({
        content: `🗑️ **All Warnings Removed:** **${removedCount}** warnings have been cleared from ${target.tag} by ${interaction.user.tag}.`,
        ephemeral: false
      });
    } else if (index !== null) {
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
    } else {
         return interaction.reply({ content: `❌ **Error:** Please specify a warning \`index\` (e.g., 1) or type \`all\` for the \`all_warns\` option.`, ephemeral: true });
    }
  },
};
