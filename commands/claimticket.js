// commands/claimticket.js (FIXED Temp Role Check)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Ticket = require('../models/Ticket');
const Settings = require('../models/Settings');
const { logModerationAction } = require('../utils/logModerationAction'); // Assuming you create this utility

module.exports = {
  name: 'claimticket',
  description: 'Claim the current ticket channel.',
  aliases: ['claim'], // Optional aliases
  async execute(message, args, client) {
    // Permission Check (Mods/Admins or Temp Access)
    const config = client.config;
    const member = message.member;
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles.cache.has(roleId));
    const isMod = isAdmin || [config.roles.leadMod, config.roles.mod].some(roleId => member.roles.cache.has(roleId));

    // --- FIXED: Check for Temp Mod Access Role ID ---
    const tempRoleId = '1433118039275999232';
    const hasTempAccess = member.roles.cache.has(tempRoleId);
    // --- End Fix ---

    if (!isMod && !hasTempAccess) { // Check if user is Mod/Admin OR has temp access
         return message.reply('🛡️ You need Moderator permissions or temporary access to use this command.');
    }

    // --- Rest of the command logic (unchanged) ---
    const ticket = await Ticket.findOne({ channelId: message.channel.id });
    if (!ticket) return message.reply({ content: 'This is not a ticket channel.' });
    if (ticket.status === 'claimed') return message.reply({ content: `This ticket is already claimed by <@${ticket.claimedBy}>.` });
    if (ticket.status === 'closed') return message.reply({ content: 'This ticket is already closed.' });

    ticket.status = 'claimed'; ticket.claimedBy = message.author.id; await ticket.save();
    const embed = new EmbedBuilder().setTitle('Ticket Claimed').setDescription(`This ticket has been claimed by ${message.author}.`).setColor(0x00FF00).setTimestamp();
    await message.channel.send({ embeds: [embed] });

    const settings = await Settings.findOne({ guildId: message.guild.id });
    if (settings && settings.modlogChannelId) await logModerationAction(message.guild, settings, 'Ticket Claimed', message.author, message.author, `Ticket #${ticket.ticketId} claimed`);
  },
};
