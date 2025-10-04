// commands/beg.js (REPLACE - Premium GUI)
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
        'A kind stranger felt generous and donated **{amount} coins** to you! 🙏',
        'You spotted a lost coin on the ground! You picked up **{amount} coins**.',
        'An anonymous user sent you **{amount} coins** for your valiant efforts.',
        'You earned **{amount} coins** for your inspiring performance.',
        'A rich bot user passed by and dropped **{amount} coins**!'
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)].replace(/\{amount\}/g, amount);

      const embed = new EmbedBuilder()
        .setTitle('🪙 Begging Success!')
        .setDescription(randomMsg)
        .addFields(
            { name: 'New Balance', value: `${user.coins} 💰`, inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else {
      const failMessages = [
        'No one gave you anything. The street is cold. 🥶',
        'The beggar police told you to move along. No earnings.',
        'You begged but only got judgmental stares. 😒',
        'Your voice cracked at the worst time. Failed.',
        'A stray cat stole your hat. Nothing earned.'
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
