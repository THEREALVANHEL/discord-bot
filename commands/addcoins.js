// commands/addcoins.js (REPLACE - Premium GUI + User Tagging)
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
      user = new User({ userId: targetUser.id });
    }

    user.coins += amount;
    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('💰 Coins Granted')
      .setDescription(`Admin ${interaction.user} deposited **${amount} coins** into ${targetUser}'s wallet.`)
      .addFields(
        { name: 'Target User', value: `${targetUser}`, inline: true },
        { name: 'Amount Added', value: `**+${amount}** 💰`, inline: true },
        { name: 'New Balance', value: `**${user.coins}** 💰`, inline: true }
      )
      .setColor(0x00FF00)
      .setTimestamp();

    // FIX: Use editReply after deferring
    await interaction.editReply({ embeds: [embed] });
  },
};
