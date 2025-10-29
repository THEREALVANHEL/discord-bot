// commands/unlock.js (Converted to Prefix Command)
const { EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const Settings = require('../models/Settings'); // Required for logging
const { logModerationAction } = require('../utils/logModerationAction'); // Required for logging


module.exports = {
    name: 'unlock',
    description: 'Unlock a channel (restore permissions for @everyone).',
    aliases: ['unlockdown'],
    async execute(message, args, client) {
         // 1. Permission Check (Manage Channels or Lead Mod/Admin roles)
        const config = client.config;
        const member = message.member;
         const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                        [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles.cache.has(roleId));
         const canUnlock = isAdmin || member.roles.cache.has(config.roles.leadMod) || member.permissions.has(PermissionsBitField.Flags.ManageChannels);


        // Check for Temp Mod Access Role - UNLOCK MIGHT BE TOO SENSITIVE FOR TEMP ROLE - uncomment if allowed
        // const tempRole = message.guild.roles.cache.find(role => role.name === 'TempModAccess');
        // const hasTempAccess = tempRole && member.roles.cache.has(tempRole.id);
        // if (!canUnlock && !hasTempAccess) {


        if (!canUnlock) {
             return message.reply('🔓 You need the Lead Moderator role or `Manage Channels` permission to use this command.');
        }

        // 2. Determine Target Channel
        let targetChannel = message.mentions.channels.first();
        if (!targetChannel && args.length > 0) {
            // Try fetching by ID if no mention but arg exists
            targetChannel = await message.guild.channels.fetch(args[0]).catch(() => null);
        }
        if (!targetChannel) {
             targetChannel = message.channel; // Default to current
        }

         // Check if the channel is a valid text-based channel
         if (!targetChannel.isTextBased() || targetChannel.isThread()) {
             return message.reply('❌ This command can only be used in regular text channels.');
         }

        // 3. Check Bot Permissions
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
        if (!targetChannel.permissionsFor(botMember).has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply(`❌ I need "Manage Channels" permission in ${targetChannel} to unlock it.`);
        }

        // 4. Apply Unlock
        try {
            const currentOverwrites = targetChannel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);
            // Check if it's actually locked by the bot's standard lock method
             if (!currentOverwrites || !currentOverwrites.deny.has(PermissionsBitField.Flags.SendMessages)) {
                 // It might be locked differently, or not locked at all for @everyone
                 // Still attempt the unlock, but warn the user
                 message.channel.send(`⚠️ Channel ${targetChannel} might not be locked in the standard way (or is already unlocked). Attempting unlock...`).catch(console.error);
             }


            await targetChannel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: null, // Reset to default/inherit
                AddReactions: null, // Also reset reactions
            });

            // Clear any active timer associated with this channel lock
            const lockInfo = client.locks.get(targetChannel.id);
            if (lockInfo && lockInfo.timeoutId) {
                clearTimeout(lockInfo.timeoutId);
                console.log(`Cleared auto-unlock timer for ${targetChannel.name} due to manual unlock.`);
            }
            client.locks.delete(targetChannel.id); // Remove from map


            const unlockEmbed = new EmbedBuilder()
                .setTitle('🔓 Channel Unlocked')
                .setDescription(`${targetChannel} has been unlocked by ${message.author}.`)
                .setColor(0x00FF00)
                .setTimestamp()
                .setFooter({ text: `Unlocked by ${message.author.tag}` });

            await message.channel.send({ embeds: [unlockEmbed] });

            // Log
            const settings = await Settings.findOne({ guildId: message.guild.id });
             if (settings && settings.modlogChannelId) {
                await logModerationAction(message.guild, settings, 'Channel Unlock', targetChannel, message.author, 'Manual unlock');
             }

        } catch (error) {
            console.error('Unlock error:', error);
            message.reply(`❌ Failed to unlock ${targetChannel}. Check permissions.`);
        }
    },
};
