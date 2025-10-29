// events/interactionCreate.js (REPLACED - Added full ticket creation logic)
const { EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js'); // ADDED ChannelType
const Settings = require('../models/Settings');
const User = require('../models/User'); // ADDED: Import User model

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
  async execute(interaction, client) { // Added client parameter
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isMessageComponent()) return;

    let member = interaction.member;
    const config = client.config; // Ensure client.config is passed or globally available
    let settings; // Define settings here
     try {
         settings = await Settings.findOne({ guildId: interaction.guild.id });
     } catch (dbError) {
         console.error("Error fetching settings:", dbError);
         // Handle error appropriately, maybe reply to interaction
         if (interaction.isRepliable()) {
            await interaction.reply({ content: 'Error fetching server settings.', ephemeral: true }).catch(console.error);
         }
         return;
     }

    // FIX (Robustness): Fetch the member's current data if cache is empty/stale.
    if (member && (!member.roles || !member.roles.cache.size || member.user.bot)) { // Added check for member.roles existence
        try {
            member = await interaction.guild.members.fetch(interaction.user.id);
        } catch (e) {
             console.error("Failed to fetch member:", e);
             // If fetch fails, don't proceed if member is essential
             if (interaction.isRepliable()) {
                 await interaction.reply({ content: 'Could not fetch your member data.', ephemeral: true }).catch(console.error);
             }
             return;
        }
    }

    // Safely access roles object
    const roles = config.roles || {};

    // Define roles based on config or provide defaults
    const forgottenOneRole = roles.forgottenOne;
    const overseerRole = roles.overseer;
    const leadModRole = roles.leadMod;
    const modRole = roles.mod;
    const gamelogUserRole = roles.gamelogUser;
    const headHostRole = roles.headHost;
    const cookiesManagerRole = roles.cookiesManager;

    // Admin roles (Used only for messaging now)
    const isAdmin = member?.roles?.cache.has(forgottenOneRole) || member?.roles?.cache.has(overseerRole);
    // Mod roles
    const isLeadMod = member?.roles?.cache.has(leadModRole);
    const isMod = isLeadMod || member?.roles?.cache.has(modRole) || isAdmin; // isMod includes isAdmin
    // Gamelog roles
    const isHost = member?.roles?.cache.has(gamelogUserRole) || member?.roles?.cache.has(headHostRole);


    // --- COMMAND LOGIC ---
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            // Reply if possible
            if (interaction.isRepliable()) {
               await interaction.reply({ content: 'Command not found.', ephemeral: true }).catch(console.error);
            }
            return;
        }

        const cmdName = interaction.commandName;
        let permissionDenied = false;

        // **CRITICAL FIX: Universal Admin Bypass**
        // If the member has the top-level Administrator permission, skip all role-based checks.
        if (!member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            // 2. PERMISSION CHECKS (for Non-Admins/Non-Administrator Users)

            // /poll result requires moderation permissions
            if (cmdName === 'poll') {
                const subcommand = interaction.options.getSubcommand(false); // false to not throw error if missing
                if (subcommand === 'result' && !isMod) {
                     permissionDenied = true;
                }
            }

            // Lock/Unlock: Only lead mod
            else if (['lock', 'unlock'].includes(cmdName) && !isLeadMod) {
                 permissionDenied = true;
            }

            // Announce/Poll (create): Only mod
            // Note: poll create doesn't inherently need mod, adjust if needed
            else if (['announce'].includes(cmdName) && !isMod) {
                 permissionDenied = true;
            }
             // Allow anyone to create a poll, unless you want mods only
             else if (cmdName === 'poll' && interaction.options.getSubcommand(false) === 'create' /* && !isMod */ ) {
                 // permissionDenied = true; // Uncomment if mods only should create polls
             }


            // MODERATION, GIVEAWAY (leadmod/mod)
            else if (['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser', 'reroll', 'claimticket'].includes(cmdName)) {
                if (!isMod) {
                     permissionDenied = true;
                }
            }

            // Gamelog
            else if (cmdName === 'gamelog' && !isHost) {
                 permissionDenied = true;
            }

            // Currency Manager checks
            else if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'addxp', 'removexp', 'addcoins', 'removecoins'].includes(cmdName) && !member?.roles?.cache.has(cookiesManagerRole)) {
                permissionDenied = true;
            }

            // Quicksetup / High-Level Admin Commands (Forgotten One / Overseer)
            // ADDED dbstatus
            else if (['quicksetup', 'resetdailystreak', 'dbstatus'].includes(cmdName) && !isAdmin) {
                 permissionDenied = true;
            }
        }

        // 3. APPLY DENIAL
        if (permissionDenied) {
            // Check which denial message to use based on the failed command category
            const currencyCommands = ['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'addxp', 'removexp', 'addcoins', 'removecoins'];
            const hostCommands = ['gamelog'];
            const announceCommands = ['announce' /*,'poll'*/ ]; // Adjust poll if needed
            const lockCommands = ['lock', 'unlock'];
            // ADDED dbstatus
            const adminCommands = ['quicksetup', 'resetdailystreak', 'dbstatus'];
            const modCommands = ['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser', 'reroll', 'claimticket', 'poll result']; // Added claimticket and poll result context

            let denialMessage = '🛡️ You do not have permission to use this command.'; // Default

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


            // Ensure interaction is repliable before replying
             if (interaction.isRepliable()) {
                 return interaction.reply({ content: denialMessage, ephemeral: true }).catch(console.error);
             } else {
                 console.log(`Permission denied for ${interaction.user.tag} on command ${cmdName}, but interaction was not repliable.`);
                 return;
             }
        }

        // 4. COOLDOWN CHECK (applies to everyone)
        // Ensure cooldowns collection exists
         if (!client.cooldowns) client.cooldowns = new Collection();

        const now = Date.now();
        const cooldownAmount = (command.cooldown || 3) * 1000; // Default 3 seconds

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
            // Pass logModerationAction and potentially settings if needed by commands
            await command.execute(interaction, client, logModerationAction);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);

            // Error Handling
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

         // Check if interaction is still valid before proceeding
         if (!interaction.channel || !interaction.guild) {
             console.log("Button interaction in invalid context (no channel/guild).");
             return;
         }

         // 1. /work apply button handling
         if (customId.startsWith('job_apply_')) {
             try {
                 await interaction.deferReply({ ephemeral: true }); // Acknowledge the click quickly

                 const jobId = customId.split('_')[2];
                 let user = await User.findOne({ userId: interaction.user.id });

                 if (!user) {
                      // Attempt to create user if not found
                      user = new User({ userId: interaction.user.id });
                      await user.save();
                      // return interaction.editReply({ content: '❌ Error: User data not found. Please try /profile first.' });
                 }


                 const workProgression = client.config.workProgression.sort((a, b) => a.minWorks - b.minWorks);
                 const newJob = workProgression.find(job => job.id === jobId);

                 if (!newJob) {
                     return interaction.editReply({ content: '❌ Error: Invalid job selected.' });
                 }

                 // Eligibility Check: Must be the next sequential job OR starting job AND meets work requirement.
                  const currentIndex = user.currentJob ? workProgression.findIndex(j => j.id === user.currentJob) : -1;
                  const newJobIndex = workProgression.findIndex(j => j.id === jobId);

                  const isEligible =
                      (currentIndex === -1 && newJobIndex === 0) || // Applying for the first job (Intern)
                      (currentIndex !== -1 && newJobIndex === currentIndex + 1 && user.successfulWorks >= newJob.minWorks); // Applying for the next sequential job


                 if (!isEligible) {
                     return interaction.editReply({ content: "❌ **Error:** You are not currently eligible for this position. You might need more successful works, or you tried to skip a tier. Check \`/work apply\` again." });
                 }

                 // Apply Logic
                 user.currentJob = jobId;
                 user.lastResigned = null; // Clear resignation cooldown
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
              // Re-check permissions here specific to the button action
             const buttonIsMod = member?.roles?.cache.has(leadModRole) || member?.roles?.cache.has(modRole) || isAdmin || member?.permissions.has(PermissionsBitField.Flags.Administrator);

             if (!buttonIsMod) {
                 // Use deferUpdate for permission errors on buttons if no reply is needed, or ephemeral reply
                 // await interaction.deferUpdate(); // Just dismisses the loading state
                 return interaction.reply({ content: '❌ You do not have permission to manually end this poll.', ephemeral: true }).catch(console.error);
             }


             try {
                 await interaction.deferReply({ ephemeral: true }); // Defer ephemerally for the confirmation message

                 const pollCommand = client.commands.get('poll');
                 if (!pollCommand || !pollCommand.endPoll) {
                     return interaction.editReply({ content: '❌ Poll management function not found.' });
                 }

                 // Ensure message exists before trying to end poll
                  if (!interaction.message) {
                      return interaction.editReply({ content: '❌ Error: Could not find the poll message associated with this button.' });
                  }


                 // The poll message ID is the interaction's message ID
                 // Pass the interaction itself to endPoll for potential replies/edits
                 await pollCommand.endPoll(interaction.channel, interaction.message.id, client, interaction, true); // Pass interaction
                 // endPoll sends public results; we just confirm ephemerally
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
                  // Check if the button interaction user is the one who owns the reminder
                 const reminderId = customId.split('_')[2];
                 let user = await User.findOne({ userId: interaction.user.id }); // Fetch user who clicked

                 if (!user || !user.reminders.some(r => r._id.toString() === reminderId)) {
                     // If the user doesn't own this reminder, just update ephemerally
                     return interaction.reply({ content: '❌ This is not your reminder or it no longer exists.', ephemeral: true }).catch(console.error);
                 }


                 // Defer ephemerally since only the user needs confirmation
                  await interaction.deferReply({ ephemeral: true });


                 const initialCount = user.reminders.length;
                 // Filter out the reminder to remove
                 user.reminders = user.reminders.filter(r => r._id.toString() !== reminderId);
                 await user.save();

                 if (initialCount === user.reminders.length) {
                     // Should not happen if the check above worked, but good safeguard
                     return interaction.editReply({ content: '❌ Error: Reminder not found or already removed.' });
                 }

                 // Clear the corresponding timeout in memory
                 const timeout = client.reminders ? client.reminders.get(reminderId) : null;
                 if (timeout) {
                     clearTimeout(timeout);
                     client.reminders.delete(reminderId);
                 }

                 // Remove buttons from the original message and confirm removal
                 try {
                     await interaction.message.edit({ components: [] }); // Remove buttons from the original /reminders view message
                 } catch (editError) {
                      console.error("Could not edit original reminder message (maybe deleted?):", editError);
                      // Don't fail the whole operation if editing the original message fails
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
         // =================================================================
         // START: TICKET CREATION FIX
         // ========================================================
