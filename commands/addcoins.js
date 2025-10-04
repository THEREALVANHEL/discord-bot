// commands/addcoins.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addcoins')
    .setDescription('Add coins to a user.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to add coins to')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of coins to add')
        .setRequired(true)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      return interaction.reply({ content: 'Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      user = new User({ userId: targetUser.id });
    }

    user.coins += amount;
    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('Coins Added')
      .setDescription(`Added ${amount} coins to ${targetUser.tag}. They now have ${user.coins} coins.`)
      .setColor(0x00FF00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
