// commands/lock.js (FIXED - Handles no duration argument)
const { EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const ms = require('ms');
const Settings = require('../models/Settings'); // Required for logging
const { logModerationAction } = require('../utils/logModerationAction'); // Required for logging

// --- FIX: Target your specific role ID ---
const TARGET_ROLE_ID = '1384141744303636610';
// --- END FIX ---

module.exports = {
    name: 'lock',
    description: 'Lock a channel (deny sending messages for @everyone).',
    aliases: ['lockdown'],
    async execute(message, args, client) {
        // 1. Permission Check
        const config = client.config;
        const member = message.member;
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                        [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles.cache.has(roleId));
        const canLock = isAdmin || member.roles.cache.has(config.roles.leadMod) || member.permissions.has(PermissionsBitField.Flags.ManageChannels);

        if (!canLock) {
            return message.reply('🔒 You need the Lead Moderator role or `Manage Channels` permission to use this command.');
        }

        // 2. Determine Target Channel
        let targetChannel = message.mentions.channels.first();
        let durationStr = null;
        let reasonArgs = [...args]; // Copy args

        if (targetChannel) {
            reasonArgs = args.filter(arg => !arg.startsWith('<#') && !arg.endsWith('>'));
        } else {
            targetChannel = message.channel;
        }

        if (!targetChannel.isTextBased() || targetChannel.isThread()) {
             return message.reply('❌ This command can only be used in regular text channels.');
        }

        // 3. Parse Optional Duration (Check if first arg exists *before* parsing)
        // --- FIX STARTS HERE ---
        if (reasonArgs.length > 0) { // Only try parsing if there's at least one argument left
            const potentialDuration = reasonArgs[0];
            const durationMs = ms(potentialDuration); // Parse the first argument

            // Check if it's a valid duration recognized by ms() AND meets minimum time
            if (durationMs && durationMs >= 5000) { // Min 5s
                durationStr = potentialDuration;
                reasonArgs.shift(); // Remove duration from reason args
            } else if (ms(potentialDuration) && durationMs < 5000) {
                 // It looked like a duration (ms didn't return undefined/NaN), but it was too short
                 return message.reply('❌ Duration too short (min 5s). Use e.g., 10m, 1h.');
            }
        }
        // --- FIX ENDS HERE ---

        const reason = reasonArgs.join(' ') || 'No reason provided';

        // 4. Check Bot Permissions
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
        if (!targetChannel.permissionsFor(botMember).has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply(`❌ I need "Manage Channels" permission in ${targetChannel} to lock/unlock it.`);
        }
        
        // --- FIX: Check if target role exists ---
        const targetRole = message.guild.roles.cache.get(TARGET_ROLE_ID);
        if (!targetRole) {
            return message.reply(`❌ Error: The target role (ID: ${TARGET_ROLE_ID}) was not found.`);
        }
        // --- END FIX ---


        // 5. Apply Lock
        try {
            await targetChannel.permissionOverwrites.edit(targetRole, {
                SendMessages: false,
                AddReactions: false,
            });

            let endTime = null;
            let durationMsg = '🔒 **permanently**';
            let timeoutId = null; // Store timeout ID for this specific lock instance

            if (durationStr) {
                const durationMsValid = ms(durationStr); // Re-parse here to be safe, already validated >= 5000
                endTime = Date.now() + durationMsValid;
                durationMsg = `for **${durationStr}** (until <t:${Math.floor(endTime / 1000)}:R>)`;

                timeoutId = setTimeout(async () => {
                    const lockInfo = client.locks.get(targetChannel.id);
                    // Ensure the lock hasn't been manually cleared AND this is the correct timer
                    if (lockInfo && lockInfo.timeoutId === timeoutId) {
                        try {
                            const currentChannel = await client.channels.fetch(targetChannel.id).catch(() => null);
                            // --- FIX: Check permissions for the specific role ID ---
                            if (currentChannel && currentChannel.permissionOverwrites.cache.get(TARGET_ROLE_ID)?.deny.has(PermissionsBitField.Flags.SendMessages)) {
                                await currentChannel.permissionOverwrites.edit(targetRole, {
                                    SendMessages: null, AddReactions: null,
                                });
                            // --- END FIX ---
                                console.log(`Auto-unlocked channel ${targetChannel.name} (${targetChannel.id})`);
                                const unlockEmbed = new EmbedBuilder().setTitle('🔓 Channel Auto-Unlocked').setDescription(`${currentChannel} unlocked as lock duration expired.`).setColor(0x00FF00).setTimestamp();
                                await currentChannel.send({ embeds: [unlockEmbed] }).catch(console.error);
                                const settings = await Settings.findOne({ guildId: message.guild.id });
                                if (settings && settings.modlogChannelId) {
                                    await logModerationAction(message.guild, settings, 'Channel Auto-Unlock', currentChannel, client.user, `Lock duration expired (${durationStr})`);
                                }
                            }
                        } catch (e) {
                            console.error(`Auto-unlock error for ${targetChannel.id}:`, e);
                            try { await targetChannel.send(`⚠️ Error during auto-unlock. Permissions might need manual reset.`).catch(()=>{}); } catch {}
                        } finally {
                            client.locks.delete(targetChannel.id);
                        }
                    } else {
                        console.log(`Skipping expired timeout for ${targetChannel.id}, lock likely removed manually or changed.`);
                    }
                }, durationMsValid);

                client.locks.set(targetChannel.id, { endTime, reason, timeoutId, moderatorId: message.author.id });

            } else {
                 const existingLock = client.locks.get(targetChannel.id);
                 if (existingLock?.timeoutId) {
                     clearTimeout(existingLock.timeoutId);
                 }
                 client.locks.set(targetChannel.id, { endTime: null, reason, timeoutId: null, moderatorId: message.author.id });
            }

            const lockEmbed = new EmbedBuilder().setTitle('🔒 Channel Locked').setDescription(`${targetChannel} has been locked ${durationMsg}.`).addFields({ name: 'Reason', value: reason }).setColor(0xFF0000).setTimestamp().setFooter({ text: `Locked by ${message.author.tag}` });
            await message.channel.send({ embeds: [lockEmbed] }); // Send confirmation in the channel where command was used

            // Log
            const settings = await Settings.findOne({ guildId: message.guild.id });
            if (settings && settings.modlogChannelId) {
                await logModerationAction(message.guild, settings, 'Channel Lock', targetChannel, message.author, reason, durationStr ? `Duration: ${durationStr}` : 'Permanent');
            }

        } catch (error) {
            console.error('Lock error:', error);
            message.reply(`❌ Failed to lock ${targetChannel}. Check permissions. Error: ${error.message}`);
        }
    },
};
