// commands/announce.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Create a server announcement.')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('The title of the announcement')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('points')
        .setDescription('Key points, separated by commas (e.g., Point 1, Point 2)')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('ping_role')
        .setDescription('The role to ping with the announcement')
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send the announcement to (defaults to current channel)')
        .setRequired(false)),
  async execute(interaction) {
    const title = interaction.options.getString('title');
    const pointsString = interaction.options.getString('points');
    const pingRole = interaction.options.getRole('ping_role');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    const points = pointsString.split(',').map(p => `• ${p.trim()}`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(points)
      .setColor(0x0099FF) // Blue color
      .setTimestamp()
      .setFooter({ text: `Announced by ${interaction.user.tag}` });

    let content = '';
    if (pingRole) {
      content = `${pingRole}`;
    }

    try {
      await targetChannel.send({ content: content, embeds: [embed] });
      await interaction.reply({ content: 'Announcement sent successfully!', ephemeral: true });
    } catch (error) {
      console.error('Error sending announcement:', error);
      await interaction.reply({ content: 'Failed to send announcement. Do I have permissions to send messages in that channel?', ephemeral: true });
    }
  },
};
