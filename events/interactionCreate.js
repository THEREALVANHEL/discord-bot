// events/interactionCreate.js (REPLACE)
const { Events, EmbedBuilder, PermissionsBitField, ChannelType, Collection, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionFlags } = require('discord.js'); // <-- ADDED InteractionFlags
const Settings = require('../models/Settings');
const User = require('../models/User');
const fs = require('fs').promises;
const path = require('path');

// --- Standard Interaction Handler ---
module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Use the client from the interaction
    const client = interaction.client;
    
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

    if (!member || member.partial) {
        try { member = await interaction.guild.members.fetch(interaction.user.id); } catch (e) { console.error("Could not fetch member:", e); return; }
    }
    if (!member) return;

    // --- FIX: Check if roles exist before accessing cache ---
    const roles = config.roles || {};
    const forgottenOneRole = roles.forgottenOne;
    const overseerRole = roles.overseer;
    const leadModRole = roles.leadMod;
    const modRole = roles.mod;
    
    const isAdmin = (forgottenOneRole && member?.roles?.cache.has(forgottenOneRole)) || 
                    (overseerRole && member?.roles?.cache.has(overseerRole)) || 
                    member?.permissions.has(PermissionsBitField.Flags.Administrator);
                    
    const isMod = isAdmin || 
                  (leadModRole && member?.roles?.cache.has(leadModRole)) || 
                  (modRole && member?.roles?.cache.has(modRole));
    // --- END FIX ---

    
    // --- FIXED: CHAT INPUT COMMAND (SLASH COMMAND) HANDLER ---
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            await interaction.reply({ content: 'Error: This command was not found.', ephemeral: true });
            return;
        }

        // --- Cooldown Logic (Example) ---
        if (!client.cooldowns.has(command.data.name)) {
            client.cooldowns.set(command.data.name, new Collection());
        }
        
        const now = Date.now();
        const timestamps = client.cooldowns.get(command.data.name);
        const defaultCooldownDuration = 3;
        const cooldownAmount = (command.cooldown || defaultCooldownDuration) * 1000;

        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
            if (now < expirationTime) {
                const expiredTimestamp = Math.round(expirationTime / 1000);
                return interaction.reply({ 
                    content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`, 
                    ephemeral: true 
                });
            }
        }
        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
        // --- End Cooldown Logic ---

        // --- Permission Logic (Example) ---
        if (command.permissions && !member.permissions.has(command.permissions)) {
             return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }
        
        // --- Admin Only Command Check (Example from your files) ---
        const adminOnlyCommands = ['addxp', 'removexp', 'addcoins', 'removecoins', 'addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'resetdailystreak', 'dbstatus'];
        if (adminOnlyCommands.includes(command.data.name) && !isAdmin) {
            return interaction.reply({ content: '❌ This command can only be used by an Administrator.', ephemeral: true });
        }
        // --- End Permission Logic ---

        try {
            // Execute the slash command
            await command.execute(interaction, client);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
            }
        }
        return; // End after handling slash command
    }

    // --- BUTTON INTERACTION LOGIC ---
    if (interaction.isButton()) {
        // --- FIX: Debounce to prevent "Interaction already acknowledged" ---
        if (client.activeInteractions.has(interaction.id)) {
            // User clicked the same button twice very fast. Ignore the second click.
            return;
        }
        client.activeInteractions.add(interaction.id);
        // --- END FIX ---
        
        const customId = interaction.customId;
        if (!interaction.channel || !interaction.guild) {
             client.activeInteractions.delete(interaction.id); // Clean up
             return;
        }

        // --- Job Apply Button ---
        if (customId.startsWith('job_apply_')) {
            try {
                await interaction.deferUpdate(); // Acknowledge the button click
                const jobId = customId.replace('job_apply_', '');
                const workProgression = client.config.workProgression.sort((a, b) => a.minWorks - b.minWorks);
                const jobToApply = workProgression.find(j => j.id === jobId);
                
                let user = await User.findOne({ userId: interaction.user.id });
                if (!user) user = new User({ userId: interaction.user.id });

                if (!jobToApply) {
                    return interaction.followUp({ content: 'This job no longer exists.', ephemeral: true });
                }
                if (user.successfulWorks < jobToApply.minWorks) {
                    return interaction.followUp({ content: `You do not meet the requirement of ${jobToApply.minWorks} successful works for this job.`, ephemeral: true });
                }

                user.currentJob = jobToApply.id;
                user.lastWork = null; // Reset work cooldown on job change
                await user.save();

                const successEmbed = new EmbedBuilder()
                    .setTitle('🎉 Congratulations!')
                    .setDescription(`You have been hired as a **${jobToApply.title}**! You can start working using \`/work job\`.`)
                    .setColor(0x00FF00);
                
                await interaction.editReply({ embeds: [successEmbed], components: [] }); // Remove buttons after applying

            } catch (error) {
                console.error("Error handling job_apply button:", error);
            } finally {
                client.activeInteractions.delete(interaction.id); // Clean up
            }
            return;
        }
        // --- Poll Result Button ---
        else if (customId === 'poll_result_manual') {
            try {
                const pollCommand = client.commands.get('poll'); // Assuming 'poll' is the slash command name
                if (!pollCommand || !pollCommand.endPoll) {
                    return interaction.reply({ content: 'Error: Poll command logic is missing.', ephemeral: true });
                }
                
                const pollData = client.polls.get(interaction.message.id);
                // Permission check: Only Mod/Admin or the poll creator can end it
                if (!isAdmin && !isMod && interaction.user.id !== pollData?.creatorId) {
                    return interaction.reply({ content: 'You do not have permission to end this poll.', ephemeral: true });
                }

                await interaction.deferUpdate(); // Acknowledge click
                await pollCommand.endPoll(interaction.channel, interaction.message.id, client, interaction, true);
                // endPoll now handles the reply
            } catch (error) {
                console.error("Error handling poll_result_manual button:", error);
            } finally {
                client.activeInteractions.delete(interaction.id); // Clean up
            }
            return;
        }
        // --- Reminder Remove Button ---
        else if (customId.startsWith('remove_reminder_')) {
            try {
                await interaction.deferUpdate();
                const reminderId = customId.replace('remove_reminder_', '');
                
                let user = await User.findOne({ userId: interaction.user.id });
                if (!user) {
                    return interaction.editReply({ content: 'Could not find your user data.', components: [] });
                }
                
                const reminderExists = user.reminders.some(r => r._id.toString() === reminderId);
                if (!reminderExists) {
                    return interaction.editReply({ content: 'This reminder was already removed or expired.', components: [] });
                }

                // Remove from DB
                user.reminders = user.reminders.filter(r => r._id.toString() !== reminderId);
                await user.save();

                // Clear live timeout
                const timeout = client.reminders.get(reminderId);
                if (timeout) {
                    clearTimeout(timeout);
                    client.reminders.delete(reminderId);
                }

                await interaction.editReply({ content: `✅ Reminder (ID: ${reminderId}) has been successfully removed.`, components: [] });
            } catch (error) {
                console.error("Error handling remove_reminder button:", error);
            } finally {
                client.activeInteractions.delete(interaction.id); // Clean up
            }
            return;
        }
        // --- TICKET CREATION BUTTON ---
        else if (customId === 'create_ticket') {
            try {
                // --- FIX: Use new ephemeral flag ---
                await interaction.deferReply({ flags: InteractionFlags.Ephemeral }); 
                // --- END FIX ---
                
                const guild = interaction.guild;
                const user = interaction.user;
                const userName = user.username;

                // --- FIX: Check if staffRoleId is valid ---
                const staffRoleId = client.config?.roles?.mod;
                if (!staffRoleId || !guild.roles.cache.has(staffRoleId)) {
                     console.error(`[Ticket Error] Moderator role ID (${staffRoleId}) is not configured or not found.`);
                     return interaction.editReply({ content: '❌ Error: Ticket system moderator role is not configured or is invalid.' });
                 }
                // --- END FIX ---
                 
                const categoryId = settings?.ticketCategoryId;
                 if (!categoryId) {
                     console.error("[Ticket Error] Ticket category ID is not set in settings.");
                     return interaction.editReply({ content: '❌ Error: Ticket category not set up. An admin needs to run `/quicksetup`.' });
                 }
                const categoryChannel = guild.channels.cache.get(categoryId);
                 if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
                     console.error(`[Ticket Error] Configured category ID ${categoryId} not found or is not a category.`);
                     return interaction.editReply({ content: '❌ Error: Configured ticket category not found or is invalid.' });
                 }

                const sanitizedUserName = userName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 80) || 'ticket';
                // --- FIXED: Use creator's name in channel ---
                const channelName = `ticket-${sanitizedUserName}`;
                const channelTopic = `Ticket created by ${user.tag} (${user.id})`;

                 let ticketChannel;
                 try {
                     ticketChannel = await guild.channels.create({
                         name: channelName,
                         type: ChannelType.GuildText,
                         parent: categoryId,
                         topic: channelTopic,
                         permissionOverwrites: [
                             { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                             { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                             { id: staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.EmbedLinks] },
                             { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.AttachFiles] }
                         ],
                     });
                 } catch (channelError) {
                      console.error(`[Ticket Error] Failed to create channel:`, channelError);
                      if (channelError.code === 50013) {
                          return interaction.editReply({ content: '❌ Error: I lack permissions to create channels in the designated category.' });
                      }
                      return interaction.editReply({ content: '❌ Error: Could not create the ticket channel.' });
                 }

                console.log(`[Ticket Created] Channel ${ticketChannel.id} for user ${user.id}`);

                const ticketEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setTitle(`Ticket | ${user.username}`)
                    .setDescription(`Welcome ${user}!\n\nA staff member (<@&${staffRoleId}>) will be with you shortly.\nPlease describe your issue in detail so we can assist you efficiently.`)
                    .setTimestamp()
                    .setFooter({ text: `User ID: ${user.id}` });
                
                // --- FIXED: Do not add close button on creation ---
                // const row = new ActionRowBuilder()...

                await ticketChannel.send({ content: `${user} <@&${staffRoleId}>`, embeds: [ticketEmbed] }); // Removed components
                await interaction.editReply({ content: `✅ Your ticket has been created! Please go to ${ticketChannel}.` });

            } catch (error) {
                 console.error('Error handling create_ticket button:', error);
                 if (error.code !== 40060) { // Don't try to reply if it was an "already acknowledged" error
                     if (!interaction.replied && !interaction.deferred) {
                         await interaction.reply({ content: 'An error occurred while creating your ticket.', ephemeral: true }).catch(console.error);
                     } else {
                          await interaction.editReply({ content: 'An error occurred while creating your ticket.' }).catch(console.error);
                     }
                 }
            } finally {
                client.activeInteractions.delete(interaction.id); // Clean up
            }
            return;
         }
         // --- TICKET CLOSE BUTTON (This is for a button *if you add one later*) ---
         else if (customId === 'close_ticket_button') {
            try {
                const channel = interaction.channel;
                const topic = channel.topic || '';
                
                const creatorMatch = topic.match(/Ticket created by .* \((\d{17,19})\)/);
                if (!creatorMatch || !creatorMatch[1]) {
                    return interaction.reply({ content: 'This does not appear to be an active ticket channel (invalid topic).', ephemeral: true });
                }
                const ticketCreatorId = creatorMatch[1];
                
                if (topic.includes('| Closed by:')) {
                    return interaction.reply({ content: 'This ticket is already being closed.', ephemeral: true });
                }

                // Permission Check
                const tempRoleId = '1433118039275999232'; // Added temp role check
                const hasTempAccess = member.roles?.cache.has(tempRoleId);
                const isOwner = ticketCreatorId === interaction.user.id;
                
                if (!isMod && !isAdmin && !isOwner && !hasTempAccess) {
                    return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
                }

                // --- FIX: Use new ephemeral flag ---
                await interaction.deferReply({ flags: InteractionFlags.Ephemeral });

                // --- TRANSCRIPT LOGIC ---
                let transcriptContent = `Transcript for Ticket\nChannel: #${channel.name} (${channel.id})\n${topic}\nClosed by: ${interaction.user.tag}\n\n`;
                let lastMessageId = null;
                let fetchComplete = false;
                const transcriptMessages = [];
                let messageCount = 0;

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
                // --- END TRANSCRIPT ---

                // --- BUG FIX: Send DM to ticketCreator, NOT interaction.user ---
                const ticketCreator = await client.users.fetch(ticketCreatorId).catch(() => null);
                if (ticketCreator) {
                    try {
                        await ticketCreator.send({
                            content: `Here is the transcript for your ticket in ${interaction.guild.name} (#${channel.name}), which was closed by ${interaction.user.tag}.`,
                            files: [attachment]
                        });
                    } catch (dmError) {
                        console.error(`Failed to DM transcript to ${ticketCreator.tag}:`, dmError);
                        await channel.send({ content: `⚠️ Couldn't DM transcript to ticket creator. Transcript attached:`, files: [attachment] }).catch(console.error);
                    }
                } else {
                     await channel.send({ content: `⚠️ Couldn't find ticket creator to DM transcript. Transcript attached:`, files: [attachment] }).catch(console.error);
                }
                // --- END BUG FIX ---

                // Update Topic
                try {
                    const newTopic = `${topic} | Closed by: ${interaction.user.tag}`;
                    await channel.setTopic(newTopic.substring(0, 1024));
                } catch (topicError) { console.error("Could not update topic on close:", topicError); }

                // Log
                if (settings && settings.modlogChannelId) {
                    // Assuming logModerationAction is available or defined in this file
                    // await logModerationAction(interaction.guild, settings, 'Ticket Closed (Button)', channel, interaction.user, `Ticket in #${channel.name} closed`);
                }

                await interaction.editReply({ content: 'Ticket closed. Channel will be deleted in 5 seconds.' });

                // Schedule deletion (5 seconds)
                setTimeout(async () => {
                    try {
                        // --- BUG FIX: Use client.channels.fetch for reliability ---
                        const channelToDelete = await client.channels.fetch(interaction.channel.id).catch(() => null);
                        if (channelToDelete) {
                            await channelToDelete.delete(`Ticket closed by ${interaction.user.tag}`);
                            console.log(`[Ticket Closed] Deleted channel ${interaction.channel.id} via button`);
                        }
                    } catch (deleteError) { console.error(`Failed to delete ticket channel ${interaction.channel.id}:`, deleteError); }
                }, 5000); // 5 seconds
            } catch (error) {
                console.error("Error handling close_ticket_button:", error);
                if (error.code !== 40060) {
                    if (!interaction.replied && !interaction.deferred) {
                         await interaction.reply({ content: 'An error occurred while closing the ticket.', ephemeral: true }).catch(console.error);
                     } else {
                          await interaction.editReply({ content: 'An error occurred while closing the ticket.' }).catch(console.error);
                     }
                 }
            } finally {
                client.activeInteractions.delete(interaction.id); // Clean up
            }
            return;
         }
         
         // --- Fallback for unknown button ---
         client.activeInteractions.delete(interaction.id);
    }
     
    // --- SELECT MENU HANDLER (Example for /quicksetup wizard) ---
    if (interaction.isStringSelectMenu()) {
        const customId = interaction.customId;

        if (customId === 'setup_category') {
            // This logic is now handled inside the quicksetup.js command execute block
            // But if you modularize it, this is where it would go.
            // For now, we'll assume the collector in quicksetup.js handles it.
            console.log(`[Interaction] Select menu interaction: ${customId}`);
        }
    }
  },
};
