// commands/gamble.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Gamble coins with a 25% chance to double your bet.')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount of coins to gamble')
        .setRequired(true)),
  cooldown: 300, // 5 minutes
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    if (amount < 10) return interaction.reply({ content: 'Minimum gamble amount is 10 coins.', ephemeral: true });

    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) user = new User({ userId: interaction.user.id });

    if (user.coins < amount) return interaction.reply({ content: `You don't have enough coins. You have ${user.coins} coins.`, ephemeral: true });

    // 25% success rate
    if (Math.random() < 0.25) {
      // Win: double coins
      user.coins += amount;
      await user.save();

      const embed = new EmbedBuilder()
        .setTitle('🎉 You Won!')
        .setDescription(`You gambled ${amount} coins and won! You now have ${user.coins} coins.`)
        .setColor(0x00FF00)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } else {
      // Lose: lose bet
      user.coins -= amount;
      await user.save();

      const embed = new EmbedBuilder()
        .setTitle('😢 You Lost!')
        .setDescription(`You gambled ${amount} coins and lost. You now have ${user.coins} coins.`)
        .setColor(0xFF0000)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },
};
