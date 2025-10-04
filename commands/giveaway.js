// commands/giveaway.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway.')
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 1h, 30m)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('prize')
        .setDescription('Prize description')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('winners')
        .setDescription('Number of winners')
        .setRequired(true)),
  async execute(interaction, client) {
    const durationStr = interaction.options.getString('duration');
    const prize = interaction.options.getString('prize');
    const winnersCount = interaction.options.getInteger('winners');

    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 10000) {
      return interaction.reply({ content: 'Please provide a valid duration of at least 10 seconds.', ephemeral: true });
    }
    if (winnersCount < 1 || winnersCount > 10) {
      return interaction.reply({ content: 'Number of winners must be between 1 and 10.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎉 Giveaway!')
      .setDescription(`Prize: **${prize}**\nReact with 🎉 to enter!\nEnds <t:${Math.floor((Date.now() + durationMs) / 1000)}:R>`)
      .setColor(0xFFD700)
      .setTimestamp();

    const giveawayMessage = await interaction.channel.send({ embeds: [embed] });
    await giveawayMessage.react('🎉');

    // Store giveaway info
    client.giveaways.set(giveaway
