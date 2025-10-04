// commands/gamelog.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamelog')
    .setDescription('Log details of a game session.')
    .addStringOption(option =>
      option.setName('host')
        .setDescription('The host of the game')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('cohost')
        .setDescription('The co-host of the game')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('guide')
        .setDescription('The guide for the game')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('medic')
        .setDescription('The medic for the game')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('participants')
        .setDescription('List of participants (e.g., User1, User2, User3)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time_hosted')
        .setDescription('When the game was hosted (e.g., 2023-10-27 19:00 UTC)')
        .setRequired(true))
    .addAttachmentOption(option =>
      option.setName('image')
        .setDescription('An image related to the game session')
        .setRequired(false)),
  async execute(interaction) {
    const host = interaction.options.getString('host');
    const cohost = interaction.options.getString('cohost');
    const guide = interaction.options.getString('guide');
    const medic = interaction.options.getString('medic');
    const participants = interaction.options.getString('participants');
    const timeHosted = interaction.options.getString('time_hosted');
    const image = interaction.options.getAttachment('image');

    const embed = new EmbedBuilder()
      .setTitle('🎮 Game Session Log')
      .setColor(0x3498DB) // Blue
      .addFields(
        { name: 'Host', value: host, inline: true },
        { name: 'Co-Host', value: cohost || 'N/A', inline: true },
        { name: 'Guide', value: guide || 'N/A', inline: true },
        { name: 'Medic', value: medic || 'N/A', inline: true },
        { name: 'Participants', value: participants },
        { name: 'Time Hosted', value: timeHosted },
      )
      .setTimestamp();

    if (image) {
      embed.setImage(image.url);
    }

    await interaction.reply({ embeds: [embed] });
  },
};
