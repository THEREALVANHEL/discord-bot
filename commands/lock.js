// commands/lock.js (Converted to Prefix Command)
const { EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const ms = require('ms');
const Settings = require('../models/Settings'); // Required for logging
const { logModerationAction } = require('../utils/logModerationAction'); // Required for logging

module.exports = {
    name: 'lock',
    description: 'Lock a channel (deny sending messages for @everyone).',
    aliases: ['lockdown'],
    async execute(message, args, client) {
        // 1. Permission Check (Manage Channels or Lead Mod/Admin roles)
        const config = client.config;
        const member = message.member;
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                        [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles.cache.has(roleId));
        // Allow Lead Mods or users with Manage Channels permission
        const canLock = isAdmin || member.roles.cache.has(config.roles.leadMod) || member.permissions.has(PermissionsBitField.Flags.ManageChannels);


        // Check for Temp Mod Access Role - LOCK MIGHT BE TOO SENSITIVE FOR TEMP ROLE - uncomment if allowed
        // const tempRole = message.guild.roles.cache.find(role => role.name === 'TempModAccess');
        // const hasTempAccess = tempRole && member.roles.cache.has(tempRole.id);
        // if (!canLock && !hasTempAccess) {


        if (!canLock) {
            return message.reply('🔒 You need the Lead Moderator role or `Manage Channels` permission to use this command.');
        }


        // 2. Determine Target Channel
        let targetChannel = message.mentions.channels.first();
        let durationStr = null;
        let reasonArgs = [...args]; // Copy args for reason processing

        if (targetChannel) {
            reasonArgs = args.filter(arg => !arg.startsWith('<#') && !arg.endsWith('>')); // Remove channel mention
        } else {
            targetChannel = message.channel; // Default to current channel
        }

         // Check if the channel is a valid text-based channel
         if (!targetChannel.isTextBased() || targetChannel.isThread()) {
             return message.reply('❌ This command can only be used in regular text channels.');
         }


        // 3. Parse Optional Duration (must be the first arg *after* potential channel mention)
        const potentialDuration = reasonArgs[0];
        const durationMs = ms(potentialDuration);
        if (durationMs && durationMs >= 5000) { // Valid duration found (min 5s)
            durationStr = potentialDuration;
            reasonArgs.shift(); // Remove duration from reason args
        } else if (ms(potentialDuration) && durationMs < 5000) {
            return message.reply('❌ Duration too short (min 5s). Use e.g., 10m, 1h.');
        }
        // If the first arg wasn't a valid duration > 5s, assume it's part of the reason

        const reason = reasonArgs.join(' ') || 'No reason provided';

        // 4. Check Bot Permissions
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
        if (!targetChannel.permissionsFor(botMember).has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply(`❌ I need "Manage Channels" permission in ${targetChannel} to lock/unlock it.`);
        }

        // 5. Apply Lock
        try {
            await targetChannel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: false,
                AddReactions: false, // Optionally lock reactions too
            });

            let endTime = null;
            let durationMsg = '🔒 **permanently**';
            let timeoutId = null;

            if (durationStr) {
                // We already validated durationMs >= 5000
                endTime = Date.now() + durationMs;
                durationMsg = `for **${durationStr}** (until <t:${Math.floor(endTime / 1000)}:R>)`;

                // Auto-unlock
                timeoutId = setTimeout(async () => {
                    const lockInfo = client.locks.get(targetChannel.id);
                     // Check if this specific lock timer should still run (wasn't manually unlocked)
                     if (lockInfo && lockInfo.timeoutId === timeoutId) {
                        try {
                            const currentChannel = await client.channels.fetch(targetChannel.id).catch(() => null);
                            if (currentChannel && currentChannel.permissionOverwrites.cache.get(message.guild.roles.everyone.id)?.deny.has(PermissionsBitField.Flags.SendMessages)) { // Check if still locked
                                await currentChannel.permissionOverwrites.edit(message.guild.roles.everyone, {
                                    SendMessages: null, // Reset
                                    AddReactions: null,
                                });
                                console.log(`Auto-unlocked channel ${targetChannel.name} (${targetChannel.id})`);

                                 const unlockEmbed = new EmbedBuilder()
                                    .setTitle('🔓 Channel Auto-Unlocked')
                                    .setDescription(`${currentChannel} is now unlocked as the lock duration expired.`)
                                    .setColor(0x00FF00)
                                    .setTimestamp();
                                 await currentChannel.send({ embeds: [unlockEmbed] }).catch(console.error);

                                 // Log auto-unlock
                                 const settings = await Settings.findOne({ guildId: message.guild.id });
                                 if (settings && settings.modlogChannelId) {
                                     await logModerationAction(message.guild, settings, 'Channel Auto-Unlock', currentChannel, client.user, `Lock duration expired (${durationStr})`);
                                 }
                            }
                        } catch (e) {
                            console.error(`Auto-unlock error for ${targetChannel.id}:`, e);
                            try { await targetChannel.send(`⚠️ Error during auto-unlock. Permissions might need manual reset.`).catch(()=>{}); } catch {}
                        } finally {
                            client.locks.delete(targetChannel.id); // Remove from map
                        }
                    } else {
                         console.log(`Skipping expired timeout for ${targetChannel.id}, lock likely removed manually.`);
                    }
                }, durationMs);

                // Store lock info
                client.locks.set(targetChannel.id, { endTime, reason, timeoutId, moderatorId: message.author.id });

            } else {
                 // Permanent lock, clear any existing timer for this channel
                 const existingLock = client.locks.get(targetChannel.id);
                 if (existingLock?.timeoutId) {
                     clearTimeout(existingLock.timeoutId);
                 }
                 client.locks.set(targetChannel.id, { endTime: null, reason, timeoutId: null, moderatorId: message.author.id });
            }


            const lockEmbed = new EmbedBuilder()
                .setTitle('🔒 Channel Locked')
                .setDescription(`${targetChannel} has been locked ${durationMsg}.`)
                .addFields({ name: 'Reason', value: reason })
                .setColor(0xFF0000)
                .setTimestamp()
                .setFooter({ text: `Locked by ${message.author.tag}` });

            await message.channel.send({ embeds: [lockEmbed] });

            // Log
            const settings = await Settings.findOne({ guildId: message.guild.id });
            if (settings && settings.modlogChannelId) {
                await logModerationAction(message.guild, settings, 'Channel Lock', targetChannel, message.author, reason, durationStr ? `Duration: ${durationStr}` : 'Permanent');
            }

        } catch (error) {
            console.error('Lock error:', error);
            message.reply(`❌ Failed to lock ${targetChannel}. Check permissions.`);
        }
    },
};
