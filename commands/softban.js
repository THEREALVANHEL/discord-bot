// commands/softban.js (FIXED Temp Role Check)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings');
const { findUserInGuild } = require('../utils/findUserInGuild');
const { logModerationAction } = require('../utils/logModerationAction');

module.exports = {
    name: 'softban',
    description: 'Softban a user (kick, allows immediate rejoin).',
    aliases: ['sb'],
    async execute(message, args, client) {
        // 1. Permission Check
        const config = client.config;
        const member = message.member;
         const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                         [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles.cache.has(roleId));
         const isMod = isAdmin || [config.roles.leadMod, config.roles.mod].some(roleId => member.roles.cache.has(roleId)) ||
                       (member.permissions.has(PermissionsBitField.Flags.BanMembers) && member.permissions.has(PermissionsBitField.Flags.KickMembers));

         // --- FIXED: Check for Temp Mod Access Role ID ---
         const tempRoleId = '1433118039275999232';
         const hasTempAccess = member.roles.cache.has(tempRoleId);
         // --- End Fix ---

        if (!isMod && !hasTempAccess) {
             return message.reply('🛡️ You need Ban & Kick permissions or temporary access to use this command.');
        }

        // --- Rest of the command logic (unchanged) ---
        if (args.length < 1) return message.reply('Usage: `?softban <@user|userID|username> [reason]`');
        const targetIdentifier = args[0]; const reason = args.slice(1).join(' ') || 'No reason provided.';
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        const target = targetMember.user;
        if (targetMember.id === message.author.id) return message.reply('❌ You cannot softban yourself.');
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
        if (!botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ I need Ban Members permission for softban.');
        if (targetMember.roles.highest.position >= member.roles.highest.position && message.guild.ownerId !== message.author.id) return message.reply('❌ You cannot softban someone with an equal or higher role.');
        if (targetMember.roles.highest.position >= botMember.roles.highest.position) return message.reply('❌ I cannot softban someone with an equal or higher role than me.');

        try {
            try { await target.send(`You are being softbanned from **${message.guild.name}** for: \`${reason}\`. This kicks you but allows immediate rejoin.`); } catch (dmError) { console.log(`Could not DM ${target.tag} before softban.`); }
            await message.guild.members.ban(target.id, { deleteMessageSeconds: 0, reason: `Softban by ${message.author.tag}: ${reason}` });
            await message.guild.members.unban(target.id, 'Softban automatic unban');
            const embed = new EmbedBuilder().setTitle('🔨 Softban Executed').setDescription(`Moderator ${message.author} issued a softban (kick). User can rejoin.`).addFields({ name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true }, { name: 'Action', value: 'Kick (Softban)', inline: true }, { name: 'Messages Purged?', value: 'No', inline: true }, { name: 'Reason', value: reason, inline: false }).setColor(0xDC143C).setTimestamp();
            await message.channel.send({ embeds: [embed] });
            const settings = await Settings.findOne({ guildId: message.guild.id });
            if (settings && settings.modlogChannelId) await logModerationAction(message.guild, settings, 'Softban', target, message.author, reason, 'No messages deleted');
        } catch (error) { console.error('Softban error:', error); message.reply('❌ Failed to softban user. Check permissions/hierarchy.'); }
    },
};
