// commands/gamble.js (REPLACE - Premium GUI, Cooldown 30s)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamble')
    // FIX: Updated description to reflect RNG odds
    .setDescription('Gamble coins with completely random odds each time you bet.')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount of coins to gamble')
        .setRequired(true)),
  cooldown: 30, // 5 minutes (300) changed to 30 seconds
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    if (amount < 10) return interaction.reply({ content: '❌ **Error:** Minimum gamble amount is 10 coins.', ephemeral: true });

    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) user = new User({ userId: interaction.user.id });

    if (user.coins < amount) return interaction.reply({ content: `❌ **Error:** You don't have enough coins. You have ${user.coins} coins.`, ephemeral: true });

    // FIX: RNG odds calculation (generates a float between 0.01 and 0.99)
    const winChance = Math.random() * 0.98 + 0.01;
    const winChancePercent = (winChance * 100).toFixed(1);

    if (Math.random() < winChance) {
      // Win: double coins
      user.coins += amount;
      await user.save();

      const embed = new EmbedBuilder()
        .setTitle('🎉 High Roller! You Won!')
        .setDescription(`You bet **${amount} coins** and successfully doubled your winnings!`)
        .addFields(
          { name: 'Winnings', value: `+${amount} 💰`, inline: true },
          { name: 'New Balance', value: `${user.coins} 💰`, inline: true },
          // Display the RNG odds
          { name: 'Odds', value: `**${winChancePercent}%** to win`, inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } else {
      // Lose: lose bet
      user.coins -= amount;
      await user.save();

      const embed = new EmbedBuilder()
        .setTitle('😢 Bad Luck! You Lost!')
        .setDescription(`You bet **${amount} coins** but the odds were not in your favor.`)
        .addFields(
          { name: 'Loss', value: `-${amount} 💰`, inline: true },
          { name: 'New Balance', value: `${user.coins} 💰`, inline: true },
          // Display the RNG odds
          { name: 'Odds', value: `**${winChancePercent}%** to win`, inline: true }
        )
        .setColor(0xFF0000)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },
};
