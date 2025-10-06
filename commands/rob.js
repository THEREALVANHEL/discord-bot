// commands/rob.js (REPLACE - Fixing Syntax Error)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob coins from another user.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('User to rob')
        .setRequired(true)), // <-- COMMA IS CRITICAL HERE
  // FIX: Cooldown property now correctly placed and delimited.
  cooldown: 600, // 10 minutes 
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    if (targetUser.bot) return interaction.reply({ content: '❌ **Error:** You cannot rob bots.', ephemeral: true });
    if (targetUser.id === interaction.user.id) return interaction.reply({ content: '❌ **Error:** You cannot rob yourself.', ephemeral: true });

    let robber = await User.findOne({ userId: interaction.user.id });
    if (!robber) robber = new User({ userId: interaction.user.id });

    let victim = await User.findOne({ userId: targetUser.id });
    if (!victim || victim.coins < 50) return interaction.reply({ content: `⚠️ **Safe Target:** ${targetUser} does not have enough coins (min 50) to make it worth the risk.`, ephemeral: true });

    // 30% success rate (70% failure rate)
    if (Math.random() < 0.3) {
      // Success: rob 10% - 20% of victim's coins
      const percentage = Math.random() * (0.20 - 0.10) + 0.10;
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
      // Failure: lose 10% of robber's coins as penalty (max 100)
      const penalty = Math.min(robber.coins, Math.floor(robber.coins * 0.10), 100);
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
