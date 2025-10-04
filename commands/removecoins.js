// commands/removecoins.js (REPLACE - Premium GUI)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removecoins')
    .setDescription('Remove coins from a user.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to remove coins from')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of coins to remove')
        .setRequired(true)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      return interaction.reply({ content: '❌ **Error:** Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      return interaction.reply({ content: `⚠️ ${targetUser.tag} does not have any coins yet.`, ephemeral: true });
    }

    user.coins = Math.max(0, user.coins - amount);
    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('💸 Coins Deducted')
      .setDescription(`Successfully withdrew **${amount} coins** from ${targetUser}'s wallet.`)
      .addFields(
        { name: 'New Balance', value: `${user.coins} coins 💰`, inline: true }
      )
      .setColor(0xFF0000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
