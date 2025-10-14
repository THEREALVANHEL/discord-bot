// commands/announce.js (REPLACE - Fixed double reply issue)
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
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send the announcement to (defaults to current channel)')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('ping_role')
        .setDescription('The role to ping with the announcement')
        .setRequired(false)),
  async execute(interaction) {
    // FIX: Defer reply first to acknowledge the interaction
    await interaction.deferReply({ ephemeral: true });

    const title = interaction.options.getString('title');
    const pointsString = interaction.options.getString('points');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const pingRole = interaction.options.getRole('ping_role');

    const points = pointsString.split(',').map(p => `• **${p.trim()}**`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`📣 ${title}`)
      .setDescription(points)
      .setColor(0x0099FF)
      .setTimestamp()
      .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setFooter({ text: `Announced by ${interaction.user.tag}` });

    let content = '';
    if (pingRole) {
      content = `${pingRole}`;
    }

    try {
      // 1. Send the main message
      await targetChannel.send({ content: content, embeds: [embed] });

      // 2. Edit the deferred reply to confirm success
      await interaction.editReply({ content: `✅ **Announcement Sent!** The message has been broadcast to ${targetChannel}.` });
    } catch (error) {
      console.error('Error sending announcement:', error);
      // 3. Edit the deferred reply to send the error
      await interaction.editReply({ content: '❌ **Error:** Failed to send announcement. Check bot permissions.', ephemeral: true });
    }
  },
};
