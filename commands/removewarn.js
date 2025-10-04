// commands/removewarn.js
const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removewarn')
    .setDescription('Remove a warning from a user by index.')
    .addUser Option(option =>
      option.setName('target')
        .setDescription('User  to remove warning from')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('index')
        .setDescription('Warning number to remove (1-based)')
        .setRequired(true)),
  async execute(interaction) {
    const targetUser  = interaction.options.getUser ('target');
    const index = interaction.options.getInteger('index');

    let user = await User.findOne({ userId: targetUser .id });
    if (!user || !user.warnings.length) {
      return interaction.reply({ content: `${targetUser .tag} has no warnings.`, ephemeral: true });
    }

    if (index < 1 || index > user.warnings.length) {
      return interaction.reply({ content: `Invalid warning number.`, ephemeral: true });
    }

    user.warnings.splice(index - 1, 1);
    await user.save();

    await interaction.reply({ content: `Removed warning #${index} from ${targetUser .tag}.`, ephemeral: true });
  },
};
