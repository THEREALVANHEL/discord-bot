// events/interactionCreate.js (FIXED - Added Transcript on Close Button)
const { EmbedBuilder, PermissionsBitField, ChannelType, Collection, Events, AttachmentBuilder } = require('discord.js'); // Added AttachmentBuilder
const Settings = require('../models/Settings');
const User = require('../models/User');
const Ticket = require('../models/Ticket'); // Ensure Ticket model is imported
const fs = require('fs').promises; // Use promises for async file operations
const path = require('path'); // To manage file paths

// Assuming logModerationAction is defined elsewhere or imported
// const { logModerationAction } = require('../utils/logModerationAction');
async function logModerationAction(guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') {
 /* Placeholder for logging function */
 console.log(`[Moderation Log] Action: ${action}, Target: ${target?.tag || target?.name || target}, Mod: ${moderator.tag}, Reason: ${reason}`);
}


module.exports = {
  name: Events.InteractionCreate, // Use Events.InteractionCreate
  async execute(interaction, client) { // Added client parameter back
    if (!interaction.guild) return; // Ignore DMs

    let member = interaction.member;
    const config = client.config;
    let settings;
     try {
         settings = await Settings.findOne({ guildId: interaction.guild.id });
     } catch (dbError) {
         console.error("Error fetching settings:", dbError);
         if (interaction.isRepliable()) {
            await interaction.reply({ content: 'Error fetching server settings.', ephemeral: true }).catch(console.error);
         }
         return;
     }

    // Fetch member if necessary (e.g., if cache is incomplete)
    if (!member) {
        try { member = await interaction.guild.members.fetch(interaction.user.id); } catch (e) { console.error("Could not fetch member:", e); return; }
    } else if (member.partial) {
         try { member = await member.fetch(); } catch (e) { console.error("Could not fetch partial member:", e); return; }
    }

    const roles = config.roles || {};
    const forgottenOneRole = roles.forgottenOne; const overseerRole = roles.overseer;
    const leadModRole = roles.leadMod; const modRole = roles.mod;
    const gamelogUserRole = roles.gamelogUser; const headHostRole = roles.headHost;
    const cookiesManagerRole = roles.cookiesManager;
    const isAdmin = member?.roles?.cache.has(forgottenOneRole) || member?.roles?.cache.has(overseerRole) || member?.permissions.has(PermissionsBitField.Flags.Administrator);
    const isLeadMod = member?.roles?.cache.has(leadModRole);
    const isMod = isLeadMod || member?.roles?.cache.has(modRole) || isAdmin;
    const isHost = member?.roles?.cache.has(gamelogUserRole) || member?.roles?.cache.has(headHostRole);

    // --- COMMAND LOGIC ---
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`Command not found: ${interaction.commandName}`);
             if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'Command not found.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Command not found.', ephemeral: true });
            }
            return;
         }
        const cmdName = interaction.commandName;
        let permissionDenied = false;
        let denialMessage = '🛡️ You do not have permission to use this command.';

        // --- Permission Checks ---
        if (!isAdmin) {
             if (cmdName === 'poll') { /* No specific check needed here if base perms suffice */ }
             else if (['lock', 'unlock'].includes(cmdName) && !isLeadMod) { permissionDenied = true; denialMessage = '🔒 You need the Lead Moderator role or `Manage Channels` permission.'; }
             else if (['announce'].includes(cmdName) && !isMod) { permissionDenied = true; denialMessage = '📣 You need Moderator permissions to announce.'; }
             else if (['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser', 'reroll', 'unmute', 'claimticket', 'closeticket'].includes(cmdName) && !isMod) { permissionDenied = true; } // claim/close technically prefix only, but check anyway
             else if (cmdName === 'gamelog' && !isHost) { permissionDenied = true; denialMessage = '🎮 You need Host permissions to log games.'; }
             else if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall'].includes(cmdName) && !member?.roles?.cache.has(cookiesManagerRole)) { permissionDenied = true; denialMessage = '🍪 You need the Cookies Manager role.'; }
             else if (['addxp', 'removexp', 'addcoins', 'removecoins'].includes(cmdName) && !(isAdmin || member?.roles?.cache.has(cookiesManagerRole))) { permissionDenied = true; denialMessage = '💰 You need Admin or Cookies Manager permissions.'; } // Allow Admin for XP/Coins too
             else if (['quicksetup', 'resetdailystreak', 'dbstatus', 'aisetup', 'rrpanel'].includes(cmdName) && !isAdmin) { permissionDenied = true; } // Added aisetup, rrpanel
             // Note: Ticket setup/close handled elsewhere or via prefix perms
        }


        if (permissionDenied) {
             console.log(`[Permission Denied] User ${interaction.user.tag} tried to use /${cmdName}`);
             return interaction.reply({ content: denialMessage, ephemeral: true }).catch(console.error);
        }

        // --- Cooldown Check ---
         if (!client.cooldowns) client.cooldowns = new Collection();
         const cooldowns = client.cooldowns.get(command.data.name);
         if (!cooldowns) {
            client.cooldowns.set(command.data.name, new Collection());
         }
         const now = Date.now();
         const timestamps = client.cooldowns.get(command.data.name);
         const cooldownAmount = (command.cooldown || 3) * 1000; // Default 3s

         if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return interaction.reply({ content: `⏱️ Please wait ${timeLeft.toFixed(1)}s before reusing \`/${command.data.name}\`.`, ephemeral: true }).catch(console.error);
            }
         }
         timestamps.set(interaction.user.id, now);
         setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        // --- Execute Command ---
        try {
            console.log(`[Slash Command] User ${interaction.user.tag} used /${cmdName}`);
            await command.execute(interaction, client, logModerationAction);
        } catch (error) {
            console.error(`Error executing slash command ${interaction.commandName}:`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
            }
        }
        return; // End of ChatInputCommand logic
    }

    // --- BUTTON INTERACTION LOGIC ---
     if (interaction.isButton()) {
         const customId = interaction.customId;
         if (!interaction.channel || !interaction.guild) return;

         // --- Button Handlers (Keep existing job_apply, poll_result, remove_reminder handlers) ---
         if (customId.startsWith('job_apply_')) {
             try {
                await interaction.deferUpdate(); // Acknowledge button press without replying
                const jobId = customId.split('_')[2];
                const workProgression = client.config.workProgression.sort((a, b) => a.minWorks - b.minWorks); // Sort by works
                const jobToApply = workProgression.find(job => job.id === jobId);
                let user = await User.findOne({ userId: interaction.user.id });
                if (!user) user = new User({ userId: interaction.user.id });

                if (!jobToApply) {
                    return interaction.followUp({ content: "❌ Job not found.", ephemeral: true });
                }
                // Check eligibility again (important!)
                if (user.successfulWorks < jobToApply.minWorks) {
                     return interaction.followUp({ content: `❌ You need ${jobToApply.minWorks} successful works to apply for ${jobToApply.title}.`, ephemeral: true });
                }
                if (user.currentJob === jobToApply.id) {
                     return interaction.followUp({ content: `✅ You already have the job: ${jobToApply.title}.`, ephemeral: true });
                }

                user.currentJob = jobToApply.id;
                await user.save();

                const applySuccessEmbed = new EmbedBuilder()
                    .setTitle("💼 Application Successful!")
                    .setDescription(`Congratulations, ${interaction.user}! You have been hired as a **${jobToApply.title}**. Use \`/work job\` to start working.`)
                    .setColor(0x00FF00)
                    .setTimestamp();

                // Edit the original message to remove buttons and show success
                await interaction.editReply({ embeds: [applySuccessEmbed], components: [] });

             } catch (error) {
                 console.error("Error handling job application button:", error);
                 await interaction.followUp({ content: "An error occurred processing your application.", ephemeral: true }).catch(console.error);
             }
             return; // Added return
         }
         else if (customId === 'poll_result_manual') {
              try {
                  const pollData = client.polls.get(interaction.message.id);
                  if (!pollData) {
                      return interaction.reply({ content: 'This poll is no longer active or tracked.', ephemeral: true });
                  }
                  // Permission check: Only original creator or Admin/Mod
                  const endIsAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) || [roles.forgottenOne, roles.overseer].some(roleId => member.roles.cache.has(roleId));
                  const endIsMod = endIsAdmin || [roles.leadMod, roles.mod].some(roleId => member.roles.cache.has(roleId));
                  const isCreator = interaction.user.id === pollData.creatorId;

                  if (!isCreator && !endIsMod) {
                      return interaction.reply({ content: 'Only the poll creator or a moderator can end this poll early.', ephemeral: true });
                  }

                  await interaction.deferReply({ ephemeral: true });
                  const { endPoll } = require('../commands/poll'); // Get the endPoll function
                  await endPoll(interaction.channel, interaction.message.id, client, interaction, true); // Pass interaction
                  await interaction.editReply({ content: '✅ Poll ended manually.' }); // Edit deferred reply
              } catch (error) {
                   console.error("Error ending poll manually via button:", error);
                   await interaction.editReply({ content: 'An error occurred while ending the poll.' }).catch(console.error);
              }
              return; // Added return
         }
         else if (customId.startsWith('remove_reminder_')) {
             try {
                  await interaction.deferUpdate(); // Acknowledge button
                  const reminderId = customId.split('_')[2];

                  let user = await User.findOne({ userId: interaction.user.id });
                  if (!user) {
                      return interaction.followUp({ content: "Could not find your user data.", ephemeral: true });
                  }

                  const reminderIndex = user.reminders.findIndex(r => r._id.toString() === reminderId);
                  if (reminderIndex === -1) {
                      return interaction.followUp({ content: "Reminder not found or already removed.", ephemeral: true });
                  }

                  // Clear timeout if it exists
                  const timeoutId = client.reminders.get(reminderId);
                  if (timeoutId) {
                      clearTimeout(timeoutId);
                      client.reminders.delete(reminderId);
                  }

                  // Remove from DB
                  user.reminders.splice(reminderIndex, 1);
                  await user.save();

                  await interaction.editReply({ content: '✅ Reminder removed successfully.', components: [] }); // Remove buttons

             } catch (error) {
                  console.error("Error removing reminder via button:", error);
                  await interaction.followUp({ content: "An error occurred while removing the reminder.", ephemeral: true }).catch(console.error);
             }
             return; // Added return
         }

         // --- TICKET CREATION BUTTON ---
         else if (customId === 'create_ticket') {
             try {
                await interaction.deferReply({ ephemeral: true });

                const guild = interaction.guild;
                const user = interaction.user;

                // --- Configuration ---
                const staffRoleId = client.config?.roles?.mod; // Mod role gets pinged
                if (!staffRoleId) {
                    console.error("[Ticket Error] 'mod' role ID not found in client.config.roles");
                    return interaction.editReply({ content: '❌ Error: Ticket system role config missing.' });
                }

                // Get ticket category from settings
                let categoryId = settings?.ticketCategoryId;
                if (!categoryId) {
                    return interaction.editReply({ content: '❌ Error: Ticket category not set up. Use `/ticket setup`.' });
                }
                const categoryChannel = guild.channels.cache.get(categoryId);
                 if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
                     return interaction.editReply({ content: '❌ Error: Configured ticket category not found or invalid.' });
                 }


                // Check if user already has an open ticket in the DB
                 const existingTicketDoc = await Ticket.findOne({ userId: user.id, status: { $ne: 'closed' } }); // Removed guildId check to make it global per user
                 if (existingTicketDoc) {
                     // Check if the channel still exists in *any* guild the bot is in
                     const existingChannel = client.channels.cache.get(existingTicketDoc.channelId);
                     return interaction.editReply({ content: `You already have an open ticket: ${existingChannel || `in another server (Channel ID ${existingTicketDoc.channelId})`}` });
                 }


                // Get next ticket ID (Simple increment - consider atomic counters if needed)
                const lastTicket = await Ticket.findOne().sort({ ticketId: -1 }); // Get highest ID globally
                const newTicketId = (lastTicket?.ticketId || 0) + 1;

                // --- Create Channel ---
                const channelName = `ticket-${newTicketId}-${user.username.substring(0, 10).replace(/[^a-z0-9_-]/gi, '') || 'user'}`; // Sanitize username
                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: categoryId,
                    topic: `Ticket #${newTicketId} created by ${user.tag} (${user.id})`,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, // Deny @everyone
                        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] }, // Allow user
                        { id: staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages] }, // Allow Staff
                         { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageChannels] } // Allow Bot
                    ],
                });

                // --- SAVE TICKET TO DATABASE ---
                const newTicket = new Ticket({
                    // guildId: guild.id, // Removed guildId to make tickets user-global
                    userId: user.id,
                    channelId: ticketChannel.id,
                    ticketId: newTicketId, // Store the calculated ID
                    status: 'open',
                });
                await newTicket.save();
                console.log(`[Ticket Created] Saved ticket ${newTicketId} for user ${user.id} in channel ${ticketChannel.id}`);
                // --- END DB SAVE ---

                // Send welcome message in the new channel
                const ticketEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setTitle(`Ticket #${newTicketId} | Support Request`)
                    .setDescription(`Welcome ${user}!\n\nA staff member (<@&${staffRoleId}>) will be with you shortly.\nPlease describe your issue in detail.`)
                    .setTimestamp()
                    .setFooter({ text: `User ID: ${user.id}` });

                // Add close button
                 const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket_button') // Use a distinct ID for button close
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                 );
                 
                // --- PING ON CREATE (Already Correct) ---
                await ticketChannel.send({ content: `${user} <@&${staffRoleId}>`, embeds: [ticketEmbed], components: [row] });

                // Confirm creation ephemerally
                await interaction.editReply({ content: `✅ Your ticket has been created! Please go to ${ticketChannel}.` });

            } catch (error) {
                console.error('Error creating ticket channel:', error);
                // Use followUp if deferReply was used
                if (!interaction.replied) {
                   await interaction.followUp({ content: 'An error occurred while creating your ticket.', ephemeral: true }).catch(console.error);
                }
            }
         }
         // --- TICKET CLOSE BUTTON ---
         else if (customId === 'close_ticket_button') {
            try {
                // Check if channel is a ticket channel according to DB
                 const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                 if (!ticket) {
                     return interaction.reply({ content: 'This button seems to be in a non-ticket channel.', ephemeral: true });
                 }
                 if (ticket.status === 'closed') {
                    return interaction.reply({ content: 'This ticket is already being closed.', ephemeral: true });
                 }

                 // Permission check (Mod, Admin, Ticket Owner, Temp Access)
                 const closeMember = interaction.member; // User clicking the button
                 const closeIsAdmin = closeMember.permissions.has(PermissionsBitField.Flags.Administrator) || [roles.forgottenOne, roles.overseer].some(roleId => closeMember.roles?.cache.has(roleId));
                 const closeIsMod = closeIsAdmin || [roles.leadMod, roles.mod].some(roleId => closeMember.roles?.cache.has(roleId));
                 const closeIsOwner = ticket.userId === interaction.user.id;
                 const closeTempRoleId = '1433118039275999232'; // Make sure this ID is correct
                 const closeHasTempAccess = closeMember.roles?.cache.has(closeTempRoleId);

                 if (!closeIsMod && !closeIsOwner && !closeHasTempAccess) {
                     return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
                 }

                 // Mark as closed in DB *before* sending messages
                 ticket.status = 'closed';
                 await ticket.save();

                 // Update interaction (ephemeral confirmation) BEFORE fetching messages
                 await interaction.reply({ content: '🔒 Closing ticket and generating transcript...', ephemeral: true });

                 // --- TRANSCRIPT LOGIC ---
                 let transcriptContent = `Transcript for Ticket #${ticket.ticketId}\nCreated by: ${interaction.client.users.cache.get(ticket.userId)?.tag || ticket.userId}\nClosed by: ${interaction.user.tag}\n\n`;
                 let lastMessageId = null;
                 let fetchComplete = false;
                 const transcriptMessages = [];

                 try {
                     while (!fetchComplete) {
                        const options = { limit: 100 };
                        if (lastMessageId) {
                            options.before = lastMessageId;
                        }
                        const fetched = await interaction.channel.messages.fetch(options);

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
                    
                    // Sort messages from oldest to newest
                    transcriptMessages.reverse(); 

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
                                content: `Here is the transcript for your ticket #${ticket.ticketId} in ${interaction.guild.name}, which was closed by ${interaction.user.tag}.`,
                                files: [attachment]
                            });
                             await interaction.editReply({ content: '🔒 Closing ticket... Transcript sent via DM.'}); // Update ephemeral reply
                        } catch (dmError) {
                            console.error(`Failed to DM transcript to ${ticketCreator.tag}:`, dmError);
                            await interaction.editReply({ content: '🔒 Closing ticket... Couldn\'t DM transcript (DMs might be closed).' }); // Update ephemeral reply
                            // Optionally, post transcript in a private log channel?
                        }
                    } else {
                        await interaction.editReply({ content: '🔒 Closing ticket... Couldn\'t find the ticket creator to DM.' }); // Update ephemeral reply
                    }

                 } catch (fetchError) {
                     console.error(`Error fetching messages for transcript (Ticket ${ticket.ticketId}):`, fetchError);
                     await interaction.editReply({ content: '🔒 Closing ticket... Error creating transcript.' }); // Update ephemeral reply
                 }
                 // --- END TRANSCRIPT LOGIC ---

                 // Send public closing message AFTER transcript attempt
                 await interaction.channel.send(`Ticket #${ticket.ticketId} closed by ${interaction.user}. Channel deletion scheduled.`);

                 // Disable button (optional, as channel will be deleted)
                 try {
                     const originalMessage = await interaction.channel.messages.fetch(interaction.message.id);
                     if (originalMessage && originalMessage.components.length > 0) {
                        const disabledRow = ActionRowBuilder.from(originalMessage.components[0]).setComponents(
                            ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true)
                        );
                        await originalMessage.edit({ components: [disabledRow] }).catch(()=>{});
                     }
                 } catch (editError) {console.log("Could not disable close button:", editError.message)}


                 // Log
                 if (settings && settings.modlogChannelId) {
                     await logModerationAction(interaction.guild, settings, 'Ticket Closed (Button)', interaction.channel, interaction.user, `Ticket #${ticket.ticketId} closed`);
                 }

                 // Schedule deletion
                 setTimeout(async () => {
                     try {
                         const channelToDelete = await interaction.guild.channels.fetch(interaction.channel.id).catch(() => null);
                         if (channelToDelete) {
                             await channelToDelete.delete(`Ticket #${ticket.ticketId} closed`);
                             // Optionally remove from DB after successful delete
                             await Ticket.deleteOne({ channelId: interaction.channel.id }).catch(console.error);
                         }
                     } catch (deleteError) { console.error(`Failed to delete ticket channel ${interaction.channel.id}:`, deleteError); /* Optional: Log failure */ }
                 }, 15000); // 15 seconds to allow DM to potentially send

            } catch(error) {
                console.error("Error closing ticket via button:", error);
                 if (!interaction.replied) { // Check if we already replied ephemerally
                    await interaction.followUp({ content: 'An error occurred while closing the ticket.', ephemeral: true }).catch(console.error);
                 }
            }
         }
         // --- Add other button handlers ---
     }
     // Handle other interaction types...
  },
};
