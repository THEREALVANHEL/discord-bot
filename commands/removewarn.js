// commands/removewarn.js (FIXED Temp Role Check)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { findUserInGuild } = require('../utils/findUserInGuild');
const { logModerationAction } = require('../utils/logModerationAction');

module.exports = {
    name: 'removewarn',
    description: 'Remove a specific warning or all warnings from a user.',
    aliases: ['clearwarns', 'delwarn'],
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

        // --- Rest of the command logic (unchanged) ---
        if (args.length < 2) return message.reply('Usage: `?removewarn <@user|userID|username> <warning_number | "all">`');
        const targetIdentifier = args[0];
        const actionArg = args[1].toLowerCase();
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        const target = targetMember.user;

        let userDB = await User.findOne({ userId: target.id });
        if (!userDB || !userDB.warnings || userDB.warnings.length === 0) return message.channel.send(`${target} has **no warnings** on record. ✅`);

        const settings = await Settings.findOne({ guildId: message.guild.id });

        if (actionArg === 'all') {
            const removedCount = userDB.warnings.length; userDB.warnings = []; await userDB.save();
            const embed = new EmbedBuilder().setTitle('✅ Warnings Cleared').setDescription(`Moderator ${message.author} cleared all **${removedCount}** warnings for ${target}.`).addFields({ name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true }, { name: 'Removed Warnings', value: `**${removedCount}**`, inline: true }).setColor(0x00FF00).setTimestamp();
            if (settings && settings.modlogChannelId) await logModerationAction(message.guild, settings, 'Warnings Cleared', target, message.author, 'All warnings removed', `Count: ${removedCount}`);
            await message.channel.send({ embeds: [embed] });
        } else {
            const index = parseInt(actionArg, 10);
            if (isNaN(index) || index < 1 || index > userDB.warnings.length) return message.reply(`❌ Invalid warning number. ${target.tag} has ${userDB.warnings.length} warnings. Use a number between 1 and ${userDB.warnings.length}, or "all".`);
            const removedWarn = userDB.warnings.splice(index - 1, 1)[0]; await userDB.save();
            const embed = new EmbedBuilder().setTitle('✅ Warning Removed').setDescription(`Moderator ${message.author} removed warning #${index} for ${target}.`).addFields({ name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true }, { name: 'Remaining Warnings', value: `**${userDB.warnings.length}**`, inline: true }, { name: 'Reason Removed', value: removedWarn.reason, inline: false }).setColor(0x00FF00).setTimestamp();
            if (settings && settings.modlogChannelId) await logModerationAction(message.guild, settings, 'Warning Removed', target, message.author, removedWarn.reason, `Warning Index: #${index}`);
            await message.channel.send({ embeds: [embed] });
        }
    },
};
