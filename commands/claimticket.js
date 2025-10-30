// commands/claimticket.js (FIXED - Added Channel Renaming)
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
                    [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles?.cache.has(roleId));
    const isMod = isAdmin || [config.roles.leadMod, config.roles.mod].some(roleId => member.roles?.cache.has(roleId));

    const tempRoleId = '1433118039275999232'; // Make sure this ID is correct
    const hasTempAccess = member.roles?.cache.has(tempRoleId);

    if (!isMod && !hasTempAccess) { 
         return message.reply('🛡️ You need Moderator permissions or temporary access to use this command.');
    }

    // --- Rest of the command logic ---
    const ticket = await Ticket.findOne({ channelId: message.channel.id });
    if (!ticket) return message.reply({ content: 'This is not a ticket channel.' });
    if (ticket.status === 'claimed') return message.reply({ content: `This ticket is already claimed by <@${ticket.claimedBy}>.` });
    if (ticket.status === 'closed') return message.reply({ content: 'This ticket is already closed.' });

    // --- SAVE CLAIM STATUS ---
    ticket.status = 'claimed'; 
    ticket.claimedBy = message.author.id; 
    await ticket.save();
    
    // --- RENAME CHANNEL ---
    try {
        const moderatorName = message.author.username;
        // Sanitize name: lowercase, replace invalid chars with '-', limit length
        const sanitizedName = moderatorName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 50);
        const newChannelName = `claimed-${sanitizedName}-${ticket.ticketId}`;
        
        await message.channel.setName(newChannelName, `Claimed by ${message.author.tag}`);
        console.log(`[Ticket Claim] Renamed channel ${message.channel.id} to ${newChannelName}`);
    } catch (renameError) {
        console.error(`[Ticket Claim] Failed to rename channel ${message.channel.id}:`, renameError);
        message.channel.send(`⚠️ Couldn't automatically rename the channel. Please check my 'Manage Channels' permission.`).catch(console.error);
    }
    // --- END RENAME ---

    // --- Send Confirmation Embed ---
    const embed = new EmbedBuilder().setTitle('Ticket Claimed').setDescription(`This ticket has been claimed by ${message.author}.`).setColor(0x00FF00).setTimestamp();
    await message.channel.send({ embeds: [embed] });

    // --- Log Action ---
    const settings = await Settings.findOne({ guildId: message.guild.id });
    if (settings && settings.modlogChannelId) await logModerationAction(message.guild, settings, 'Ticket Claimed', message.author, message.author, `Ticket #${ticket.ticketId} claimed`);
  },
};
