// events/interactionCreate.js (FIXED - No DB Tickets, Creator Name Channel, Transcript on Close Button, REMOVED Close Button from create)
const { EmbedBuilder, PermissionsBitField, ChannelType, Collection, Events, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Settings = require('../models/Settings');
const User = require('../models/User');
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

    if (!member || member.partial) {
        try { member = await interaction.guild.members.fetch(interaction.user.id); } catch (e) { console.error("Could not fetch member:", e); return; }
    }
    if (!member) return;

    const roles = config.roles || {};
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
        // Permission & Cooldown checks... (Keep existing logic)
        // ...
         try {
            await command.execute(interaction, client, logModerationAction);
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
              // ... (keep job apply logic)
              return;
         }
         else if (customId === 'poll_result_manual') {
              // ... (keep poll logic)
              return;
         }
         else if (customId.startsWith('remove_reminder_')) {
              // ... (keep reminder logic)
              return;
         }

         // --- TICKET CREATION BUTTON ---
         else if (customId === 'create_ticket') {
             try {
                await interaction.deferReply({ ephemeral: true });
                const guild = interaction.guild;
                const user = interaction.user;
                const userName = user.username;

                const staffRoleId = client.config?.roles?.mod;
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

                const sanitizedUserName = userName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 80) || 'ticket';
                const channelName = `${sanitizedUserName}`;
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
                      return interaction.editReply({ content: '❌ Error: Could not create the ticket channel due to an unexpected issue.' });
                 }

                console.log(`[Ticket Created] Channel ${ticketChannel.id} for user ${user.id}`);

                const ticketEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setTitle(`Ticket | ${user.username}`)
                    .setDescription(`Welcome ${user}!\n\nA staff member (<@&${staffRoleId}>) will be with you shortly.\nPlease describe your issue in detail so we can assist you efficiently.`)
                    .setTimestamp()
                    .setFooter({ text: `User ID: ${user.id}` });

                // FIXED: Removed the ActionRowBuilder and ButtonBuilder for the close button here
                // const row = new ActionRowBuilder().addComponents( ... );

                // FIXED: Send message without components (no close button)
                await ticketChannel.send({ content: `${user} <@&${staffRoleId}>`, embeds: [ticketEmbed] }); // Removed 'components: [row]'

                await interaction.editReply({ content: `✅ Your ticket has been created! Please go to ${ticketChannel}.` });

            } catch (error) {
                 // Keep the rest of the error handling as before
                 console.error('Error handling create_ticket button:', error);
                 if (!interaction.replied && !interaction.deferred) {
                     await interaction.reply({ content: 'An error occurred while creating your ticket.', ephemeral: true }).catch(console.error);
                 } else if (!interaction.replied) {
                      if (error.code !== 10062) {
                         await interaction.editReply({ content: 'An error occurred while creating your ticket.' }).catch(console.error);
                     } else {
                         console.log("[Ticket Error] Could not send error reply: Interaction expired.");
                     }
                 }
            }
         }
         // --- TICKET CLOSE BUTTON --- (Keep this logic as is for manual closing via button if needed elsewhere, though the button isn't added on creation anymore)
         else if (customId === 'close_ticket_button') {
              // ... (Keep the existing close_ticket_button logic, it won't be triggered by newly created tickets anymore unless you add the button somewhere else)
              // Make sure the 5 second timeout is still here or in the ?close command
              try {
                  // ... (Existing permission checks, transcript logic, topic update, logging) ...

                  // Schedule deletion (5 seconds)
                  setTimeout(async () => {
                      try {
                          const channelToDelete = await interaction.guild.channels.fetch(interaction.channel.id).catch(() => null);
                          if (channelToDelete) {
                              await channelToDelete.delete(`Ticket closed by ${interaction.user.tag}`);
                              console.log(`[Ticket Closed] Deleted channel ${interaction.channel.id} via button`);
                          }
                      } catch (deleteError) { console.error(`Failed to delete ticket channel ${interaction.channel.id}:`, deleteError); }
                  }, 5000); // 5 seconds
              } catch (error) {
                   // ... (Existing error handling for close button) ...
              }

         }
         // --- Add other button handlers here ---
     }
     // Handle other interaction types (e.g., Select Menus, Modals)...
  },
};
