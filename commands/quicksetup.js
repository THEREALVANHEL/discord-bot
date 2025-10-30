// commands/quicksetup.js (REPLACE - Added all AI options)
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
        option.setName('ai_log_channel')
          .setDescription('Channel for AI command execution logs')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false))
    .addChannelOption(option => // NEW
        option.setName('ai_channel')
          .setDescription('Set the designated AI chat channel')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false))
    .addBooleanOption(option => // NEW
        option.setName('ai_anonymous_mode')
          .setDescription('Enable anonymous mode for AI channel (hides usernames)')
          .setRequired(false))
    .addBooleanOption(option => // NEW
        option.setName('ai_math_mode')
          .setDescription('Enable automatic math expression evaluation')
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
      option.setName('level_up_channel')
        .setDescription('Channel for level up messages (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText)
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
    
    const aiLogChannel = interaction.options.getChannel('ai_log_channel');
    if (aiLogChannel) {
      settings.aiLogChannelId = aiLogChannel.id;
      updatedFields.push(`AI-Log Channel: ${aiLogChannel}`);
    }

    // --- NEW AI SETTINGS ---
    const aiChannel = interaction.options.getChannel('ai_channel');
    if (aiChannel) {
      settings.aiChannelId = aiChannel.id;
      updatedFields.push(`AI Channel: ${aiChannel}`);
    }

    const anonymousMode = interaction.options.getBoolean('ai_anonymous_mode');
    if (anonymousMode !== null) {
      settings.aiAnonymousMode = anonymousMode;
      updatedFields.push(`AI Anonymous Mode: ${anonymousMode ? 'Enabled' : 'Disabled'}`);
    }

    const mathMode = interaction.options.getBoolean('ai_math_mode');
    if (mathMode !== null) {
      settings.aiMathMode = mathMode;
      updatedFields.push(`AI Math Mode: ${mathMode ? 'Enabled' : 'Disabled'}`);
    }
    // --- END NEW AI SETTINGS ---

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
    
    const levelUpChannel = interaction.options.getChannel('level_up_channel');
    if (levelUpChannel) {
      settings.levelUpChannelId = levelUpChannel.id;
      updatedFields.push(`Level Up Channel: ${levelUpChannel}`);
    }

    const noXpChannels = [];
    const noXpChannel1 = interaction.options.getChannel('no_xp_channel_1');
    if (noXpChannel1) noXpChannels.push(noXpChannel1.id);
    const noXpChannel2 = interaction.options.getChannel('no_xp_channel_2');
    if (noXpChannel2) noXpChannels.push(noXpChannel2.id);

    if (noXpChannels.length > 0) {
      settings.noXpChannels = [...new Set([...settings.noXpChannels, ...noXpChannels])];
      updatedFields.push(`No-XP Channels added: ${noXpChannels.map(id => `<#${id}>`).join(', ')}`);
    }

    await settings.save();

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Quick Setup Complete')
      .setDescription('The essential channels have been configured successfully.')
      .addFields(
        { name: 'Updated Settings', value: updatedFields.length > 0 ? updatedFields.join('\n') : 'No settings were updated.' }
      )
      .setColor(0x7289DA)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
