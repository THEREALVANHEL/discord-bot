// commands/removecoins.js (REPLACE - Premium GUI + User Tagging)
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
    // FIX: Defer reply immediately to prevent 'Unknown interaction' error due to DB lookup.
    await interaction.deferReply(); 
    
    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      // FIX: Use editReply after deferring
      return interaction.editReply({ content: '❌ **Error:** Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      // FIX: Use editReply after deferring
      return interaction.editReply({ content: `⚠️ **Warning:** ${targetUser} does not have any coins yet.`, ephemeral: true });
    }

    user.coins = Math.max(0, user.coins - amount);
    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('💸 Coins Deducted')
      .setDescription(`Admin ${interaction.user} withdrew **${amount} coins** from ${targetUser}'s wallet.`)
      .addFields(
        { name: 'Target User', value: `${targetUser}`, inline: true },
        { name: 'Amount Removed', value: `**-${amount}** 💰`, inline: true },
        { name: 'New Balance', value: `**${user.coins}** 💰`, inline: true }
      )
      .setColor(0xFF0000)
      .setTimestamp();

    // FIX: Use editReply after deferring
    await interaction.editReply({ embeds: [embed] });
  },
};
