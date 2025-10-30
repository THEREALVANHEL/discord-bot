// commands/ticket.js (FIXED - Added Transcript on Prefix Close)
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionsBitField, AttachmentBuilder } = require('discord.js'); // Added AttachmentBuilder
const Settings = require('../models/Settings');
const Ticket = require('../models/Ticket');
const { logModerationAction } = require('../utils/logModerationAction');
const fs = require('fs').promises; // Use promises for async file operations
const path = require('path'); // To manage file paths


module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Setup the ticket panel (Slash Only) or close tickets (Prefix Only).')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Configures the ticket panel in the current channel.')
    ),
  name: 'ticket',
  description: 'Close the current ticket channel (`?ticket close` or `?close`). Setup is slash only.',
  aliases: ['closeticket', 'close'], // Added 'close' alias

  async execute(interactionOrMessage, args, client) {
    const isInteraction = interactionOrMessage.isChatInputCommand?.();
    const isMessage = !isInteraction;

    // --- Slash Command Logic (Setup) ---
    if (isInteraction) {
        const subcommand = interactionOrMessage.options.getSubcommand();
        if (subcommand === 'setup') {
            if (!interactionOrMessage.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interactionOrMessage.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            }
            await interactionOrMessage.deferReply({ ephemeral: true });
            const settings = await Settings.findOne({ guildId: interactionOrMessage.guild.id });
            let panelChannel = interactionOrMessage.channel;
            if (settings?.ticketPanelChannelId) {
                const foundChannel = await interactionOrMessage.guild.channels.fetch(settings.ticketPanelChannelId).catch(() => null);
                if (foundChannel) panelChannel = foundChannel;
            }
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
            await panelChannel.send({ embeds: [panelEmbed], components: [row] });
            await interactionOrMessage.editReply({ content: `✅ Ticket panel sent to ${panelChannel}.` });
        }
        return;
    }

    // --- Prefix Command Logic (Close) ---
    if (isMessage) {
        const message = interactionOrMessage;

        // Check if it's a ticket channel
        const ticket = await Ticket.findOne({ channelId: message.channel.id });
        if (!ticket) return message.reply('This is not a ticket channel.');
        if (ticket.status === 'closed') return message.reply('This ticket is already closed.');

        // Permission Check
        const member = message.member;
        const config = client.config; const roles = config.roles || {};
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) || [roles.forgottenOne, roles.overseer].some(roleId => member.roles?.cache.has(roleId));
        const isMod = isAdmin || [roles.leadMod, roles.mod].some(roleId => member.roles?.cache.has(roleId));
        const isOwner = ticket.userId === message.author.id;
        const tempRoleId = '1433118039275999232'; // Make sure this ID is correct
        const hasTempAccess = member.roles?.cache.has(tempRoleId);

        if (!isMod && !isOwner && !hasTempAccess) {
            return message.reply('You do not have permission to close this ticket.');
        }
        
        // --- Mark as closed in DB FIRST ---
        ticket.status = 'closed';
        await ticket.save();

        // Send preliminary closing message BEFORE fetching messages
        await message.channel.send(`🔒 Ticket closed by ${message.author}. Generating transcript and scheduling deletion...`).catch(console.error);
        
        // --- TRANSCRIPT LOGIC ---
         let transcriptContent = `Transcript for Ticket #${ticket.ticketId}\nCreated by: ${client.users.cache.get(ticket.userId)?.tag || ticket.userId}\nClosed by: ${message.author.tag}\n\n`;
         let lastMessageId = null;
         let fetchComplete = false;
         const transcriptMessages = [];

         try {
             while (!fetchComplete) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }
                const fetched = await message.channel.messages.fetch(options);

                if (fetched.size === 0) {
                    fetchComplete = true;
                    break;
                }

                transcriptMessages.push(...Array.from(fetched.values()));
                lastMessageId = fetched.lastKey();

                if (fetched.size < 100) {
                    fetchComplete = true;
                }
             }
             
             transcriptMessages.reverse(); // Oldest to newest

             for (const msg of transcriptMessages) {
                const timestamp = `[${new Date(msg.createdAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC]`;
                transcriptContent += `${timestamp} ${msg.author.tag}: ${msg.content}${msg.attachments.size > 0 ? ` [${msg.attachments.size} Attachment(s)]` : ''}\n`;
             }

            // Create buffer and attachment
            const buffer = Buffer.from(transcriptContent, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: `ticket-${ticket.ticketId}-transcript.txt` });

            // Try to DM the user
            const ticketCreator = await client.users.fetch(ticket.userId).catch(() => null);
            if (ticketCreator) {
                try {
                    await ticketCreator.send({
                        content: `Here is the transcript for your ticket #${ticket.ticketId} in ${message.guild.name}, which was closed by ${message.author.tag}.`,
                        files: [attachment]
                    });
                     await message.channel.send(`Transcript sent via DM to the ticket creator.`).catch(console.error); // Public confirmation
                } catch (dmError) {
                    console.error(`Failed to DM transcript to ${ticketCreator.tag}:`, dmError);
                    await message.channel.send(`⚠️ Couldn't DM transcript to the ticket creator (DMs might be closed).`).catch(console.error); // Public warning
                }
            } else {
                 await message.channel.send(`⚠️ Couldn't find the ticket creator to DM the transcript.`).catch(console.error); // Public warning
            }

         } catch (fetchError) {
             console.error(`Error fetching messages for transcript (Ticket ${ticket.ticketId}):`, fetchError);
             await message.channel.send(`⚠️ Error creating transcript.`).catch(console.error); // Public warning
         }
         // --- END TRANSCRIPT LOGIC ---


        // Log
        const settings = await Settings.findOne({ guildId: message.guild.id });
        if (settings && settings.modlogChannelId) {
            await logModerationAction(message.guild, settings, 'Ticket Closed (Prefix)', message.channel, message.author, `Ticket #${ticket.ticketId} closed`);
        }

        // Schedule deletion
        setTimeout(async () => {
            try {
                const channelToDelete = await message.guild.channels.fetch(message.channel.id).catch(() => null);
                if (channelToDelete) {
                    await channelToDelete.delete(`Ticket #${ticket.ticketId} closed`);
                    // Optionally remove from DB after successful delete
                    await Ticket.deleteOne({ channelId: message.channel.id }).catch(console.error);
                }
            } catch (deleteError) { console.error(`Failed to delete ticket channel ${message.channel.id}:`, deleteError); }
        }, 15000); // 15 seconds
        return;
    }
  },
};
