// events/interactionCreate.js (REPLACED - Added early Admin exit and simplified giveaway/moderation checks)
const { EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

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

  modlogChannel.send({ embeds: [embed] });
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isMessageComponent()) return;

    const member = interaction.member;
    const config = client.config;
    const settings = await Settings.findOne({ guildId: interaction.guild.id });
    const command = client.commands.get(interaction.commandName);

    // Safely access roles object
    const roles = config.roles || {};
    
    // Admin roles
    const isAdmin = member.roles.cache.has(roles.forgottenOne) || member.roles.cache.has(roles.overseer);
    // Mod roles
    const isLeadMod = member.roles.cache.has(roles.leadMod);
    const isMod = isLeadMod || member.roles.cache.has(roles.mod);
    // Gamelog roles
    const isHost = member.roles.cache.has(roles.gamelogUser) || member.roles.cache.has(roles.headHost);

    // --- EXECUTE COMMAND LOGIC ---
    if (interaction.isChatInputCommand() && command) {
        const cmdName = interaction.commandName;

        // NEW: 1. ADMIN BYPASS (forgottenOne & overseer have access to ALL commands)
        if (isAdmin) {
             // Skip all permission checks and go straight to cooldown and execution
        } else {
            // 2. PERMISSION CHECKS (for Non-Admins)
            
            // /poll result requires moderation permissions (Admin/LeadMod/Mod)
            if (cmdName === 'poll') {
                const subcommand = interaction.options.getSubcommand();
                if (subcommand === 'result' && !isMod) {
                  return interaction.reply({ content: '🗳️ Only moderators can manually end a poll and view results.', ephemeral: true });
                }
            }

            // Lock/Unlock: Only lead mod
            if (['lock', 'unlock'].includes(cmdName) && !isLeadMod) {
              return interaction.reply({ content: '🔒 Only lead moderators can use this command.', ephemeral: true });
            }

            // Announce/Poll: Only mod (Applies to /poll create)
            if (['announce', 'poll'].includes(cmdName) && !isMod) {
              return interaction.reply({ content: '📢 Only moderators can use this command.', ephemeral: true });
            }
            
            // MODERATION, GIVEAWAY, and CURRENCY MANAGEMENT (Mod or specific role required)
            if (['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser', 'reroll'].includes(cmdName)) {
                // FIX: Give leadmod/mod permission to giveaway/moderation commands
                if (!isMod) {
                    return interaction.reply({ content: '🛡️ You do not have permission to use this moderation command.', ephemeral: true });
                }
            }

            // Gamelog: Only host roles
            if (cmdName === 'gamelog' && !isHost) {
              return interaction.reply({ content: '🎮 Only Host roles can use this command.', ephemeral: true });
            }

            // Cookie/XP Manager checks
            if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'addxp', 'removexp', 'addcoins', 'removecoins'].includes(cmdName) && !member.roles.cache.has(roles.cookiesManager)) {
              return interaction.reply({ content: '🍪 You do not have permission to use this currency command.', ephemeral: true });
            }

            if (cmdName === 'quicksetup') {
              return interaction.reply({ content: '👑 Only Administrators can use this command.', ephemeral: true });
            }
        }
        
        // 3. COOLDOWN CHECK (applies to everyone unless cooldown is specifically ignored above)
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
                return interaction.reply({ content: `⏱️ Please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.data.name}\` command.`, ephemeral: true });
            }
        }

        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);


        // 4. EXECUTE
        try {
            await command.execute(interaction, client, logModerationAction);
        } catch (error) {
            console.error(error);
            
            // Error Handling (already wrapped in a try-catch for robustness)
            try { 
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: '❌ **Command Error:** There was an error executing that command!', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ **Command Error:** There was an error executing that command!', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Failed to send interaction error message, likely due to expired/acknowledged interaction:', replyError);
            }
        }
        return; // End of ChatInputCommand logic
    }

    // Handle Button Interactions
    if (interaction.isButton()) {
      // Handle job application
      if (interaction.customId.startsWith('job_apply_')) {
          const jobId = interaction.customId.split('_')[2];
          const User = require('../models/User');
          const workProgression = client.config.workProgression;
          const newJob = workProgression.find(job => job.id === jobId);

          let user = await User.findOne({ userId: interaction.user.id });
          if (!user) user = new User({ userId: interaction.user.id });

          if (!newJob || user.level < newJob.minLevel) {
              return interaction.reply({ content: '❌ **Error:** You are not eligible for this job or the job is invalid.', ephemeral: true });
          }

          user.currentJob = newJob.id;
          await user.save();

          await interaction.update({ 
              content: `🎉 **Application Successful!** You are now a **${newJob.title}**. Start working with \`/work work\`!`, 
              components: [] 
          });
          return;
      }
      
      // Handle poll result button (Only poll owner can end it)
      if (interaction.customId === 'poll_result_manual') {
          await interaction.deferReply({ ephemeral: true });
          const pollData = client.polls.get(interaction.message.id);
          
          if (!pollData) {
               return interaction.editReply({ content: '❌ **Error:** This poll is not tracked or has already ended.' });
          }
          
          if (pollData.creatorId !== interaction.user.id) {
              return interaction.editReply({ content: '❌ **Error:** Only the person who created this poll can manually end it.', ephemeral: true });
          }
          
          // Delegate the actual poll ending logic to the command file helper function
          const pollCommand = client.commands.get('poll');
          if (pollCommand && pollCommand.endPoll) {
               await pollCommand.endPoll(interaction.channel, interaction.message.id, client, interaction, true);
               // endPoll handles the message edit/reply, we just need to ensure the deferred reply is edited
               return interaction.editReply({ content: '✅ **Poll Ended!** Results posted.' });
          } else {
              return interaction.editReply({ content: '❌ **Error:** Poll end function not found.' });
          }
      }
      
      // Handle reminder removal
      if (interaction.customId.startsWith('remove_reminder_')) {
          const reminderId = interaction.customId.split('_')[2];
          const User = require('../models/User');

          let user = await User.findOne({ userId: interaction.user.id });
          if (user) {
              const initialCount = user.reminders.length;
              user.reminders = user.reminders.filter(r => r._id.toString() !== reminderId);

              if (user.reminders.length < initialCount) {
                  await user.save();
                  // Clear the timeout from the client map
                  const timeout = client.reminders.get(reminderId);
                  if (timeout) clearTimeout(timeout);
                  client.reminders.delete(reminderId);

                  await interaction.update({ content: '✅ **Reminder Removed!** Your reminder has been cancelled.', components: [], embeds: [] });
              } else {
                  await interaction.reply({ content: '❌ **Reminder Not Found!** This reminder may have already been removed or triggered.', ephemeral: true });
              }
          }
          return;
      }
      
      // Existing ticket logic
      if (interaction.customId === 'create_ticket') {
        // FIX: Defer the reply immediately to prevent "Unknown interaction"
        await interaction.deferReply({ ephemeral: true }); 
        
        const Ticket = require('../models/Ticket');
        if (!settings || !settings.ticketCategoryId) {
          // FIX: Use editReply after deferral
          return interaction.editReply({ content: 'Ticket system is not set up.' });
        }

        const existingTicket = await Ticket.findOne({ userId: interaction.user.id, status: { $ne: 'closed' } });
        if (existingTicket) {
          const existingChannel = interaction.guild.channels.cache.get(existingTicket.channelId);
          if (existingChannel) {
            // FIX: Use editReply after deferral
            return interaction.editReply({ content: `You already have an open ticket: ${existingChannel}` });
          } else {
            // Channel might have been deleted manually, delete DB entry
            await Ticket.deleteOne({ _id: existingTicket._id });
          }
        }

        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: 0,
          parent: settings.ticketCategoryId,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: ['ViewChannel'] },
            { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
            { id: roles.leadMod, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
            { id: roles.mod, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
          ],
        });

        const newTicket = new Ticket({
          ticketId: ticketChannel.id,
          userId: interaction.user.id,
          channelId: ticketChannel.id,
        });
        await newTicket.save();

        const ticketEmbed = new EmbedBuilder()
          .setTitle('🎫 New Support Ticket')
          .setDescription(`Thank you for creating a ticket, ${interaction.user}! A staff member will be with you shortly. Please describe your issue clearly.`)
          .addFields(
            { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})` },
            { name: 'Status', value: 'Open' }
          )
          .setColor(0x0099FF)
          .setTimestamp();
          
        const modPings = [roles.leadMod, roles.mod]
                          .filter(id => id)
                          .map(id => `<@&${id}>`).join(' ');

        ticketChannel.send({
          content: `${interaction.user} ${modPings}`,
          embeds: [ticketEmbed],
        });

        // FIX: Use editReply after deferral
        return interaction.editReply({ content: `Your ticket has been created: ${ticketChannel}` });
      }
      return;
    }

    // Since command execution logic was moved up, the fallback here is no longer necessary
  },
};
