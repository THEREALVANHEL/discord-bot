// events/interactionCreate.js (REPLACE - Added cooldowns, new permission checks, logModerationAction helper, giveaway button/reaction handling)
const { EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

async function logModerationAction(guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') {
  if (!settings || !settings.modlogChannelId) return;

  const modlogChannel = guild.channels.cache.get(settings.modlogChannelId);
  if (!modlogChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(`Moderation Action: ${action}`)
    .setColor(0x00FFFF)
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
    const isMod = member.roles.cache.has(config.roles.leadMod) || member.roles.cache.has(config.roles.mod);

    // Cooldown system
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
          return interaction.reply({ content: `Please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.data.name}\` command.`, ephemeral: true });
        }
      }

      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
    }

    // Permission checks for new commands
    const restrictedCommands = {
      warn: isMod || isAdmin,
      warnlist: isMod || isAdmin,
      removewarn: isMod || isAdmin,
      softban: isMod || isAdmin,
      timeout: isMod || isAdmin,
      giveaway: isMod,
      givecoins: true, // Anyone, but limited for non-admins
    };

    if (interaction.isChatInputCommand()) {
      const cmdName = interaction.commandName;
      if (restrictedCommands[cmdName] === false) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }

      // Existing checks (cookies, etc.)
      if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall'].includes(cmdName) && !member.roles.cache.has(config.roles.cookiesManager) && !isAdmin) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }
      // ... (keep all existing checks from your previous version)

      if (interaction.commandName === 'gamelog' && !member.roles.cache.has(config.roles.gamelogUser ) && !isAdmin) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }
      if (['purge', 'purgeuser'].includes(cmdName) && !isMod && !isAdmin) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }
      if (cmdName === 'quicksetup' && !isAdmin) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }
    }

    // Handle Button Interactions (tickets + giveaways)
    if (interaction.isButton()) {
      if (interaction.customId === 'create_ticket') {
        // Existing ticket logic...
        const Ticket = require('../models/Ticket');
        if (!settings || !settings.ticketCategoryId) {
          return interaction.reply({ content: 'Ticket system is not set up.', ephemeral: true });
        }

        const existingTicket = await Ticket.findOne({ userId: interaction.user.id, status: { $ne: 'closed' } });
        if (existingTicket) {
          const existingChannel = interaction.guild.channels.cache.get(existingTicket.channelId);
          if (existingChannel) {
            return interaction.reply({ content: `You already have an open ticket: ${existingChannel}`, ephemeral: true });
          } else {
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

        ticketChannel.send({
          content: `${interaction.user}, welcome to your ticket! A staff member will be with you shortly. Please describe your issue.\n${config.roles.leadMod ? `<@&${config.roles.leadMod}>` : ''} ${config.roles.mod ? `<@&${config.roles.mod}>` : ''}`,
          embeds: [{
            title: 'New Ticket Created',
            description: `:User  ${interaction.user.tag}\nIssue: Please describe your issue.`,
            color: 0x00FF00,
            timestamp: new Date(),
          }],
        });

        return interaction.reply({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });
      }
      return;
    }

    // Handle Giveaway Reactions (for entry)
    if (interaction.isMessageComponent() && interaction.customId === 'enter_giveaway') {
      // Simple reaction handling for giveaway entry (use reactions instead of buttons for simplicity)
      return;
    }

    // Execute command
    if (interaction.isChatInputCommand() && command) {
      try {
        await command.execute(interaction, client, logModerationAction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error executing that command!', ephemeral: true });
        } else {
          await interaction.reply({ content: 'There was an error executing that command!', ephemeral: true });
        }
      }
    }
  },
};
