// commands/claimticket.js (FIXED - No DB, Moderator Name Channel, Topic Update)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
// REMOVED: const Ticket = require('../models/Ticket');
const Settings = require('../models/Settings');
const { logModerationAction } = require('../utils/logModerationAction');

module.exports = {
  name: 'claimticket',
  description: 'Claim the current ticket channel.',
  aliases: ['claim'],
  async execute(message, args, client) {
    // Permission Check
    const config = client.config;
    const member = message.member;
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles?.cache.has(roleId));
    const isMod = isAdmin || [config.roles.leadMod, config.roles.mod].some(roleId => member.roles?.cache.has(roleId));

    const tempRoleId = '1433118039275999232';
    const hasTempAccess = member.roles?.cache.has(tempRoleId);

    if (!isMod && !hasTempAccess) {
         return message.reply('🛡️ You need Moderator permissions or temporary access to use this command.');
    }

    // --- Check Channel Topic for Ticket Status ---
    const channel = message.channel;
    const topic = channel.topic || '';

    if (!topic.startsWith('Ticket created by')) {
        return message.reply({ content: 'This does not appear to be an active ticket channel (invalid topic).' });
    }
    if (topic.includes('| Claimed by:')) {
        // Extract existing claimer if possible
        const claimerMatch = topic.match(/Claimed by: (.*?) \(/);
        const claimedByName = claimerMatch ? claimerMatch[1] : 'another moderator';
        return message.reply({ content: `This ticket is already claimed by ${claimedByName}.` });
    }
    if (topic.includes('| Closed by:')) {
        return message.reply({ content: 'This ticket is already closed.' });
    }
    // --- End Topic Check ---

    // --- REMOVED DB Updates ---

    // --- RENAME CHANNEL to Moderator Name ---
    try {
        const moderatorName = message.author.username;
        // Sanitize name: lowercase, replace invalid chars with '-', limit length
        const sanitizedName = moderatorName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 80) || 'claimed-ticket';
        const newChannelName = `${sanitizedName}`; // Just the sanitized name

        await channel.setName(newChannelName, `Claimed by ${message.author.tag}`);
        console.log(`[Ticket Claim] Renamed channel ${channel.id} to ${newChannelName}`);
    } catch (renameError) {
        console.error(`[Ticket Claim] Failed to rename channel ${channel.id}:`, renameError);
        message.channel.send(`⚠️ Couldn't automatically rename the channel. Please check my 'Manage Channels' permission.`).catch(console.error);
    }
    // --- END RENAME ---

    // --- UPDATE TOPIC ---
    try {
        const newTopic = `${topic} | Claimed by: ${message.author.tag} (${message.author.id})`;
        await channel.setTopic(newTopic.substring(0, 1024)); // Max topic length is 1024
    } catch (topicError) {
         console.error("Could not update topic on claim:", topicError);
         message.channel.send(`⚠️ Couldn't update the channel topic.`).catch(console.error);
    }
    // --- END TOPIC UPDATE ---

    // --- Send Confirmation Embed ---
    const embed = new EmbedBuilder().setTitle('Ticket Claimed').setDescription(`This ticket has been claimed by ${message.author}.`).setColor(0x00FF00).setTimestamp();
    await message.channel.send({ embeds: [embed] });

    // --- Log Action ---
    const settings = await Settings.findOne({ guildId: message.guild.id });
    if (settings && settings.modlogChannelId) await logModerationAction(message.guild, settings, 'Ticket Claimed', message.author, message.author, `Ticket in #${channel.name} claimed`);
  },
};
