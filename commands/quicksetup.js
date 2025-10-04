// commands/quicksetup.js
const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quicksetup')
    .setDescription('Quickly set up essential bot channels.')
    .addChannelOption(option =>
      option.setName('welcome_channel')
        .setDescription('Channel for welcome messages')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('leave_channel')
        .setDescription('Channel for leave messages')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('autolog_channel')
        .setDescription('Channel for message edits/deletes logging')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('modlog_channel')
        .setDescription('Channel for moderation actions logging')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('suggestion_channel')
        .setDescription('Channel for suggestions')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('ticket_panel_channel')
        .setDescription('Channel for the ticket creation panel')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('ticket_category')
        .setDescription('Category for new ticket channels')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('no_xp_channel_1')
        .setDescription('Channel where XP gain is disabled')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('no_xp_channel_2')
        .setDescription('Another channel where XP gain is disabled')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let settings = await Settings.findOne({ guildId: interaction.guild.id });
    if (!settings) {
      settings = new Settings({ guildId: interaction.guild.id });
    }

    const updatedFields = [];

    const welcomeChannel = interaction.options.getChannel('welcome_channel');
    if (welcomeChannel) {
      settings.welcomeChannelId = welcomeChannel.id;
      updatedFields.push(`Welcome Channel: ${welcomeChannel}`);
    }

    const leaveChannel = interaction.options.getChannel('leave_channel');
    if (leaveChannel) {
      settings.leaveChannelId = leaveChannel.id;
      updatedFields.push(`Leave Channel: ${leaveChannel}`);
    }

    const autologChannel = interaction.options.getChannel('autolog_channel');
    if (autologChannel) {
      settings.autologChannelId = autologChannel.id;
      updatedFields.push(`Auto-Log Channel: ${autologChannel}`);
    }

    const modlogChannel = interaction.options.getChannel('modlog_channel');
    if (modlogChannel) {
      settings.modlogChannelId = modlogChannel.id;
      updatedFields.push(`Mod-Log Channel: ${modlogChannel}`);
    }

    const suggestionChannel = interaction.options.getChannel('suggestion_channel');
    if (suggestionChannel) {
      settings.suggestionChannelId = suggestionChannel.id;
      updatedFields.push(`Suggestion Channel: ${suggestionChannel}`);
    }

    const ticketPanelChannel = interaction.options.getChannel('ticket_panel_channel');
    if (ticketPanelChannel) {
      settings.ticketPanelChannelId = ticketPanelChannel.id;
      updatedFields.push(`Ticket Panel Channel: ${ticketPanelChannel}`);
    }

    const ticketCategory = interaction.options.getChannel('ticket_category');
    if (ticketCategory) {
      settings.ticketCategoryId = ticketCategory.id;
      updatedFields.push(`Ticket Category: ${ticketCategory}`);
    }

    const noXpChannels = [];
    const noXpChannel1 = interaction.options.getChannel('no_xp_channel_1');
    if (noXpChannel1) noXpChannels.push(noXpChannel1.id);
    const noXpChannel2 = interaction.options.getChannel('no_xp_channel_2');
    if (noXpChannel2) noXpChannels.push(noXpChannel2.id);

    if (noXpChannels.length > 0) {
      settings.noXpChannels = [...new Set([...settings.noXpChannels, ...noXpChannels])]; // Add unique new channels
      updatedFields.push(`No-XP Channels added: ${noXpChannels.map(id => `<#${id}>`).join(', ')}`);
    }

    await settings.save();

    const embed = new EmbedBuilder()
      .setTitle('Quick Setup Complete')
      .setDescription('The following settings have been updated:')
      .addFields(
        { name: 'Updated Settings', value: updatedFields.length > 0 ? updatedFields.join('\n') : 'No settings were updated.' }
      )
      .setColor(0x2ECC71) // Emerald Green
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
