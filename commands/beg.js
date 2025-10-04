// commands/beg.js (NEW)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('beg')
    .setDescription('Beg for coins from strangers.'),
  cooldown: 120, // 2 minutes
  async execute(interaction) {
    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) {
      user = new User({ userId: interaction.user.id });
    }

    // 60% success rate
    if (Math.random() < 0.6) {
      const amount = Math.floor(Math.random() * 21) + 10; // 10-30 coins
      user.coins += amount;
      await user.save();

      const messages = [
        'A kind stranger gave you 15 coins! 🪙',
        'You begged and got 20 coins from a passerby!',
        'Someone pitied you and tossed 10 coins your way.',
        'Lucky day! You earned 25 coins begging.',
        'A rich user felt sorry and gave you 30 coins!'
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)].replace('15', amount).replace('20', amount).replace('10', amount).replace('25', amount).replace('30', amount);

      const embed = new EmbedBuilder()
        .setTitle('🪙 Begging Success!')
        .setDescription(randomMsg)
        .setColor(0x00FF00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else {
      const failMessages = [
        'No one gave you anything. Keep trying!',
        'Strangers ignored your begging. 😔',
        'You begged but got nothing this time.',
        'Bad luck! Empty pockets remain.',
        'A dog chased you away while begging.'
      ];
      const randomFail = failMessages[Math.floor(Math.random() * failMessages.length)];

      const embed = new EmbedBuilder()
        .setTitle('😔 Begging Failed')
        .setDescription(randomFail)
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
