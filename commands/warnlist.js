// commands/warnlist.js (FIXED Temp Role Check)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const User = require('../models/User');
const { findUserInGuild } = require('../utils/findUserInGuild');

module.exports = {
    name: 'warnlist',
    description: 'View warnings for a user.',
    aliases: ['warnings', 'infractions'],
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
             return message.reply('🛡️ You need Moderator permissions or temporary access to view warnings.');
        }

        // --- Rest of the command logic (unchanged) ---
        if (args.length < 1) return message.reply('Usage: `?warnlist <@user|userID|username>`');
        const targetIdentifier = args[0];
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        const targetUser = targetMember.user;

        let userDB = await User.findOne({ userId: targetUser.id });
        if (!userDB || !userDB.warnings || userDB.warnings.length === 0) return message.channel.send(`${targetUser} has **no warnings** on record. ✅`);

        const embed = new EmbedBuilder().setTitle(`🚨 Warning Log for ${targetUser.tag}`).setColor(0xFFA500).setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 })).setTimestamp().setFooter({ text: `Total Warnings: ${userDB.warnings.length}` });
        userDB.warnings.slice(0, 25).forEach((warn, i) => {
            const reason = warn.reason.length > 80 ? warn.reason.substring(0, 77) + '...' : warn.reason;
            const moderatorTag = warn.moderatorId ? `<@${warn.moderatorId}>` : 'Unknown Mod';
            const dateTimestamp = warn.date ? `<t:${Math.floor(new Date(warn.date).getTime() / 1000)}:F>` : 'Unknown Date';
            embed.addFields({ name: `Warning #${i + 1}`, value: `**Reason:** \`${reason}\`\n**Moderator:** ${moderatorTag}\n**Date:** ${dateTimestamp}`, inline: false });
        });
        if (userDB.warnings.length > 25) embed.addFields({ name: '...', value: `*${userDB.warnings.length - 25} more warnings not shown.*` });
        await message.channel.send({ embeds: [embed] });
    },
};
