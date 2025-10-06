// events/interactionCreate.js (REPLACED - Fixed syntax and stabilized error handling)
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

    // Admin roles
    const isAdmin = member.roles.cache.has(config.roles.forgottenOne) || member.roles.cache.has(config.roles.overseer);
    // Mod roles
    const isLeadMod = member.roles.cache.has(config.roles.leadMod);
    const isMod = isLeadMod || member.roles.cache.has(config.roles.mod);
    // Gamelog roles
    const isHost = member.roles.cache.has(config.roles.gamelogUser) || member.roles.cache.has(config.roles.headHost);

    // Cooldown system (existing)
    const command = client.commands.get(interaction.commandName);
    if (interaction.isChatInputCommand() && command) {
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
    }

    // Permission checks
    if (interaction.isChatInputCommand()) {
      const cmdName = interaction.commandName;
      
      // /poll result requires moderation permissions (Admin/LeadMod/Mod)
      if (cmdName === 'poll') {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'result' && !isMod && !isAdmin) {
          return interaction.reply({ content: '🗳️ Only moderators can manually end a poll and view results.', ephemeral: true });
        }
      }

      // Lock/Unlock: Only lead mod or admin
      if (['lock', 'unlock'].includes(cmdName) && !isLeadMod && !isAdmin) {
        return interaction.reply({ content: '🔒 Only lead moderators can use this command.', ephemeral: true });
      }

      // Announce/Poll: Only mod or admin (Applies to /poll create)
      if (['announce', 'poll'].includes(cmdName) && !isMod && !isAdmin) {
        return interaction.reply({ content: '📢 Only moderators can use this command.', ephemeral: true });
      }

      // Gamelog: Only host roles or admin
      if (cmdName === 'gamelog' && !isHost && !isAdmin) {
        return interaction.reply({ content: '🎮 Only Host roles can use this command.', ephemeral: true });
      }

      // Moderation checks (warn, softban, reroll, etc.)
      if (['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser', 'reroll'].includes(cmdName) && !isMod && !isAdmin) {
        return interaction.reply({ content: '🛡️ You do not have permission to use this moderation command.', ephemeral: true });
      }

      // Cookie/XP Manager checks
      if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'addxp', 'removexp', 'addcoins', 'removecoins'].includes(cmdName) && !member.roles.cache.has(config.roles.cookiesManager) && !isAdmin) {
        return interaction.reply({ content: '🍪 You do not have permission to use this currency command.', ephemeral: true });
      }

      if (cmdName === 'quicksetup' && !isAdmin) {
        return interaction.reply({ content: '👑 Only Administrators can use this command.', ephemeral: true });
      }
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
            { id: config.roles.leadMod, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
            { id: config.roles.mod, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
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
          
        const modPings = [config.roles.leadMod, config.roles.mod]
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

    // Execute command
    if (interaction.isChatInputCommand() && command) {
      try {
        await command.execute(interaction, client, logModerationAction);
      } catch (error) {
        console.error(error);
        
        // FIX: Wrap the error reply logic in a try-catch to prevent secondary DiscordAPIError[40060] from crashing the bot
        try { 
          if (interaction.replied || interaction.deferred) {
            // If already replied/deferred, use followUp
            await interaction.followUp({ content: '❌ **Command Error:** There was an error executing that command!', ephemeral: true });
          } else {
            // Otherwise, reply 
            await interaction.reply({ content: '❌ **Command Error:** There was an error executing that command!', ephemeral: true });
          }
        } catch (replyError) {
             // Log the error that occurred while trying to send the error message, but do not crash the bot.
             console.error('Failed to send interaction error message, likely due to expired/acknowledged interaction:', replyError);
        }
      }
    }
  },
};
