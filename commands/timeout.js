// commands/timeout.js (Converted to Prefix Command)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');
const Settings = require('../models/Settings');
const { findUserInGuild } = require('../utils/findUserInGuild');
const { logModerationAction } = require('../utils/logModerationAction');

module.exports = {
    name: 'timeout',
    description: 'Timeout a user for a specified duration.',
    aliases: ['mute', 'stfu'], // Example aliases
    async execute(message, args, client) {
        // 1. Permission Check
        const config = client.config;
         const member = message.member;
         const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                         [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles.cache.has(roleId));
         const isMod = isAdmin || [config.roles.leadMod, config.roles.mod].some(roleId => member.roles.cache.has(roleId)) ||
                       member.permissions.has(PermissionsBitField.Flags.ModerateMembers);

         // Check for Temp Mod Access Role
         const tempRole = message.guild.roles.cache.find(role => role.name === 'TempModAccess');
         const hasTempAccess = tempRole && member.roles.cache.has(tempRole.id);


        if (!isMod && !hasTempAccess) {
             return message.reply('🛡️ You need Moderator permissions or temporary access to use this command.');
        }

        // 2. Argument Parsing: ?timeout <user> <duration> [reason]
        if (args.length < 2) {
            return message.reply('Usage: `?timeout <@user|userID|username> <duration (e.g., 10m, 1h)> [reason]`');
        }

        const targetIdentifier = args[0];
        const durationStr = args[1];
        const reason = args.slice(2).join(' ') || 'No reason provided.';

        // 3. Find Target User/Member
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) {
            return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        }
        const target = targetMember.user;

        // 4. Basic & Hierarchy Checks
        if (targetMember.id === message.author.id) {
            return message.reply('❌ You cannot timeout yourself.');
        }
         const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
         if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
             return message.reply('❌ I do not have permission to timeout members.');
         }
         if (targetMember.roles.highest.position >= member.roles.highest.position && message.guild.ownerId !== message.author.id) {
             return message.reply('❌ You cannot timeout someone with an equal or higher role.');
         }
         if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
             return message.reply('❌ I cannot timeout someone with an equal or higher role than me.');
         }
         if (targetMember.isCommunicationDisabled()) {
             return message.reply(`❌ ${target.tag} is already timed out.`);
         }

        // 5. Parse Duration
        const durationMs = ms(durationStr);
        const maxDurationMs = ms('28d');
        if (!durationMs || durationMs < 5000 || durationMs > maxDurationMs) { // Min 5s, Max 28d
            return message.reply('❌ Invalid duration. Must be between 5 seconds (5s) and 28 days (28d). Example: 10m, 1h.');
        }

        // 6. Apply Timeout
        try {
            await targetMember.timeout(durationMs, reason);
            const timeoutEndTimestamp = Math.floor((Date.now() + durationMs) / 1000);

            // 7. DM User (Best effort)
            try {
                await target.send(`You have been timed out in **${message.guild.name}** for **${durationStr}** for the reason: \`${reason}\`. You can communicate again <t:${timeoutEndTimestamp}:R>.`);
            } catch (dmError) {
                console.log(`Could not DM ${target.tag} about timeout.`);
            }

            // 8. Public Confirmation Embed
            const embed = new EmbedBuilder()
                .setTitle('⏰ User Timed Out')
                .setDescription(`Moderator ${message.author} has restricted messaging.`)
                .addFields(
                    { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
                    { name: 'Duration', value: `**${durationStr}**`, inline: true },
                    { name: 'Timeout Ends', value: `<t:${timeoutEndTimestamp}:R>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setColor(0xFFA500)
                .setTimestamp();
            await message.channel.send({ embeds: [embed] });

            // 9. Log Action
             const settings = await Settings.findOne({ guildId: message.guild.id });
             if (settings && settings.modlogChannelId) {
                await logModerationAction(message.guild, settings, 'Timeout', target, message.author, reason, `Duration: ${durationStr}`);
             }

        } catch (error) {
            console.error("Timeout error:", error);
            message.reply('❌ Failed to timeout user. Check my permissions (Moderate Members) and role hierarchy.');
        }
    },
};
