// commands/givecoins.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const ms = require('ms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('givecoins')
    .setDescription('Give coins to another user.')
    .addUser Option(option =>
      option.setName('target')
        .setDescription('User  to give coins to')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount of coins to give')
        .setRequired(true)),
  async execute(interaction) {
    const targetUser  = interaction.options.getUser ('target');
    const amount = interaction.options.getInteger('amount');

    if (targetUser .bot) return interaction.reply({ content: 'You cannot give coins to bots.', ephemeral: true });
    if (targetUser .id === interaction.user.id) return interaction.reply({ content: 'You cannot give coins to yourself.', ephemeral: true });
    if (amount <= 0) return interaction.reply({ content: 'Amount must be positive.', ephemeral: true });

    const giver = await User.findOne({ userId: interaction.user.id }) || new User({ userId: interaction.user.id });
    const receiver = await User.findOne({ userId: targetUser .id }) || new User({ userId: targetUser .id });

    if (giver.coins < amount) return interaction.reply({ content: `You don't have enough coins. You have ${giver.coins} coins.`, ephemeral: true });

    // Check daily limit for non-mod/admin
    const config = interaction.client.config;
    const member = interaction.member;
    const isModOrAdmin = member.roles.cache.has(config.roles.leadMod) || member.roles.cache.has(config.roles.mod) || member.roles.cache.has(config.roles.forgottenOne) || member.roles.cache.has(config.roles.overseer);

    if (!isModOrAdmin) {
      const now = Date.now();
      if (giver.dailyGives && giver.dailyGives.lastGive) {
        const diff = now - giver.dailyGives.lastGive.getTime();
        if (diff > ms('24h')) {
          giver.dailyGives.count = 0;
          giver.dailyGives.lastGive = new Date();
        }
      } else {
        giver.dailyGives = { count: 0, lastGive: new Date() };
      }

      if (giver.dailyGives.count + amount > 50) {
        return interaction.reply({ content: 'You can only give a maximum of 50 coins per day.', ephemeral: true });
      }

      giver.dailyGives.count += amount;
      giver.dailyGives.lastGive = new Date();
    }

    giver.coins -= amount;
    receiver.coins += amount;

    await giver.save();
    await receiver.save();

    const embed = new EmbedBuilder()
      .setTitle('Coins Given')
      .setDescription(`${interaction.user} gave ${amount} coins to ${targetUser }.`)
      .setColor(0x00FF00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
