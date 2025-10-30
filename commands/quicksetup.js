// commands/quicksetup.js (REPLACE - Refactored for maintainability)
const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

// --- IMPROVEMENT: Map for channel options ---
// Maps the command option name to its database key and display name
const channelOptionsMap = {
  'welcome_channel': { dbKey: 'welcomeChannelId', name: 'Welcome Channel' },
  'leave_channel': { dbKey: 'leaveChannelId', name: 'Leave Channel' },
  'autolog_channel': { dbKey: 'autologChannelId', name: 'Auto-Log Channel' },
  'modlog_channel': { dbKey: 'modlogChannelId', name: 'Mod-Log Channel' },
  'ai_log_channel': { dbKey: 'aiLogChannelId', name: 'AI-Log Channel' },
  'ai_channel': { dbKey: 'aiChannelId', name: 'AI Channel' },
  'suggestion_channel': { dbKey: 'suggestionChannelId', name: 'Suggestion Channel' },
  'ticket_panel_channel': { dbKey: 'ticketPanelChannelId', name: 'Ticket Panel Channel' },
  'ticket_category': { dbKey: 'ticketCategoryId', name: 'Ticket Category' },
  'level_up_channel': { dbKey: 'levelUpChannelId', name: 'Level Up Channel' }
};

// --- IMPROVEMENT: Map for boolean options ---
const booleanOptionsMap = {
  'ai_anonymous_mode': { dbKey: 'aiAnonymousMode', name: 'AI Anonymous Mode' },
  'ai_math_mode': { dbKey: 'aiMathMode', name: 'AI Math Mode' }
};

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
    .addChannelOption(option => 
        option.setName('ai_channel')
          .setDescription('Set the designated AI chat channel')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false))
    .addBooleanOption(option => 
        option.setName('ai_anonymous_mode')
          .setDescription('Enable anonymous mode for AI channel (hides usernames)')
          .setRequired(false))
    .addBooleanOption(option => 
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
        
  // --- REFACTORED EXECUTE FUNCTION ---
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let settings = await Settings.findOne({ guildId: interaction.guild.id });
    if (!settings) {
      settings = new Settings({ guildId: interaction.guild.id });
    }

    const updatedFields = [];
    const { options } = interaction; // Get the options from the interaction

    // --- IMPROVEMENT: Loop through channel options ---
    for (const [optionName, config] of Object.entries(channelOptionsMap)) {
      const channel = options.getChannel(optionName);
      if (channel) {
        settings[config.dbKey] = channel.id; // Dynamically set the correct key
        updatedFields.push(`${config.name}: ${channel}`);
      }
    }

    // --- IMPROVEMENT: Loop through boolean options ---
    for (const [optionName, config] of Object.entries(booleanOptionsMap)) {
      const booleanValue = options.getBoolean(optionName);
      if (booleanValue !== null) { // Check for null, as 'false' is a valid input
        settings[config.dbKey] = booleanValue;
        updatedFields.push(`${config.name}: ${booleanValue ? 'Enabled' : 'Disabled'}`);
      }
    }

    // --- Handle special case: no_xp_channels (as it's an array) ---
    const noXpChannels = [];
    const noXpChannel1 = options.getChannel('no_xp_channel_1');
    const noXpChannel2 = options.getChannel('no_xp_channel_2');
    
    if (noXpChannel1) noXpChannels.push(noXpChannel1.id);
    if (noXpChannel2) noXpChannels.push(noXpChannel2.id);

    if (noXpChannels.length > 0) {
      // Use Set to avoid duplicates if user selects the same channel twice
      settings.noXpChannels = [...new Set([...settings.noXpChannels, ...noXpChannels])];
      updatedFields.push(`No-XP Channels added: ${noXpChannels.map(id => `<#${id}>`).join(', ')}`);
    }

    // --- Save and Reply ---
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
