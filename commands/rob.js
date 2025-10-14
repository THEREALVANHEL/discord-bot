// commands/rob.js (UPDATED BALANCING)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob coins from another user.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('User to rob')
        .setRequired(true)), 
  // FIX: Cooldown increased to 1 hour (3600 seconds)
  cooldown: 3600, // 1 hour 
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    if (targetUser.bot) return interaction.reply({ content: '❌ **Error:** You cannot rob bots.', ephemeral: true });
    if (targetUser.id === interaction.user.id) return interaction.reply({ content: '❌ **Error:** You cannot rob yourself.', ephemeral: true });

    let robber = await User.findOne({ userId: interaction.user.id });
    if (!robber) robber = new User({ userId: interaction.user.id });

    let victim = await User.findOne({ userId: targetUser.id });
    if (!victim || victim.coins < 50) return interaction.reply({ content: `⚠️ **Safe Target:** ${targetUser} does not have enough coins (min 50) to make it worth the risk.`, ephemeral: true });

    // Reworked: 20% success rate (down from 30%)
    if (Math.random() < 0.2) {
      // Success: rob 8% - 15% of victim's coins (down from 10%-20%)
      const percentage = Math.random() * (0.15 - 0.08) + 0.08;
      const calculatedAmount = Math.floor(victim.coins * percentage);
      const amount = Math.min(victim.coins, Math.max(10, calculatedAmount)); // Min 10 coins
      
      victim.coins -= amount;
      robber.coins += amount;

      await victim.save();
      await robber.save();

      const embed = new EmbedBuilder()
        .setTitle('💸 Robbery Successful!')
        .setDescription(`**${interaction.user}** successfully pickpocketed **${amount} coins** from **${targetUser}**!`)
        .addFields(
          { name: 'Gains', value: `+${amount} 💰`, inline: true },
          { name: 'Your New Balance', value: `${robber.coins} 💰`, inline: true },
          { name: `${targetUser.tag}'s New Balance`, value: `${victim.coins} 💰`, inline: false }
        )
        .setColor(0x00FF00)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } else {
      // Failure: lose 15% of robber's coins as penalty (max 150) (up from 10% / max 100)
      const penalty = Math.min(robber.coins, Math.floor(robber.coins * 0.15), 150);
      robber.coins -= penalty;
      await robber.save();

      const embed = new EmbedBuilder()
        .setTitle('🚨 Robbery Failed!')
        .setDescription(`**${interaction.user}** tried to rob **${targetUser}** but was caught and had to pay a **${penalty} coin** fine!`)
        .addFields(
          { name: 'Penalty', value: `-${penalty} 💰`, inline: true },
          { name: 'Your New Balance', value: `${robber.coins} 💰`, inline: true }
        )
        .setColor(0xFF0000)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },
};
