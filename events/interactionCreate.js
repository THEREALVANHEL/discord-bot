// events/interactionCreate.js (FIXED - Ticket Creation DB Save & Button Handling)
const { EmbedBuilder, PermissionsBitField, ChannelType, Collection, Events } = require('discord.js'); // Added Events
const Settings = require('../models/Settings');
const User = require('../models/User');
const Ticket = require('../models/Ticket'); // Ensure Ticket model is imported

// Assuming logModerationAction is defined elsewhere or imported
// const { logModerationAction } = require('../utils/logModerationAction');
async function logModerationAction(guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') {
 /* Placeholder for logging function */
 console.log(`[Moderation Log] Action: ${action}, Target: ${target?.tag || target}, Mod: ${moderator.tag}, Reason: ${reason}`);
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

    // Fetch member if necessary
    if (member && (!member.roles || !member.roles.cache.size || member.user.bot)) {
        try { member = await interaction.guild.members.fetch(interaction.user.id); } catch (e) { /*...*/ return; }
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
        if (!command) { /*...*/ return; }
        const cmdName = interaction.commandName;
        let permissionDenied = false;

        // --- Permission Checks (Unchanged - Keep existing checks) ---
        if (!isAdmin) {
             if (cmdName === 'poll') { /*...*/ }
             else if (['lock', 'unlock'].includes(cmdName) && !isLeadMod) { permissionDenied = true; }
             else if (['announce'].includes(cmdName) && !isMod) { permissionDenied = true; }
             else if (['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser', 'reroll'].includes(cmdName) && !isMod) { permissionDenied = true; } // Removed claimticket
             else if (cmdName === 'gamelog' && !isHost) { permissionDenied = true; }
             else if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'addxp', 'removexp', 'addcoins', 'removecoins'].includes(cmdName) && !member?.roles?.cache.has(cookiesManagerRole)) { permissionDenied = true; }
             else if (['quicksetup', 'resetdailystreak', 'dbstatus'].includes(cmdName) && !isAdmin) { permissionDenied = true; }
             // Note: Ticket setup/close handled elsewhere or via prefix perms
        }

        // --- Apply Denial (Unchanged - Keep existing messages) ---
        if (permissionDenied) { /*...*/ return interaction.reply({ content: denialMessage, ephemeral: true }).catch(console.error); }

        // --- Cooldown Check (Unchanged) ---
         if (!client.cooldowns) client.cooldowns = new Collection();
         /*...*/
         if (timestamps.has(interaction.user.id)) { /*...*/ return interaction.reply({ content: `⏱️ Please wait...`, ephemeral: true }).catch(console.error); }
         timestamps.set(interaction.user.id, now);
         setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        // --- Execute Command (Unchanged) ---
        try { await command.execute(interaction, client, logModerationAction); } catch (error) { /*...*/ }
        return; // End of ChatInputCommand logic
    }

    // --- BUTTON INTERACTION LOGIC ---
     if (interaction.isButton()) {
         const customId = interaction.customId;
         if (!interaction.channel || !interaction.guild) return;

         // --- Button Handlers (Keep existing job_apply, poll_result, remove_reminder handlers) ---
         if (customId.startsWith('job_apply_')) { /*...*/ }
         else if (customId === 'poll_result_manual') { /*...*/ }
         else if (customId.startsWith('remove_reminder_')) { /*...*/ }

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
                    return interaction.editReply({ content: '❌ Error: Ticket category not set up. Use `/ticket setup` or `?ticketpanel`.' });
                }
                const categoryChannel = guild.channels.cache.get(categoryId);
                 if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
                     return interaction.editReply({ content: '❌ Error: Configured ticket category not found or invalid.' });
                 }


                // Check if user already has an open ticket in the DB
                 const existingTicketDoc = await Ticket.findOne({ userId: user.id, guildId: guild.id, status: { $ne: 'closed' } });
                 if (existingTicketDoc) {
                     const existingChannel = guild.channels.cache.get(existingTicketDoc.channelId);
                     return interaction.editReply({ content: `You already have an open ticket: ${existingChannel || `channel ID ${existingTicketDoc.channelId}`}` });
                 }


                // Get next ticket ID (Simple increment - can have race conditions under high load, consider atomic counters later if needed)
                const lastTicket = await Ticket.findOne({ guildId: guild.id }).sort({ createdAt: -1 }); // Get the most recent ticket in this guild
                const newTicketId = (lastTicket?.ticketId || 0) + 1; // Increment from the last ID or start at 1

                // --- Create Channel ---
                const channelName = `ticket-${newTicketId}-${user.username.substring(0, 10)}`; // Include ID in name
                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: categoryId,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, // Deny @everyone
                        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] }, // Allow user
                        { id: staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages] }, // Allow Staff
                         { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageChannels] } // Allow Bot
                    ],
                });

                // --- *** SAVE TICKET TO DATABASE *** ---
                const newTicket = new Ticket({
                    guildId: guild.id, // Store guild ID
                    userId: user.id,
                    channelId: ticketChannel.id,
                    ticketId: newTicketId, // Store the calculated ID
                    status: 'open',
                });
                await newTicket.save();
                console.log(`[Ticket Created] Saved ticket ${newTicketId} for user ${user.id} in channel ${ticketChannel.id}`);
                // --- *** END DB SAVE *** ---

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
                 const closeIsAdmin = closeMember.permissions.has(PermissionsBitField.Flags.Administrator) || [roles.forgottenOne, roles.overseer].some(roleId => closeMember.roles.cache.has(roleId));
                 const closeIsMod = closeIsAdmin || [roles.leadMod, roles.mod].some(roleId => closeMember.roles.cache.has(roleId));
                 const closeIsOwner = ticket.userId === interaction.user.id;
                 const closeTempRoleId = '1433118039275999232';
                 const closeHasTempAccess = closeMember.roles.cache.has(closeTempRoleId);

                 if (!closeIsMod && !closeIsOwner && !closeHasTempAccess) {
                     return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
                 }

                 // Mark as closed in DB
                 ticket.status = 'closed';
                 await ticket.save();

                 // Update interaction (ephemeral confirmation)
                 await interaction.reply({ content: '🔒 Closing ticket... Deletion scheduled.', ephemeral: true });

                 // Send public closing message
                 await interaction.channel.send(`Ticket #${ticket.ticketId} closed by ${interaction.user}. Channel deletion scheduled.`);

                 // Disable button (optional, as channel will be deleted)
                 // const disabledRow = ActionRowBuilder.from(interaction.message.components[0]).setComponents(
                 //     ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true)
                 // );
                 // await interaction.message.edit({ components: [disabledRow] }).catch(()=>{});


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
                             await Ticket.deleteOne({ channelId: interaction.channel.id }).catch(console.error);
                         }
                     } catch (deleteError) { console.error(`Failed to delete ticket channel ${interaction.channel.id}:`, deleteError); /* Optional: Log failure */ }
                 }, 10000); // 10 seconds

            } catch(error) {
                console.error("Error closing ticket via button:", error);
                 if (!interaction.replied && !interaction.deferred) {
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
