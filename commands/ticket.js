// commands/ticket.js (FIXED - No DB, Transcript on Prefix Close, Prefix ONLY)
const { EmbedBuilder, PermissionsBitField, AttachmentBuilder } = require('discord.js'); // Removed SlashCommandBuilder etc.
const Settings = require('../models/Settings');
// REMOVED: const Ticket = require('../models/Ticket');
const { logModerationAction } = require('../utils/logModerationAction');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
  // REMOVED: Slash command data export
  name: 'ticket',
  description: 'Close the current ticket channel (`?ticket close` or `?close`).',
  aliases: ['closeticket', 'close'],

  async execute(message, args, client) { // Now only takes message, args, client
    const isMessage = true; // This command is now prefix only

    // --- Prefix Command Logic (Close) ---
    if (isMessage) {

        // Check channel topic for status
        const channel = message.channel;
        const topic = channel.topic || '';

        const creatorMatch = topic.match(/Ticket created by .* \((\d{17,19})\)/);
        if (!creatorMatch || !creatorMatch[1]) {
            return message.reply('This does not appear to be an active ticket channel (invalid topic).');
        }
        const ticketCreatorId = creatorMatch[1];

        if (topic.includes('| Closed by:')) {
            return message.reply('This ticket is already closed.');
        }

        // Permission Check
        const member = message.member;
        const config = client.config; const roles = config.roles || {};
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) || [roles.forgottenOne, roles.overseer].some(roleId => member.roles?.cache.has(roleId));
        const isMod = isAdmin || [roles.leadMod, roles.mod].some(roleId => member.roles?.cache.has(roleId));
        const isOwner = ticketCreatorId === message.author.id; // Check against ID from topic
        const tempRoleId = '1433118039275999232';
        const hasTempAccess = member.roles?.cache.has(tempRoleId);

        if (!isMod && !isOwner && !hasTempAccess) {
            return message.reply('You do not have permission to close this ticket.');
        }

        // --- REMOVED DB status update ---

        // Send preliminary closing message
        await message.channel.send(`🔒 Ticket closed by ${message.author}. Generating transcript and scheduling deletion...`).catch(console.error);

        // --- TRANSCRIPT LOGIC (Copied from interactionCreate, adapted for message) ---
         let transcriptContent = `Transcript for Ticket\nChannel: #${channel.name} (${channel.id})\nCreated by: ${topic.split(' | ')[0].replace('Ticket created by ', '')}\nClosed by: ${message.author.tag}\n\n`;
         let lastMessageId = null;
         let fetchComplete = false;
         const transcriptMessages = [];
         let messageCount = 0;

         try {
             while (!fetchComplete && messageCount < 1000) {
                const options = { limit: 100 };
                if (lastMessageId) options.before = lastMessageId;
                const fetched = await channel.messages.fetch(options);
                messageCount += fetched.size;
                if (fetched.size === 0) { fetchComplete = true; break; }
                transcriptMessages.push(...Array.from(fetched.values()));
                lastMessageId = fetched.lastKey();
                if (fetched.size < 100) fetchComplete = true;
             }

             transcriptMessages.reverse(); // Oldest to newest

             for (const msg of transcriptMessages) {
                const timestamp = `[${new Date(msg.createdAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC]`;
                transcriptContent += `${timestamp} ${msg.author.tag}: ${msg.content}${msg.attachments.size > 0 ? ` [${msg.attachments.size} Attachment(s)]` : ''}\n`;
             }

            const buffer = Buffer.from(transcriptContent, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: `ticket-${channel.name}-transcript.txt` });

            // Try to DM the user
            const ticketCreator = await client.users.fetch(ticketCreatorId).catch(() => null);
            if (ticketCreator) {
                try {
                    await ticketCreator.send({
                        content: `Here is the transcript for your ticket in ${message.guild.name} (#${channel.name}), which was closed by ${message.author.tag}.`,
                        files: [attachment]
                    });
                     await channel.send(`Transcript sent via DM to the ticket creator.`).catch(console.error);
                } catch (dmError) {
                    console.error(`Failed to DM transcript to ${ticketCreator.tag}:`, dmError);
                    await channel.send(`⚠️ Couldn't DM transcript to the ticket creator (DMs might be closed).`).catch(console.error);
                }
            } else {
                 await channel.send(`⚠️ Couldn't find the ticket creator to DM the transcript.`).catch(console.error);
            }

         } catch (fetchError) {
             console.error(`Error fetching messages for transcript (Channel ${channel.id}):`, fetchError);
             await channel.send(`⚠️ Error creating transcript.`).catch(console.error);
         }
         // --- END TRANSCRIPT LOGIC ---

        // --- Update Channel Topic ---
         try {
             const newTopic = `${topic} | Closed by: ${message.author.tag}`;
             await channel.setTopic(newTopic.substring(0, 1024));
         } catch (topicError) { console.error("Could not update topic on close:", topicError); }

        // Log
        const settings = await Settings.findOne({ guildId: message.guild.id });
        if (settings && settings.modlogChannelId) {
            await logModerationAction(message.guild, settings, 'Ticket Closed (Prefix)', channel, message.author, `Ticket in #${channel.name} closed`);
        }

        // Schedule deletion
        setTimeout(async () => {
            try {
                const channelToDelete = await message.guild.channels.fetch(channel.id).catch(() => null);
                if (channelToDelete) {
                    await channelToDelete.delete(`Ticket closed by ${message.author.tag}`);
                    // --- REMOVED DB Deletion ---
                }
            } catch (deleteError) { console.error(`Failed to delete ticket channel ${channel.id}:`, deleteError); }
        }, 15000); // 15 seconds
        return;
    }
    // REMOVED: Slash command setup logic
  },
};
