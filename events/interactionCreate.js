// MultipleFiles/interactionCreate.js
const Settings = require('../models/Settings');
const { EmbedBuilder } = require('discord.js');

async function logModerationAction(guild, settings, action, target, moderator, reason = 'No reason provided') {
  if (!settings || !settings.modlogChannelId) return;

  const modlogChannel = guild.channels.cache.get(settings.modlogChannelId);
  if (!modlogChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(`Moderation Action: ${action}`)
    .setColor(0x00FFFF) // Cyan color for mod logs
    .addFields(
      { name: 'Target', value: `${target.tag} (${target.id})` },
      { name: 'Moderator', value: `${moderator.tag} (${moderator.id})` },
      { name: 'Reason', value: reason },
    )
    .setTimestamp();

  modlogChannel.send({ embeds: [embed] });
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return; // Handle buttons for tickets

    const member = interaction.member;
    const config = client.config;
    const settings = await Settings.findOne({ guildId: interaction.guild.id });

    // Admin roles
    const isAdmin = member.roles.cache.has(config.roles.forgottenOne) || member.roles.cache.has(config.roles.overseer);

    // Cookies manager role
    const isCookiesManager = member.roles.cache.has(config.roles.cookiesManager);

    // Lead mod or mod roles
    const isMod = member.roles.cache.has(config.roles.leadMod) || member.roles.cache.has(config.roles.mod);

    // --- Handle Button Interactions (for tickets) ---
    if (interaction.isButton()) {
      if (interaction.customId === 'create_ticket') {
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
            // If channel is gone, remove the ticket from DB
            await Ticket.deleteOne({ _id: existingTicket._id });
          }
        }

        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: 0, // GuildText
          parent: settings.ticketCategoryId,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: ['ViewChannel'],
            },
            {
              id: interaction.user.id,
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
            },
            {
              id: config.roles.leadMod,
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
            },
            {
              id: config.roles.mod,
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
            },
          ],
        });

        const newTicket = new Ticket({
          ticketId: ticketChannel.id,
          userId: interaction.user.id,
          channelId: ticketChannel.id,
        });
        await newTicket.save();

        ticketChannel.send({
          content: `${interaction.user}, welcome to your ticket! A staff member will be with you shortly. Please describe your issue.
          ${config.roles.leadMod ? `<@&${config.roles.leadMod}>` : ''} ${config.roles.mod ? `<@&${config.roles.mod}>` : ''}`,
          embeds: [{
            title: 'New Ticket Created',
            description: `User: ${interaction.user.tag}\nIssue: Please describe your issue.`,
            color: 0x00FF00,
            timestamp: new Date(),
          }],
        });

        return interaction.reply({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });
      }
      return; // Exit if it's a button interaction not handled here
    }

    // --- Handle Chat Input Commands ---
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // Restrict commands based on roles
    if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall'].includes(interaction.commandName) && !isCookiesManager && !isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    if (['claimticket', 'closeticket'].includes(interaction.commandName) && !isMod && !isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    if (['addxp', 'removexp', 'addcoins', 'removecoins'].includes(interaction.commandName) && !isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    if (interaction.commandName === 'gamelog' && !member.roles.cache.has(config.roles.gamelogUser) && !isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    if (['purge', 'purgeuser'].includes(interaction.commandName)) {
      if (!isMod && !isAdmin) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }
    }

    if (interaction.commandName === 'quicksetup' && !isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    try {
      await command.execute(interaction, client, logModerationAction); // Pass log function
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error executing that command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error executing that command!', ephemeral: true });
      }
    }
  },
};
