// commands/rob.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob coins from another user.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User  to rob')
        .setRequired(true)),
  cooldown: 600, // 10 minutes
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    if (targetUser.bot) return interaction.reply({ content: 'You cannot rob bots.', ephemeral: true });
    if (targetUser.id === interaction.user.id) return interaction.reply({ content: 'You cannot rob yourself.', ephemeral: true });

    let robber = await User.findOne({ userId: interaction.user.id });
    if (!robber) robber = new User({ userId: interaction.user.id });

    let victim = await User.findOne({ userId: targetUser.id });
    if (!victim) victim = new User({ userId: targetUser.id });

    if (victim.coins < 10) return interaction.reply({ content: `${targetUser.tag} does not have enough coins to rob.`, ephemeral: true });

    // 50% success rate
    if (Math.random() < 0.5) {
      // Success: rob 10-50 coins
      const amount = Math.min(victim.coins, Math.floor(Math.random() * 41) + 10);
      victim.coins -= amount;
      robber.coins += amount;

      await victim.save();
      await robber.save();

      const embed = new EmbedBuilder()
        .setTitle('Robbery Successful!')
        .setDescription(`${interaction.user} robbed ${amount} coins from ${targetUser}! 💰`)
        .setColor(0x00FF00)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } else {
      // Failure: lose 20 coins (if possible)
      const penalty = Math.min(robber.coins, 20);
      robber.coins -= penalty;
      await robber.save();

      const embed = new EmbedBuilder()
        .setTitle('Robbery Failed!')
        .setDescription(`${interaction.user} tried to rob ${targetUser} but got caught and lost ${penalty} coins! 😢`)
        .setColor(0xFF0000)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },
};
