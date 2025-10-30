// events/interactionCreate.js (FIXED - No DB Tickets, Creator Name Channel, Transcript on Close Button, Added missing imports)
const { EmbedBuilder, PermissionsBitField, ChannelType, Collection, Events, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js'); // FIXED: Added ActionRowBuilder, ButtonBuilder, ButtonStyle
const Settings = require('../models/Settings');
const User = require('../models/User');
// REMOVED: const Ticket = require('../models/Ticket');
const fs = require('fs').promises;
const path = require('path');

async function logModerationAction(guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') {
 /* Placeholder - Use the actual utility if available */
 console.log(`[Moderation Log] Action: ${action}, Target: ${target?.tag || target?.name || target}, Mod: ${moderator.tag}, Reason: ${reason}`);
 const modlogChannelId = settings?.modlogChannelId;
 if (guild && modlogChannelId) {
    const logChannel = await guild.channels.fetch(modlogChannelId).catch(() => null);
    if (logChannel) {
        let targetString = 'N/A';
        if (target) {
           if (target.tag && target.id) targetString = `${target.tag} (${target.id})`;
           else if (target.name && target.id) targetString = `${target.name} (<#${target.id}>)`;
           else if (typeof target === 'string') targetString = target.substring(0, 100);
        }
        const embed = new EmbedBuilder()
            .setTitle(`Moderation Action: ${action}`)
            .setColor(0x7289DA)
            .addFields(
              { name: 'Target', value: targetString },
              { name: 'Moderator', value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown/System' },
              { name: 'Reason', value: reason.substring(0, 1020) },
            )
            .setTimestamp();
        if (extra) embed.addFields({ name: 'Details', value: extra.substring(0, 1020) });
        await logChannel.send({ embeds: [embed] }).catch(console.error);
    }
 }
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
     } catch (dbError) {
         console.error("Database error fetching settings:", dbError);
         if (interaction.repliable) {
             await interaction.reply({ content: 'Error fetching server settings.', ephemeral: true }).catch(console.error);
         }
         return;
     }

    // Fetch member if necessary
    if (!member || member.partial) {
        try { member = await interaction.guild.members.fetch(interaction.user.id); } catch (e) { console.error("Could not fetch member:", e); return; }
    }
    // Return if member still couldn't be fetched
    if (!member) return;

    const roles = config.roles || {};
    // Role checks
    const isAdmin = member?.roles?.cache.has(roles.forgottenOne) || member?.roles?.cache.has(roles.overseer) || member?.permissions.has(PermissionsBitField.Flags.Administrator);
    const isLeadMod = member?.roles?.cache.has(roles.leadMod);
    const isMod = isLeadMod || member?.roles?.cache.has(roles.mod) || isAdmin;
    const isHost = member?.roles?.cache.has(roles.gamelogUser) || member?.roles?.cache.has(roles.headHost);
    const cookiesManagerRole = roles.cookiesManager;

    // --- COMMAND LOGIC ---
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            await interaction.reply({ content: 'Error: Command not found.', ephemeral: true });
            return;
        }

        // --- Permission Checks for Slash Commands ---
        // Example permission checks (adjust based on your needs)
        if (['addxp', 'removexp', 'addcoins', 'removecoins', 'addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'resetdailystreak', 'dbstatus'].includes(interaction.commandName) && !isAdmin) {
             return interaction.reply({ content: '🛡️ You need Administrator permissions for this command.', ephemeral: true });
        }
        if (['announce', 'poll result', 'giveaway', 'reroll', 'quicksetup', 'aisetup'].includes(interaction.commandName) && !isMod) {
             return interaction.reply({ content: '🛡️ You need Moderator permissions for this command.', ephemeral: true });
        }
        if (interaction.commandName === 'gamelog' && !isHost && !isMod) {
             return interaction.reply({ content: '🛡️ You need Game Log permissions for this command.', ephemeral: true });
        }

        // --- Cooldown Check ---
        const { cooldowns } = client;
        if (!cooldowns.has(command.data.name)) {
            cooldowns.set(command.data.name, new Collection());
        }
        const now = Date.now();
        const timestamps = cooldowns.get(command.data.name);
        const cooldownAmount = (command.cooldown || 3) * 1000; // Default 3 seconds

        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return interaction.reply({ content: `⏱️ Please wait ${timeLeft.toFixed(1)}s before reusing \`/${command.data.name}\`.`, ephemeral: true });
            }
        }
        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        // --- Execute Command ---
        try {
            await command.execute(interaction, client, logModerationAction); // Pass client and logger
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
            }
        }
        return;
    }

    // --- BUTTON INTERACTION LOGIC ---
     if (interaction.isButton()) {
         const customId = interaction.customId;
         if (!interaction.channel || !interaction.guild) return;

         // --- Job Apply, Poll, Reminder Buttons (Keep existing logic) ---
         if (customId.startsWith('job_apply_')) {
             await interaction.deferUpdate(); // Acknowledge button press
             const jobId = customId.replace('job_apply_', '');
             const workProgression = client.config.workProgression.sort((a, b) => a.minWorks - b.minWorks);
             const targetJob = workProgression.find(j => j.id === jobId);

             if (!targetJob) return interaction.followUp({ content: 'Invalid job ID.', ephemeral: true });

             let userDB = await User.findOne({ userId: interaction.user.id });
             if (!userDB) userDB = new User({ userId: interaction.user.id });

             if (userDB.successfulWorks < targetJob.minWorks) {
                 return interaction.followUp({ content: `You need ${targetJob.minWorks} successful works to apply for ${targetJob.title}.`, ephemeral: true });
             }

             if (userDB.currentJob === targetJob.id) {
                 return interaction.followUp({ content: `You already have the job: ${targetJob.title}.`, ephemeral: true });
             }

             userDB.currentJob = targetJob.id;
             userDB.lastWork = null; // Allow working immediately after applying
             await userDB.save();

             const applySuccessEmbed = new EmbedBuilder()
                 .setTitle('💼 Hired!')
                 .setDescription(`Congratulations, ${interaction.user}! You have been hired as a **${targetJob.title}**.`)
                 .setColor(0x00FF00)
                 .setTimestamp();

             return interaction.followUp({ embeds: [applySuccessEmbed], ephemeral: true });

         }
         else if (customId === 'poll_result_manual') {
             // Permission Check (Only creator or Mod/Admin)
             const pollData = client.polls.get(interaction.message.id);
             if (!pollData) return interaction.reply({ content: 'Poll data not found (may have ended or restarted).', ephemeral: true });

             const endMember = interaction.member;
             const endIsAdmin = endMember.permissions.has(PermissionsBitField.Flags.Administrator) || [roles.forgottenOne, roles.overseer].some(roleId => endMember.roles?.cache.has(roleId));
             const endIsMod = endIsAdmin || [roles.leadMod, roles.mod].some(roleId => endMember.roles?.cache.has(roleId));

             if (interaction.user.id !== pollData.creatorId && !endIsMod) {
                 return interaction.reply({ content: 'Only the poll creator or a Moderator can end this poll manually.', ephemeral: true });
             }

             await interaction.deferReply({ ephemeral: true });
             const pollCommand = client.commands.get('poll'); // Get the poll command module
             if (pollCommand && typeof pollCommand.endPoll === 'function') {
                 await pollCommand.endPoll(interaction.channel, interaction.message.id, client, interaction, true); // Pass interaction and isManual=true
                 await interaction.editReply({ content: `✅ **Poll Ended!** Results posted.` });
             } else {
                 await interaction.editReply({ content: '❌ Error: Could not find poll ending logic.' });
             }
             return;
         }
         else if (customId.startsWith('remove_reminder_')) {
             await interaction.deferUpdate(); // Acknowledge button press
             const reminderId = customId.replace('remove_reminder_', '');

             let userDB = await User.findOne({ userId: interaction.user.id });
             if (!userDB || userDB.reminders.length === 0) {
                 return interaction.followUp({ content: 'You have no reminders to remove.', ephemeral: true });
             }

             const reminderIndex = userDB.reminders.findIndex(r => r._id.toString() === reminderId);
             if (reminderIndex === -1) {
                 return interaction.followUp({ content: 'Reminder not found or already removed.', ephemeral: true });
             }

             const removedReminder = userDB.reminders.splice(reminderIndex, 1)[0];
             await userDB.save();

             // Clear the timeout from the client map
             const timeoutId = client.reminders.get(reminderId);
             if (timeoutId) {
                 clearTimeout(timeoutId);
                 client.reminders.delete(reminderId);
             }

             await interaction.editReply({ content: `🗑️ Reminder removed: "${removedReminder.message.substring(0, 50)}..."`, components: [] }); // Remove buttons after selection
             return;
         }

         // --- TICKET CREATION BUTTON ---
         else if (customId === 'create_ticket') {
             try {
                // Defer ephemerally first
                await interaction.deferReply({ ephemeral: true });

                const guild = interaction.guild;
                const user = interaction.user;
                const userName = user.username; // Get username for channel name

                // Config & Settings Check
                const staffRoleId = client.config?.roles?.mod; // Ensure you have MOD_ROLE_ID in .env and index.js config
                if (!staffRoleId) {
                     console.error("[Ticket Error] Moderator role ID (MOD_ROLE_ID) is not configured in client.config.roles");
                     return interaction.editReply({ content: '❌ Error: Ticket system moderator role is not configured correctly. Please contact an admin.' });
                 }
                const categoryId = settings?.ticketCategoryId;
                 if (!categoryId) {
                     console.error("[Ticket Error] Ticket category ID is not set in settings.");
                     return interaction.editReply({ content: '❌ Error: Ticket category not set up. An admin needs to run `/quicksetup` or use the settings command.' });
                 }
                const categoryChannel = guild.channels.cache.get(categoryId);
                 if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
                     console.error(`[Ticket Error] Configured category ID ${categoryId} not found or is not a category.`);
                     return interaction.editReply({ content: '❌ Error: Configured ticket category not found or is invalid. Please contact an admin.' });
                 }

                // --- REMOVED DB Check for existing ticket ---

                // --- Channel Naming ---
                // Sanitize username: lowercase, replace invalid chars with '-', limit length
                const sanitizedUserName = userName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 80) || 'ticket';
                const channelName = `${sanitizedUserName}`; // Use only sanitized username

                // --- Channel Topic ---
                const channelTopic = `Ticket created by ${user.tag} (${user.id})`;

                // --- Create Channel ---
                 let ticketChannel;
                 try {
                     ticketChannel = await guild.channels.create({
                         name: channelName,
                         type: ChannelType.GuildText,
                         parent: categoryId,
                         topic: channelTopic, // Set topic on creation
                         permissionOverwrites: [
                             { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, // Deny @everyone
                             { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] }, // Allow ticket creator
                             { id: staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.EmbedLinks] }, // Allow Staff role
                             { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.AttachFiles] } // Allow Bot
                         ],
                     });
                 } catch (channelError) {
                      console.error(`[Ticket Error] Failed to create channel:`, channelError);
                      // Check for specific permission errors if possible
                      if (channelError.code === 50013) { // Missing Permissions
                          return interaction.editReply({ content: '❌ Error: I lack permissions to create channels in the designated category.' });
                      }
                      return interaction.editReply({ content: '❌ Error: Could not create the ticket channel due to an unexpected issue.' });
                 }


                // --- REMOVED DB Save ---
                console.log(`[Ticket Created] Channel ${ticketChannel.id} for user ${user.id}`);

                // Send welcome message in the new channel
                // FIXED: Added requested welcome message text
                const ticketEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setTitle(`Ticket | ${user.username}`) // Use username in title
                    .setDescription(`Welcome ${user}!\n\nA staff member (<@&${staffRoleId}>) will be with you shortly.\nPlease describe your issue in detail so we can assist you efficiently.`)
                    .setTimestamp()
                    .setFooter({ text: `User ID: ${user.id}` });

                 // FIXED: Use the imported ActionRowBuilder, ButtonBuilder, ButtonStyle
                 const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket_button')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                 );

                // FIXED: Send ping and initial message correctly
                await ticketChannel.send({ content: `${user} <@&${staffRoleId}>`, embeds: [ticketEmbed], components: [row] });

                // Confirm creation ephemerally
                await interaction.editReply({ content: `✅ Your ticket has been created! Please go to ${ticketChannel}.` });

            } catch (error) {
                console.error('Error handling create_ticket button:', error);
                 // Check if we can still reply or edit the deferred reply
                 if (!interaction.replied && !interaction.deferred) {
                     await interaction.reply({ content: 'An error occurred while creating your ticket.', ephemeral: true }).catch(console.error);
                 } else if (!interaction.replied) {
                      // Check if the specific error is "Unknown interaction" - if so, we can't editReply
                     if (error.code !== 10062) { // 10062 is Unknown Interaction
                         await interaction.editReply({ content: 'An error occurred while creating your ticket.' }).catch(console.error);
                     } else {
                         console.log("[Ticket Error] Could not send error reply: Interaction expired.");
                     }
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
                 if (!closeMember) return interaction.reply({ content: 'Could not verify your permissions.', ephemeral: true }); // Add check if member isn't available

                 const closeIsAdmin = closeMember.permissions.has(PermissionsBitField.Flags.Administrator) || [roles.forgottenOne, roles.overseer].some(roleId => roleId && closeMember.roles?.cache.has(roleId));
                 const closeIsMod = closeIsAdmin || [roles.leadMod, roles.mod].some(roleId => roleId && closeMember.roles?.cache.has(roleId));
                 const closeIsOwner = ticketCreatorId === interaction.user.id; // Check against ID parsed from topic
                 const closeTempRoleId = '1433118039275999232';
                 const closeHasTempAccess = closeMember.roles?.cache.has(closeTempRoleId);

                 if (!closeIsMod && !closeIsOwner && !closeHasTempAccess) {
                     return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
                 }

                 // --- REMOVED DB status update ---

                 // Update interaction BEFORE transcript generation (ephemeral)
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
                             // Edit the ephemeral reply
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

                 // Send public closing message IN the ticket channel
                 await channel.send(`Ticket closed by ${interaction.user}. Channel deletion scheduled.`);

                 // --- Update Channel Topic to Mark as Closed ---
                 try {
                     const newTopic = `${topic} | Closed by: ${interaction.user.tag}`;
                     await channel.setTopic(newTopic.substring(0, 1024)); // Max topic length is 1024
                 } catch (topicError) { console.error("Could not update topic on close:", topicError); }

                 // Disable button
                 try {
                     // Ensure interaction.message is available and has components
                     if (interaction.message && interaction.message.components.length > 0) {
                         const disabledRow = ActionRowBuilder.from(interaction.message.components[0]).setComponents(
                             ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true)
                         );
                         await interaction.message.edit({ components: [disabledRow] }).catch(console.error); // Edit original panel message
                     } else {
                         // Fetch the message if interaction.message is not available (might happen in rare cases)
                         const originalMessage = await channel.messages.fetch(interaction.messageId).catch(() => null);
                         if (originalMessage && originalMessage.components.length > 0) {
                             const disabledRow = ActionRowBuilder.from(originalMessage.components[0]).setComponents(
                                 ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true)
                             );
                             await originalMessage.edit({ components: [disabledRow] }).catch(console.error);
                         }
                     }
                 } catch (editError) {console.error("Could not disable close button:", editError);}


                 // Log
                 if (settings && settings.modlogChannelId) {
                     await logModerationAction(interaction.guild, settings, 'Ticket Closed (Button)', channel, interaction.user, `Ticket in #${channel.name} closed`);
                 }

                 // Schedule deletion (5 seconds)
                 setTimeout(async () => {
                     try {
                         const channelToDelete = await interaction.guild.channels.fetch(channel.id).catch(() => null);
                         if (channelToDelete) {
                             await channelToDelete.delete(`Ticket closed by ${interaction.user.tag}`);
                             // --- REMOVED DB Deletion ---
                             console.log(`[Ticket Closed] Deleted channel ${channel.id}`);
                         }
                     } catch (deleteError) { console.error(`Failed to delete ticket channel ${channel.id}:`, deleteError); }
                 }, 5000); // 5 seconds

            } catch(error) {
                console.error("Error closing ticket via button:", error);
                 if (!interaction.replied && !interaction.deferred) { // Check if we already replied ephemerally
                    await interaction.reply({ content: 'An error occurred while closing the ticket.', ephemeral: true }).catch(console.error);
                 } else if (!interaction.replied) {
                     // Avoid editing if interaction is unknown
                     if (error.code !== 10062) {
                        await interaction.editReply({ content: 'An error occurred while closing the ticket.' }).catch(console.error);
                     } else {
                        console.log("[Ticket Error] Could not send close error reply: Interaction expired.");
                     }
                 }
            }
         }
         // --- Add other button handlers here ---
     }
     // Handle other interaction types (e.g., Select Menus, Modals)...
  },
};
