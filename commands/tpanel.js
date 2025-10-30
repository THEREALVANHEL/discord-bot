// commands/tpanel.js (NEW FILE - Prefix Command for Ticket Panel Setup)
const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  name: 'tpanel',
  description: 'Creates the ticket panel message in the current channel.',
  aliases: ['ticketpanel'], // Optional alias

  async execute(message, args, client) {
    // 1. Check Permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply('❌ You need the `Manage Guild` permission to use this command.');
    }

    // 2. Get channel from settings or use current
    const settings = await Settings.findOne({ guildId: message.guild.id });
    let panelChannel = message.channel; // Default to current channel
    let targetChannelId = args[0]; // Optional channel mention/ID argument

    if (targetChannelId) {
        const channelMention = targetChannelId.match(/<#(\d+)>/);
        if (channelMention) {
            targetChannelId = channelMention[1];
        }
        const foundChannel = await message.guild.channels.fetch(targetChannelId).catch(() => null);
        if (foundChannel && foundChannel.isTextBased()) {
            panelChannel = foundChannel;
        } else {
             return message.reply(`❌ Invalid channel specified: "${args[0]}". Please mention a text channel or provide its ID.`);
        }
    } else if (settings?.ticketPanelChannelId) {
        // If no channel arg, check settings
        const foundChannel = await message.guild.channels.fetch(settings.ticketPanelChannelId).catch(() => null);
        if (foundChannel) panelChannel = foundChannel;
    }

    // 3. Build Panel Embed and Button
    const panelEmbed = new EmbedBuilder()
        .setTitle('Support Ticket System')
        .setDescription('Click the button below to create a new support ticket. A staff member will assist you shortly.')
        .setColor(0x00BFFF); // Deep Sky Blue

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Create Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫')
        );

    // 4. Send Panel
    try {
        await panelChannel.send({ embeds: [panelEmbed], components: [row] });

        // 5. Update settings if the target channel was different from saved setting
        if (settings && panelChannel.id !== settings.ticketPanelChannelId) {
            settings.ticketPanelChannelId = panelChannel.id;
            await settings.save();
             message.reply(`✅ Ticket panel sent to ${panelChannel} and saved as the default panel channel.`);
        } else if (!settings) {
            const newSettings = new Settings({ guildId: message.guild.id, ticketPanelChannelId: panelChannel.id });
            await newSettings.save();
             message.reply(`✅ Ticket panel sent to ${panelChannel} and saved as the default panel channel.`);
        } else {
             message.reply(`✅ Ticket panel sent to ${panelChannel}.`);
        }
    } catch (error) {
        console.error("Error sending ticket panel:", error);
        message.reply(`❌ Failed to send panel to ${panelChannel}. Do I have permissions to send messages there?`);
    }
  },
};
