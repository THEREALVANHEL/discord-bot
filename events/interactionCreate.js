// events/interactionCreate.js (FIXED - No DB Tickets, Creator Name Channel, Transcript on Close Button)
const { EmbedBuilder, PermissionsBitField, ChannelType, Collection, Events, AttachmentBuilder } = require('discord.js');
const Settings = require('../models/Settings');
const User = require('../models/User');
// REMOVED: const Ticket = require('../models/Ticket');
const fs = require('fs').promises;
const path = require('path');

async function logModerationAction(guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') {
 /* Placeholder */
 console.log(`[Moderation Log] Action: ${action}, Target: ${target?.tag || target?.name || target}, Mod: ${moderator.tag}, Reason: ${reason}`);
}


module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction.guild) return;

    let member = interaction.member;
    const config = client.config;
    let settings;
     try {
         settings = await Settings.findOne({ guildId: interaction.guild.id });
     } catch (dbError) { /* ... error handling ... */ return; }

    // Fetch member if necessary
    if (!member || member.partial) {
        try { member = await interaction.guild.members.fetch(interaction.user.id); } catch (e) { console.error("Could not fetch member:", e); return; }
    }

    const roles = config.roles || {};
    // ... (role checks remain the same) ...
    const isAdmin = member?.roles?.cache.has(roles.forgottenOne) || member?.roles?.cache.has(roles.overseer) || member?.permissions.has(PermissionsBitField.Flags.Administrator);
    const isLeadMod = member?.roles?.cache.has(roles.leadMod);
    const isMod = isLeadMod || member?.roles?.cache.has(roles.mod) || isAdmin;
    const isHost = member?.roles?.cache.has(roles.gamelogUser) || member?.roles?.cache.has(roles.headHost);
    const cookiesManagerRole = roles.cookiesManager;

    // --- COMMAND LOGIC ---
    if (interaction.isChatInputCommand()) {
        // ... (slash command handling remains the same) ...
        const command = client.commands.get(interaction.commandName);
        if (!command) { /* ... error handling ... */ return; }
        // ... (permission checks remain the same) ...
        // ... (cooldown checks remain the same) ...
        try {
            await command.execute(interaction, client, logModerationAction);
        } catch (error) { /* ... error handling ... */ }
        return;
    }

    // --- BUTTON INTERACTION LOGIC ---
     if (interaction.isButton()) {
         const customId = interaction.customId;
         if (!interaction.channel || !interaction.guild) return;

         // --- Job Apply, Poll, Reminder Buttons ---
         if (customId.startsWith('job_apply_')) { /* ... job apply logic ... */ return; }
         else if (customId === 'poll_result_manual') { /* ... poll end logic ... */ return; }
         else if (customId.startsWith('remove_reminder_')) { /* ... reminder remove logic ... */ return; }

         // --- TICKET CREATION BUTTON ---
         else if (customId === 'create_ticket') {
             try {
                await interaction.deferReply({ ephemeral: true });

                const guild = interaction.guild;
                const user = interaction.user;
                const userName = user.username; // Get username for channel name

                // Config
                const staffRoleId = client.config?.roles?.mod;
                if (!staffRoleId) { /* ... error handling ... */ return interaction.editReply({ content: '❌ Error: Ticket system role config missing.' }); }
                let categoryId = settings?.ticketCategoryId;
                if (!categoryId) { /* ... error handling ... */ return interaction.editReply({ content: '❌ Error: Ticket category not set up. Use `?tpanel`.' }); }
                const categoryChannel = guild.channels.cache.get(categoryId);
                 if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) { /* ... error handling ... */ return interaction.editReply({ content: '❌ Error: Configured ticket category not found or invalid.' }); }

                // --- REMOVED DB Check for existing ticket ---

                // --- Channel Naming ---
                // Sanitize username: lowercase, replace invalid chars with '-', limit length
                const sanitizedUserName = userName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 80) || 'ticket';
                const channelName = `${sanitizedUserName}`; // Use only sanitized username

                // --- Channel Topic ---
                const channelTopic = `Ticket created by ${user.tag} (${user.id})`;

                // --- Create Channel ---
                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: categoryId,
                    topic: channelTopic, // Set topic on creation
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                        { id: staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages] },
                         { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] } // Added ManageMessages for potential future use
                    ],
                });

                // --- REMOVED DB Save ---
                console.log(`[Ticket Created] Channel ${ticketChannel.id} for user ${user.id}`);

                // Send welcome message in the new channel
                const ticketEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setTitle(`Ticket | ${user.username}`) // Use username in title
                    .setDescription(`Welcome ${user}!\n\nA staff member (<@&${staffRoleId}>) will be with you shortly.\nPlease describe your issue in detail.`)
                    .setTimestamp()
                    .setFooter({ text: `User ID: ${user.id}` });

                 const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket_button')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                 );

                // --- PING ON CREATE (Confirmed Correct) ---
                await ticketChannel.send({ content: `${user} <@&${staffRoleId}>`, embeds: [ticketEmbed], components: [row] });

                // Confirm creation ephemerally
                await interaction.editReply({ content: `✅ Your ticket has been created! Please go to ${ticketChannel}.` });

            } catch (error) {
                console.error('Error creating ticket channel:', error);
                 if (!interaction.replied && !interaction.deferred) {
                     await interaction.reply({ content: 'An error occurred while creating your ticket.', ephemeral: true }).catch(console.error);
                 } else if (!interaction.replied) {
                     await interaction.editReply({ content: 'An error occurred while creating your ticket.' }).catch(console.error);
                 }
            }
         }
         // --- TICKET CLOSE BUTTON ---
         else if (customId === 'close_ticket_button') {
            try {
                 const channel = interaction.channel;
                 const topic = channel.topic || '';

                 // --- Check if it's a ticket using topic ---
                 const creatorMatch = topic.match(/Ticket created by .* \((\d{17,19})\)/);
                 if (!creatorMatch || !creatorMatch[1]) {
                     return interaction.reply({ content: 'This does not appear to be an active ticket channel (invalid topic).', ephemeral: true });
                 }
                 const ticketCreatorId = creatorMatch[1];

                 // --- Check if already closed using topic ---
                 if (topic.includes('| Closed by:')) {
                    return interaction.reply({ content: 'This ticket is already being closed.', ephemeral: true });
                 }

                 // Permission check
                 const closeMember = interaction.member;
                 const closeIsAdmin = closeMember.permissions.has(PermissionsBitField.Flags.Administrator) || [roles.forgottenOne, roles.overseer].some(roleId => closeMember.roles?.cache.has(roleId));
                 const closeIsMod = closeIsAdmin || [roles.leadMod, roles.mod].some(roleId => closeMember.roles?.cache.has(roleId));
                 const closeIsOwner = ticketCreatorId === interaction.user.id; // Check against ID parsed from topic
                 const closeTempRoleId = '1433118039275999232';
                 const closeHasTempAccess = closeMember.roles?.cache.has(closeTempRoleId);

                 if (!closeIsMod && !closeIsOwner && !closeHasTempAccess) {
                     return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
                 }

                 // --- REMOVED DB status update ---

                 // Update interaction BEFORE transcript generation
                 await interaction.reply({ content: '🔒 Closing ticket and generating transcript...', ephemeral: true });

                 // --- TRANSCRIPT LOGIC ---
                 let transcriptContent = `Transcript for Ticket\nChannel: #${channel.name} (${channel.id})\nCreated by: ${topic.split(' | ')[0].replace('Ticket created by ', '')}\nClosed by: ${interaction.user.tag}\n\n`;
                 let lastMessageId = null;
                 let fetchComplete = false;
                 const transcriptMessages = [];
                 let messageCount = 0;

                 try {
                     while (!fetchComplete && messageCount < 1000) { // Limit to 1000 messages for safety
                        const options = { limit: 100 };
                        if (lastMessageId) {
                            options.before = lastMessageId;
                        }
                        const fetched = await channel.messages.fetch(options);
                        messageCount += fetched.size;

                        if (fetched.size === 0) {
                            fetchComplete = true; break;
                        }
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

                    // Try to DM the user (using ID from topic)
                    const ticketCreator = await client.users.fetch(ticketCreatorId).catch(() => null);
                    if (ticketCreator) {
                        try {
                            await ticketCreator.send({
                                content: `Here is the transcript for your ticket in ${interaction.guild.name} (#${channel.name}), which was closed by ${interaction.user.tag}.`,
                                files: [attachment]
                            });
                             await interaction.editReply({ content: '🔒 Closing ticket... Transcript sent via DM.'});
                        } catch (dmError) {
                            console.error(`Failed to DM transcript to ${ticketCreator.tag}:`, dmError);
                            await interaction.editReply({ content: '🔒 Closing ticket... Couldn\'t DM transcript (DMs might be closed).' });
                        }
                    } else {
                        await interaction.editReply({ content: '🔒 Closing ticket... Couldn\'t find the ticket creator to DM.' });
                    }

                 } catch (fetchError) {
                     console.error(`Error fetching messages for transcript (Channel ${channel.id}):`, fetchError);
                     await interaction.editReply({ content: '🔒 Closing ticket... Error creating transcript.' });
                 }
                 // --- END TRANSCRIPT LOGIC ---

                 // Send public closing message
                 await channel.send(`Ticket closed by ${interaction.user}. Channel deletion scheduled.`);

                 // --- Update Channel Topic to Mark as Closed ---
                 try {
                     const newTopic = `${topic} | Closed by: ${interaction.user.tag}`;
                     await channel.setTopic(newTopic.substring(0, 1024)); // Max topic length is 1024
                 } catch (topicError) { console.error("Could not update topic on close:", topicError); }

                 // Disable button
                 try {
                     const originalMessage = await channel.messages.fetch(interaction.message.id);
                     if (originalMessage && originalMessage.components.length > 0) {
                        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]).setComponents(
                            ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true)
                        );
                        await originalMessage.edit({ components: [disabledRow] }).catch(()=>{});
                     }
                 } catch (editError) {console.log("Could not disable close button:", editError.message)}


                 // Log
                 if (settings && settings.modlogChannelId) {
                     await logModerationAction(interaction.guild, settings, 'Ticket Closed (Button)', channel, interaction.user, `Ticket in #${channel.name} closed`);
                 }

                 // Schedule deletion
                 setTimeout(async () => {
                     try {
                         const channelToDelete = await interaction.guild.channels.fetch(channel.id).catch(() => null);
                         if (channelToDelete) {
                             await channelToDelete.delete(`Ticket closed by ${interaction.user.tag}`);
                             // --- REMOVED DB Deletion ---
                         }
                     } catch (deleteError) { console.error(`Failed to delete ticket channel ${channel.id}:`, deleteError); }
                 }, 15000); // 15 seconds

            } catch(error) {
                console.error("Error closing ticket via button:", error);
                 if (!interaction.replied && !interaction.deferred) { // Check if we already replied ephemerally
                    await interaction.reply({ content: 'An error occurred while closing the ticket.', ephemeral: true }).catch(console.error);
                 } else if (!interaction.replied) {
                     await interaction.editReply({ content: 'An error occurred while closing the ticket.' }).catch(console.error);
                 }
            }
         }
         // --- Add other button handlers ---
     }
     // Handle other interaction types...
  },
};
