// commands/quicksetup.js (REWORKED - Comprehensive Setup with Categories)
const { SlashCommandBuilder, ChannelType, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quicksetup')
    .setDescription('Interactive setup wizard for all bot features')
    .addSubcommand(subcommand =>
      subcommand.setName('wizard')
        .setDescription('Launch interactive setup wizard'))
    .addSubcommand(subcommand =>
      subcommand.setName('channels')
        .setDescription('Quickly set up essential channels')
        .addChannelOption(option =>
          option.setName('welcome')
            .setDescription('Welcome messages channel')
            .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
          option.setName('leave')
            .setDescription('Leave messages channel')
            .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
          option.setName('autolog')
            .setDescription('Message edit/delete logging channel')
            .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
          option.setName('modlog')
            .setDescription('Moderation actions logging channel')
            .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
          option.setName('levelup')
            .setDescription('Level up announcements channel')
            .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
          option.setName('suggestions')
            .setDescription('Suggestions channel')
            .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
          option.setName('ai')
            .setDescription('AI chat channel')
            .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
          option.setName('ai_log')
            .setDescription('AI command logs channel')
            .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(subcommand =>
      subcommand.setName('tickets')
        .setDescription('Set up ticket system')
        .addChannelOption(option =>
          option.setName('panel_channel')
            .setDescription('Where to send the ticket creation panel')
            .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
          option.setName('category')
            .setDescription('Category for new ticket channels')
            .addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand(subcommand =>
      subcommand.setName('noxp')
        .setDescription('Configure channels where XP is disabled')
        .addChannelOption(option =>
          option.setName('channel1')
            .setDescription('First no-XP channel')
            .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
          option.setName('channel2')
            .setDescription('Second no-XP channel')
            .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
          option.setName('channel3')
            .setDescription('Third no-XP channel')
            .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(subcommand =>
      subcommand.setName('view')
        .setDescription('View current server configuration'))
    .addSubcommand(subcommand =>
      subcommand.setName('reset')
        .setDescription('Reset all settings to default')),
        
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Permission check
    if (!interaction.member.permissions.has('ManageGuild')) {
      return interaction.reply({ 
        content: '❌ You need the `Manage Guild` permission to use this command.',
        ephemeral: true 
      });
    }

    let settings = await Settings.findOne({ guildId: interaction.guild.id });
    if (!settings) {
      settings = new Settings({ guildId: interaction.guild.id });
    }

    // === INTERACTIVE WIZARD ===
    if (subcommand === 'wizard') {
      await interaction.deferReply({ ephemeral: true });

      const categories = [
        {
          label: '📢 Welcome & Goodbyes',
          value: 'welcome',
          description: 'Configure welcome and leave messages',
          emoji: '👋'
        },
        {
          label: '📝 Logging Channels',
          value: 'logging',
          description: 'Set up message and moderation logs',
          emoji: '📋'
        },
        {
          label: '🎫 Ticket System',
          value: 'tickets',
          description: 'Configure support ticket system',
          emoji: '🎫'
        },
        {
          label: '🤖 AI Features',
          value: 'ai',
          description: 'Set up AI chat and logging',
          emoji: '🤖'
        },
        {
          label: '⭐ Leveling System',
          value: 'leveling',
          description: 'Configure XP and level-ups',
          emoji: '⭐'
        },
        {
          label: '💡 Suggestions',
          value: 'suggestions',
          description: 'Set up suggestion system',
          emoji: '💡'
        }
      ];

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('setup_category')
        .setPlaceholder('Choose a category to configure')
        .addOptions(categories);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Server Setup Wizard')
        .setDescription('Welcome to the interactive setup wizard! Select a category below to begin configuration.')
        .setColor(0x7289DA)
        .addFields(
          { name: '📢 Welcome & Goodbyes', value: 'Configure member join/leave messages', inline: true },
          { name: '📝 Logging', value: 'Track messages and mod actions', inline: true },
          { name: '🎫 Tickets', value: 'Support ticket system', inline: true },
          { name: '🤖 AI Features', value: 'AI chat and commands', inline: true },
          { name: '⭐ Leveling', value: 'XP and rank system', inline: true },
          { name: '💡 Suggestions', value: 'Community feedback', inline: true }
        )
        .setFooter({ text: 'Select a category from the menu below' });

      await interaction.editReply({ embeds: [embed], components: [row] });

      // Handle menu interactions
      const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 300000 // 5 minutes
      });

      collector.on('collect', async i => {
        if (i.customId === 'setup_category') {
          const category = i.values[0];
          // Here you would show specific configuration for each category
          // For brevity, showing a simple response
          await i.update({ 
            content: `✅ Selected: **${categories.find(c => c.value === category).label}**\n\nThis would show detailed setup options for this category.`,
            components: [] 
          });
          collector.stop();
        }
      });
    }

    // === CHANNELS QUICK SETUP ===
    else if (subcommand === 'channels') {
      await interaction.deferReply({ ephemeral: true });

      const channelMap = {
        'welcome': { option: 'welcome', dbKey: 'welcomeChannelId', name: 'Welcome' },
        'leave': { option: 'leave', dbKey: 'leaveChannelId', name: 'Leave' },
        'autolog': { option: 'autolog', dbKey: 'autologChannelId', name: 'Auto-Log' },
        'modlog': { option: 'modlog', dbKey: 'modlogChannelId', name: 'Mod-Log' },
        'levelup': { option: 'levelup', dbKey: 'levelUpChannelId', name: 'Level Up' },
        'suggestions': { option: 'suggestions', dbKey: 'suggestionChannelId', name: 'Suggestions' },
        'ai': { option: 'ai', dbKey: 'aiChannelId', name: 'AI Chat' },
        'ai_log': { option: 'ai_log', dbKey: 'aiLogChannelId', name: 'AI Log' }
      };

      const updated = [];
      for (const [key, config] of Object.entries(channelMap)) {
        const channel = interaction.options.getChannel(config.option);
        if (channel) {
          settings[config.dbKey] = channel.id;
          updated.push(`${config.name}: ${channel}`);
        }
      }

      if (updated.length === 0) {
        return interaction.editReply({ content: '⚠️ No channels were specified. Please provide at least one channel.' });
      }

      await settings.save();

      const embed = new EmbedBuilder()
        .setTitle('✅ Channels Configured')
        .setDescription('The following channels have been set up successfully:')
        .addFields({ name: 'Updated Channels', value: updated.join('\n') })
        .setColor(0x00FF00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    // === TICKET SETUP ===
    else if (subcommand === 'tickets') {
      await interaction.deferReply({ ephemeral: true });

      const panelChannel = interaction.options.getChannel('panel_channel');
      const category = interaction.options.getChannel('category');

      const updated = [];
      if (panelChannel) {
        settings.ticketPanelChannelId = panelChannel.id;
        updated.push(`Panel Channel: ${panelChannel}`);
      }
      if (category) {
        settings.ticketCategoryId = category.id;
        updated.push(`Ticket Category: ${category.name}`);
      }

      if (updated.length === 0) {
        return interaction.editReply({ content: '⚠️ Please specify at least one option.' });
      }

      await settings.save();

      const embed = new EmbedBuilder()
        .setTitle('🎫 Ticket System Configured')
        .setDescription('Ticket system settings have been updated.')
        .addFields({ name: 'Updated Settings', value: updated.join('\n') })
        .setColor(0x00BFFF)
        .setFooter({ text: 'Use /tpanel or ?tpanel to create the ticket panel' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    // === NO-XP CHANNELS ===
    else if (subcommand === 'noxp') {
      await interaction.deferReply({ ephemeral: true });

      const channels = [
        interaction.options.getChannel('channel1'),
        interaction.options.getChannel('channel2'),
        interaction.options.getChannel('channel3')
      ].filter(Boolean);

      if (channels.length === 0) {
        return interaction.editReply({ content: '⚠️ Please specify at least one channel.' });
      }

      const newChannelIds = channels.map(c => c.id);
      settings.noXpChannels = [...new Set([...settings.noXpChannels, ...newChannelIds])];
      await settings.save();

      const embed = new EmbedBuilder()
        .setTitle('🚫 No-XP Channels Updated')
        .setDescription('XP gain is now disabled in the following channels:')
        .addFields({ 
          name: 'No-XP Channels', 
          value: settings.noXpChannels.map(id => `<#${id}>`).join('\n') 
        })
        .setColor(0xFF9900)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    // === VIEW CONFIGURATION ===
    else if (subcommand === 'view') {
      await interaction.deferReply({ ephemeral: true });

      const config = {
        'Welcome Channel': settings.welcomeChannelId ? `<#${settings.welcomeChannelId}>` : '*Not set*',
        'Leave Channel': settings.leaveChannelId ? `<#${settings.leaveChannelId}>` : '*Not set*',
        'Auto-Log Channel': settings.autologChannelId ? `<#${settings.autologChannelId}>` : '*Not set*',
        'Mod-Log Channel': settings.modlogChannelId ? `<#${settings.modlogChannelId}>` : '*Not set*',
        'AI Channel': settings.aiChannelId ? `<#${settings.aiChannelId}>` : '*Not set*',
        'AI Log Channel': settings.aiLogChannelId ? `<#${settings.aiLogChannelId}>` : '*Not set*',
        'Level Up Channel': settings.levelUpChannelId ? `<#${settings.levelUpChannelId}>` : '*Not set*',
        'Suggestion Channel': settings.suggestionChannelId ? `<#${settings.suggestionChannelId}>` : '*Not set*',
        'Ticket Panel Channel': settings.ticketPanelChannelId ? `<#${settings.ticketPanelChannelId}>` : '*Not set*',
        'Ticket Category': settings.ticketCategoryId ? `<#${settings.ticketCategoryId}>` : '*Not set*'
      };

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Server Configuration')
        .setDescription('Current bot settings for this server:')
        .setColor(0x7289DA)
        .setTimestamp();

      for (const [key, value] of Object.entries(config)) {
        embed.addFields({ name: key, value: value, inline: true });
      }

      if (settings.noXpChannels.length > 0) {
        embed.addFields({ 
          name: 'No-XP Channels', 
          value: settings.noXpChannels.map(id => `<#${id}>`).join(', ').substring(0, 1024),
          inline: false
        });
      }

      embed.addFields({
        name: 'Reaction Roles',
        value: `${settings.reactionRoles.length} configured`,
        inline: true
      });

      await interaction.editReply({ embeds: [embed] });
    }

    // === RESET CONFIGURATION ===
    else if (subcommand === 'reset') {
      await interaction.deferReply({ ephemeral: true });

      // Create a new settings document (resets everything)
      await Settings.findOneAndDelete({ guildId: interaction.guild.id });
      settings = new Settings({ guildId: interaction.guild.id });
      await settings.save();

      const embed = new EmbedBuilder()
        .setTitle('🔄 Configuration Reset')
        .setDescription('All bot settings have been reset to default values.')
        .setColor(0xFF0000)
        .setTimestamp()
        .setFooter({ text: 'Use /quicksetup to reconfigure the bot' });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
