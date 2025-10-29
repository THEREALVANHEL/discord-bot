// commands/unmute.js (FIXED Temp Role Check)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings');
const { findUserInGuild } = require('../utils/findUserInGuild');
const { logModerationAction } = require('../utils/logModerationAction');

module.exports = {
    name: 'unmute',
    description: 'Removes a timeout (mute) from a user.',
    aliases: ['untimeout'],
    async execute(message, args, client) {
        // 1. Permission Check
        const config = client.config;
        const member = message.member;
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                        [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles.cache.has(roleId));
        const isMod = isAdmin || [config.roles.leadMod, config.roles.mod].some(roleId => member.roles.cache.has(roleId)) ||
                      member.permissions.has(PermissionsBitField.Flags.ModerateMembers);

        // --- FIXED: Check for Temp Mod Access Role ID ---
        const tempRoleId = '1433118039275999232';
        const hasTempAccess = member.roles.cache.has(tempRoleId);
        // --- End Fix ---

        if (!isMod && !hasTempAccess) {
            return message.reply('🛡️ You need Moderator permissions or temporary access to use this command.');
        }

        // --- Rest of command logic (unchanged) ---
        if (args.length < 1) return message.reply('Usage: `?unmute <@user|userID|username|displayName> [reason]`');
        const targetIdentifier = args[0]; const reason = args.slice(1).join(' ') || 'Manual unmute.';
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        const target = targetMember.user;
        if (targetMember.id === message.author.id) return message.reply('❌ You cannot unmute yourself.');
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
        if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply('❌ I need Moderate Members permission.');
        if (targetMember.roles.highest.position >= member.roles.highest.position && message.guild.ownerId !== message.author.id) return message.reply('❌ Cannot unmute user with equal/higher role.');
        if (targetMember.roles.highest.position >= botMember.roles.highest.position) return message.reply('❌ Cannot unmute user with equal/higher role than me.');
        if (!targetMember.isCommunicationDisabled()) return message.reply(`✅ ${target.tag} is not timed out.`);

        try {
            await targetMember.timeout(null, reason);
            try { await target.send(`Your timeout in **${message.guild.name}** was removed by ${message.author.tag}. Reason: \`${reason}\`.`); } catch (dmError) { console.log(`Could not DM ${target.tag} about unmute.`); }
            const embed = new EmbedBuilder().setTitle('✅ User Unmuted').setDescription(`Moderator ${message.author} removed the timeout.`).addFields({ name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true }, { name: 'Reason', value: reason, inline: false }).setColor(0x00FF00).setTimestamp();
            await message.channel.send({ embeds: [embed] });
            const settings = await Settings.findOne({ guildId: message.guild.id });
            if (settings && settings.modlogChannelId) await logModerationAction(message.guild, settings, 'Timeout Removed (Unmute)', target, message.author, reason);
        } catch (error) { console.error("Unmute error:", error); message.reply('❌ Failed to remove timeout. Check permissions/hierarchy.'); }
    },
};
