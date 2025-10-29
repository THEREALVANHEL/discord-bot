// events/interactionCreate.js (FIXED - Now saves ticket to database)
const { EmbedBuilder, PermissionsBitField, ChannelType, Collection } = require('discord.js');
const Settings = require('../models/Settings');
const User = require('../models/User');
const Ticket = require('../models/Ticket'); // <-- 1. IMPORT TICKET MODEL

async function logModerationAction(guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') {
  if (!settings || !settings.modlogChannelId) return;

  const modlogChannel = guild.channels.cache.get(settings.modlogChannelId);
  if (!modlogChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(`Moderation Action: ${action}`)
    .setColor(0x7289DA) // Blurple
    .addFields(
      { name: 'Target', value: target ? `${target.tag || target} (${target.id || 'N/A'})` : 'N/A' },
      { name: 'Moderator', value: `${moderator.tag} (${moderator.id})` },
      { name: 'Reason', value: reason },
      { name: 'Extra', value: extra || 'N/A' },
    )
    .setTimestamp();

  // Use try-catch for sending messages to prevent crashes if channel perms change
  try {
      await modlogChannel.send({ embeds: [embed] });
  } catch (error) {
      console.error(`Failed to send modlog message to channel ${settings.modlogChannelId}:`, error);
  }
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isMessageComponent()) return;

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

    if (member && (!member.roles || !member.roles.cache.size || member.user.bot)) {
        try {
            member = await interaction.guild.members.fetch(interaction.user.id);
        } catch (e) {
             console.error("Failed to fetch member:", e);
             if (interaction.isRepliable()) {
                 await interaction.reply({ content: 'Could not fetch your member data.', ephemeral: true }).catch(console.error);
             }
             return;
        }
    }

    const roles = config.roles || {};
    const forgottenOneRole = roles.forgottenOne;
    const overseerRole = roles.overseer;
    const leadModRole = roles.leadMod;
    const modRole = roles.mod;
    const gamelogUserRole = roles.gamelogUser;
    const headHostRole = roles.headHost;
    const cookiesManagerRole = roles.cookiesManager;
    const isAdmin = member?.roles?.cache.has(forgottenOneRole) || member?.roles?.cache.has(overseerRole);
    const isLeadMod = member?.roles?.cache.has(leadModRole);
    const isMod = isLeadMod || member?.roles?.cache.has(modRole) || isAdmin;
    const isHost = member?.roles?.cache.has(gamelogUserRole) || member?.roles?.cache.has(headHostRole);

    // --- COMMAND LOGIC ---
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            if (interaction.isRepliable()) {
               await interaction.reply({ content: 'Command not found.', ephemeral: true }).catch(console.error);
            }
            return;
        }

        const cmdName = interaction.commandName;
        let permissionDenied = false;

        if (!member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            // 2. PERMISSION CHECKS
            if (cmdName === 'poll') {
                const subcommand = interaction.options.getSubcommand(false);
                if (subcommand === 'result' && !isMod) {
                     permissionDenied = true;
                }
            }
            else if (['lock', 'unlock'].includes(cmdName) && !isLeadMod) {
                 permissionDenied = true;
            }
            else if (['announce'].includes(cmdName) && !isMod) {
                 permissionDenied = true;
            }
             else if (cmdName === 'poll' && interaction.options.getSubcommand(false) === 'create' ) {
                 // permissionDenied = true; // Uncomment if mods only
             }
            else if (['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser', 'reroll', 'claimticket'].includes(cmdName)) {
                if (!isMod) {
                     permissionDenied = true;
                }
            }
            else if (cmdName === 'gamelog' && !isHost) {
                 permissionDenied = true;
            }
            else if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'addxp', 'removexp', 'addcoins', 'removecoins'].includes(cmdName) && !member?.roles?.cache.has(cookiesManagerRole)) {
                permissionDenied = true;
            }
            else if (['quicksetup', 'resetdailystreak', 'dbstatus'].includes(cmdName) && !isAdmin) {
                 permissionDenied = true;
            }
        }

        // 3. APPLY DENIAL
        if (permissionDenied) {
            const currencyCommands = ['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'addxp', 'removexp', 'addcoins', 'removecoins'];
            const hostCommands = ['gamelog'];
            const announceCommands = ['announce' ];
            const lockCommands = ['lock', 'unlock'];
            const adminCommands = ['quicksetup', 'resetdailystreak', 'dbstatus'];
            const modCommands = ['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser', 'reroll', 'claimticket', 'poll result'];

            let denialMessage = '🛡️ You do not have permission to use this command.';

            if (currencyCommands.includes(cmdName)) {
                denialMessage = '🍪 You do not have the Currency Manager role required for this command.';
            } else if (hostCommands.includes(cmdName)) {
                denialMessage = '🎮 Only Host roles can use this command.';
            } else if (announceCommands.includes(cmdName)) {
                denialMessage = '📢 Only moderators or admins can use this command.';
            } else if (lockCommands.includes(cmdName)) {
                denialMessage = '🔒 Only lead moderators or admins can use this command.';
            } else if (adminCommands.includes(cmdName)) {
                 denialMessage = '👑 Only top-level Administrators (Overseer/Forgotten One) can use this command.';
            } else if (modCommands.includes(cmdName) || (cmdName === 'poll' && interaction.options.getSubcommand(false) === 'result')) {
                 denialMessage = '🛡️ Only moderators or admins can use this command.';
            }

             if (interaction.isRepliable()) {
                 return interaction.reply({ content: denialMessage, ephemeral: true }).catch(console.error);
             } else {
                 console.log(`Permission denied for ${interaction.user.tag} on command ${cmdName}, but interaction was not repliable.`);
                 return;
             }
        }

        // 4. COOLDOWN CHECK
         if (!client.cooldowns) client.cooldowns = new Collection();
        const now = Date.now();
        const cooldownAmount = (command.cooldown || 3) * 1000;
        if (!client.cooldowns.has(command.data.name)) {
            client.cooldowns.set(command.data.name, new Map());
        }
        const timestamps = client.cooldowns.get(command.data.name);
        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                 if (interaction.isRepliable()) {
                    return interaction.reply({ content: `⏱️ Please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.data.name}\` command.`, ephemeral: true }).catch(console.error);
                 }
                 return;
            }
        }
        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        // 5. EXECUTE
        try {
            await command.execute(interaction, client, logModerationAction);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: '❌ **Command Error:** There was an error executing that command!', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ **Command Error:** There was an error executing that command!', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Failed to send interaction error message:', replyError);
            }
        }
        return; // End of ChatInputCommand logic
    }

    // --- BUTTON INTERACTION LOGIC ---
     if (interaction.isButton()) {
         const customId = interaction.customId;

         if (!interaction.channel || !interaction.guild) {
             console.log("Button interaction in invalid context (no channel/guild).");
             return;
         }

         // 1. /work apply button handling
         if (customId.startsWith('job_apply_')) {
             try {
                 await interaction.deferReply({ ephemeral: true });
                 const jobId = customId.split('_')[2];
                 let user = await User.findOne({ userId: interaction.user.id });
                 if (!user) {
                      user = new User({ userId: interaction.user.id });
                      await user.save();
                 }
                 const workProgression = client.config.workProgression.sort((a, b) => a.minWorks - b.minWorks);
                 const newJob = workProgression.find(job => job.id === jobId);
                 if (!newJob) {
                     return interaction.editReply({ content: '❌ Error: Invalid job selected.' });
                 }
                 const currentIndex = user.currentJob ? workProgression.findIndex(j => j.id === user.currentJob) : -1;
                 const newJobIndex = workProgression.findIndex(j => j.id === jobId);
                 const isEligible =
                      (currentIndex === -1 && newJobIndex === 0) ||
                      (currentIndex !== -1 && newJobIndex === currentIndex + 1 && user.successfulWorks >= newJob.minWorks);
                 if (!isEligible) {
                     return interaction.editReply({ content: "❌ **Error:** You are not currently eligible for this position. You might need more successful works, or you tried to skip a tier. Check \`/work apply\` again." });
                 }
                 user.currentJob = jobId;
                 user.lastResigned = null;
                 await user.save();
                 return interaction.editReply({
                     content: `✅ **Application Successful!** You are now a **${newJob.title}**! Get to work with \`/work job\`.`
                 });
             } catch (error) {
                 console.error("Error handling job apply button:", error);
                 if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'An error occurred while processing your application.', ephemeral: true }).catch(console.error);
                 } else if (!interaction.replied) {
                    await interaction.editReply({ content: 'An error occurred while processing your application.' }).catch(console.error);
                 }
             }
         }

         // 2. /poll result button handling
         else if (customId === 'poll_result_manual') {
             const buttonIsMod = member?.roles?.cache.has(leadModRole) || member?.roles?.cache.has(modRole) || isAdmin || member?.permissions.has(PermissionsBitField.Flags.Administrator);
             if (!buttonIsMod) {
                 return interaction.reply({ content: '❌ You do not have permission to manually end this poll.', ephemeral: true }).catch(console.error);
             }
             try {
                 await interaction.deferReply({ ephemeral: true });
                 const pollCommand = client.commands.get('poll');
                 if (!pollCommand || !pollCommand.endPoll) {
                     return interaction.editReply({ content: '❌ Poll management function not found.' });
                 }
                  if (!interaction.message) {
                      return interaction.editReply({ content: '❌ Error: Could not find the poll message associated with this button.' });
                  }
                 await pollCommand.endPoll(interaction.channel, interaction.message.id, client, interaction, true);
                 return interaction.editReply({ content: `✅ **Poll Ended!** Results posted.` });
             } catch (error) {
                 console.error("Error handling poll end button:", error);
                  if (!interaction.replied && !interaction.deferred) {
                     await interaction.reply({ content: 'An error occurred while trying to end the poll.', ephemeral: true }).catch(console.error);
                  } else if (!interaction.replied) {
                    await interaction.editReply({ content: 'An error occurred while trying to end the poll.' }).catch(console.error);
                  }
             }
         }

         // 3. /reminders remove button handling
         else if (customId.startsWith('remove_reminder_')) {
             try {
                 const reminderId = customId.split('_')[2];
                 let user = await User.findOne({ userId: interaction.user.id });
                 if (!user || !user.reminders.some(r => r._id.toString() === reminderId)) {
                     return interaction.reply({ content: '❌ This is not your reminder or it no longer exists.', ephemeral: true }).catch(console.error);
                 }
                  await interaction.deferReply({ ephemeral: true });
                 const initialCount = user.reminders.length;
                 user.reminders = user.reminders.filter(r => r._id.toString() !== reminderId);
                 await user.save();
                 if (initialCount === user.reminders.length) {
                     return interaction.editReply({ content: '❌ Error: Reminder not found or already removed.' });
                 }
                 const timeout = client.reminders ? client.reminders.get(reminderId) : null;
                 if (timeout) {
                     clearTimeout(timeout);
                     client.reminders.delete(reminderId);
                 }
                 try {
                     await interaction.message.edit({ components: [] });
                 } catch (editError) {
                      console.error("Could not edit original reminder message (maybe deleted?):", editError);
                 }
                 return interaction.editReply({ content: `✅ Reminder removed successfully.` });
             } catch (error) {
                 console.error("Error handling reminder remove button:", error);
                 if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'An error occurred while trying to remove the reminder.', ephemeral: true }).catch(console.error);
                 } else if (!interaction.replied) {
                    await interaction.editReply({ content: 'An error occurred while trying to remove the reminder.' }).catch(console.error);
                 }
             }
         }
         
         // 4. TICKET CREATION
         else if (customId === 'create_ticket') {
             try {
                await interaction.deferReply({ ephemeral: true });

                const guild = interaction.guild;
                const user = interaction.user;

                // --- Configuration ---
                const staffRoleId = client.config?.roles?.mod;
                if (!staffRoleId) {
                    console.error("[Ticket Error] 'mod' role ID not found in client.config.roles");
                    return interaction.editReply({ content: '❌ Error: The ticket system is not configured correctly. Please contact an admin.' });
                }
                
                // Get ticket category from settings, fallback to searching
                let categoryId = settings?.ticketCategoryId;
                if (!categoryId) {
                    let category = guild.channels.cache.find(c => c.name.toLowerCase() === 'tickets' && c.type === ChannelType.GuildCategory);
                    if (!category) {
                         category = guild.channels.cache.find(c => c.name.toLowerCase() === 'support' && c.type === ChannelType.GuildCategory);
                    }
                    if (category) categoryId = category.id;
                }

                // --- Logic ---
                const channelName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20)}`;
                const existingTicket = guild.channels.cache.find(c => c.name === channelName && c.parentId === categoryId);
                if (existingTicket) {
                    return interaction.editReply({ content: `You already have an open ticket: ${existingTicket}` });
                }

                // Get next ticket ID
                const lastTicket = await Ticket.findOne().sort({ ticketId: -1 });
                const newTicketId = (lastTicket?.ticketId || 0) + 1;

                // 5. Create the channel
                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: categoryId ? categoryId : null,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
                        { id: staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ManageMessages] },
                         { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.EmbedLinks] }
                    ],
                });

                // --- 2. START OF TICKET DB FIX ---
                // Create and save the ticket document in MongoDB
                const newTicket = new Ticket({
                    guildId: guild.id,
                    userId: user.id,
                    channelId: ticketChannel.id,
                    ticketId: newTicketId,
                    status: 'open',
                });
                await newTicket.save();
                // --- END OF TICKET DB FIX ---

                // 6. Send welcome message
                const ticketEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setTitle(`Ticket #${newTicketId} | ${user.tag}`)
                    .setDescription(`Welcome! A staff member will be with you shortly.\n\nPlease describe your issue in detail.`)
                    .setTimestamp();
                
                await ticketChannel.send({ content: `${user} <@&${staffRoleId}>`, embeds: [ticketEmbed] });

                // 7. Send confirmation
                await interaction.editReply({ content: `✅ Your ticket has been created! Please go to ${ticketChannel}.` });

            } catch (error) {
                console.error('Error creating ticket channel:', error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ content: 'An error occurred while trying to create your ticket. Please contact a staff member directly.' }).catch(console.error);
                }
            }
         }
     }
  },
};
