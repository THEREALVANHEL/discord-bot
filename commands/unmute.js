// commands/unmute.js
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings');
const { findUserInGuild } = require('../utils/findUserInGuild');
const { logModerationAction } = require('../utils/logModerationAction');

module.exports = {
    name: 'unmute',
    description: 'Removes a timeout (mute) from a user.',
    aliases: ['untimeout'],
    async execute(message, args, client) {
        // 1. Permission Check (Moderate Members or Mod/Admin roles)
        const config = client.config;
        const member = message.member;
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                        [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles.cache.has(roleId));
        const isMod = isAdmin || [config.roles.leadMod, config.roles.mod].some(roleId => member.roles.cache.has(roleId)) ||
                      member.permissions.has(PermissionsBitField.Flags.ModerateMembers);

        // Check for Temp Mod Access Role
        const tempRole = message.guild.roles.cache.find(role => role.name === 'TempModAccess'); // Assuming role name
        const hasTempAccess = tempRole && member.roles.cache.has(tempRole.id);

        if (!isMod && !hasTempAccess) {
            return message.reply('🛡️ You need Moderator permissions or temporary access to use this command.');
        }

        // 2. Argument Parsing: ?unmute <user> [reason]
        if (args.length < 1) {
            return message.reply('Usage: `?unmute <@user|userID|username|displayName> [reason]`');
        }

        const targetIdentifier = args[0];
        const reason = args.slice(1).join(' ') || 'Manual unmute.';

        // 3. Find Target User/Member
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) {
            return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        }
        const target = targetMember.user;

        // 4. Basic & Hierarchy Checks
        if (targetMember.id === message.author.id) {
            return message.reply('❌ You cannot unmute yourself.');
        }
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
        if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply('❌ I do not have permission to manage timeouts (unmute members).');
        }
         // Can't unmute someone higher than the command user (unless owner)
         if (targetMember.roles.highest.position >= member.roles.highest.position && message.guild.ownerId !== message.author.id) {
            return message.reply('❌ You cannot unmute someone with an equal or higher role.');
        }
        // Can't unmute someone higher than the bot
        if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
            return message.reply('❌ I cannot unmute someone with an equal or higher role than me.');
        }

        // 5. Check if User is Actually Timed Out
        if (!targetMember.isCommunicationDisabled()) {
            return message.reply(`✅ ${target.tag} is not currently timed out.`);
        }

        // 6. Remove Timeout
        try {
            await targetMember.timeout(null, reason); // Pass null duration to remove timeout

            // 7. DM User (Best effort)
            try {
                await target.send(`Your timeout in **${message.guild.name}** has been removed by ${message.author.tag}. Reason: \`${reason}\`.`);
            } catch (dmError) {
                console.log(`Could not DM ${target.tag} about unmute.`);
            }

            // 8. Public Confirmation Embed
            const embed = new EmbedBuilder()
                .setTitle('✅ User Unmuted')
                .setDescription(`Moderator ${message.author} removed the timeout.`)
                .addFields(
                    { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setColor(0x00FF00) // Green
                .setTimestamp();
            await message.channel.send({ embeds: [embed] });

            // 9. Log Action
             const settings = await Settings.findOne({ guildId: message.guild.id });
             if (settings && settings.modlogChannelId) {
                await logModerationAction(message.guild, settings, 'Timeout Removed (Unmute)', target, message.author, reason);
             }

        } catch (error) {
            console.error("Unmute error:", error);
            message.reply('❌ Failed to remove timeout. Check my permissions (Moderate Members) and role hierarchy.');
        }
    },
};
