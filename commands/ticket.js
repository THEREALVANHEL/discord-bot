// commands/ticket.js (FIXED Subcommand Description)
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings');
const Ticket = require('../models/Ticket');
const { logModerationAction } = require('../utils/logModerationAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Setup the ticket panel (Slash Only) or close tickets (Prefix Only).')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        // --- THIS LINE WAS THE ERROR ---
        .setDescription('Configures the ticket panel in the current channel.') 
        // You were missing .setDescription(), which caused the serialization error.
    ),
  name: 'ticket',
  description: 'Close the current ticket channel (`?ticket close`). Setup is slash only.',
  aliases: [],

  async execute(interactionOrMessage, args, client) {
    const isInteraction = interactionOrMessage.isChatInputCommand?.();
    const isMessage = !isInteraction;

    // --- Slash Command Logic (Setup - unchanged) ---
    if (isInteraction) {
        // ... Keep your existing slash command setup logic here ...
        // (You'll need to add the logic for the /ticket setup command if it's missing)
        // For now, this just acknowledges the command:
        const subcommand = interactionOrMessage.options.getSubcommand();
        if (subcommand === 'setup') {
            // --- ADDED DUMMY SETUP LOGIC (Replace with your real logic) ---
            await interactionOrMessage.deferReply();
            const panelEmbed = new EmbedBuilder()
                .setTitle('Support Ticket System')
                .setDescription('Click the button below to create a new support ticket. A staff member will assist you shortly.')
                .setColor(0x00BFFF);
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('create_ticket')
                        .setLabel('Create Ticket')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫')
                );
            
            await interactionOrMessage.channel.send({ embeds: [panelEmbed], components: [row] });
            await interactionOrMessage.editReply({ content: '✅ Ticket panel created.', ephemeral: true });
            // --- END DUMMY SETUP LOGIC ---
        }
        return;
    }

    // --- Prefix Command Logic (Close) ---
    if (isMessage) {
        const message = interactionOrMessage;
        const ticket = await Ticket.findOne({ channelId: message.channel.id });
        if (!ticket) return message.reply('This is not a ticket channel.');
        if (ticket.status === 'closed') return message.reply('This ticket is already closed.');

        // Permission Check (Mod/Admin, Ticket Owner, or Temp Access)
        const member = message.member;
        const config = client.config; const roles = config.roles || {};
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) || [roles.forgottenOne, roles.overseer].some(roleId => member.roles.cache.has(roleId));
        const isMod = isAdmin || [roles.leadMod, roles.mod].some(roleId => member.roles.cache.has(roleId));
        const isOwner = ticket.userId === message.author.id;

        // --- FIXED: Check for Temp Mod Access Role ID ---
        const tempRoleId = '1433118039275999232';
        const hasTempAccess = member.roles.cache.has(tempRoleId);
        // --- End Fix ---

        // Allow if Mod/Admin OR Owner OR has Temp Access
        if (!isMod && !isOwner && !hasTempAccess) {
            return message.reply('You do not have permission to close this ticket.');
        }

        // --- Rest of close logic (unchanged) ---
        ticket.status = 'closed'; await ticket.save();
        await message.channel.send(`🔒 Ticket closed by ${message.author}. Channel deletion scheduled.`).catch(console.error);
        const settings = await Settings.findOne({ guildId: message.guild.id });
        if (settings && settings.modlogChannelId) await logModerationAction(message.guild, settings, 'Ticket Closed', message.channel, message.author, `Ticket #${ticket.ticketId} closed`);

        setTimeout(async () => {
            try {
                const channelToDelete = await message.guild.channels.fetch(message.channel.id).catch(() => null);
                if (channelToDelete) { await channelToDelete.delete(`Ticket #${ticket.ticketId} closed`); await Ticket.deleteOne({ channelId: message.channel.id }).catch(console.error); }
            } catch (deleteError) { console.error(`Failed to delete ticket channel ${message.channel.id}:`, deleteError); /* Optional: Log failure */ }
        }, 10000);
        return;
    }
  },
};
