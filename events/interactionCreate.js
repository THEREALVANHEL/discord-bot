// events/interactionCreate.js (REPLACE - Fixed create_ticket failure by deferring interaction)
const { EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

async function logModerationAction(guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') {
// ... (logModerationAction content)
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isMessageComponent()) return;

    // ... (All previous logic and permission checks)

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

      // Moderation checks (warn, softban, etc.)
      if (['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser'].includes(cmdName) && !isMod && !isAdmin) {
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
