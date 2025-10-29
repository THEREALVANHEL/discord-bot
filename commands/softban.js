// commands/softban.js (Converted to Prefix Command)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings');
const { findUserInGuild } = require('../utils/findUserInGuild');
const { logModerationAction } = require('../utils/logModerationAction');

module.exports = {
    name: 'softban',
    description: 'Softban a user (kick to purge messages, allows immediate rejoin).',
    aliases: ['sb'],
    async execute(message, args, client) {
        // 1. Permission Check (Ban Members + Kick Members or Mod/Admin roles)
        const config = client.config;
        const member = message.member;
         const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                         [config.roles.forgottenOne, config.roles.overseer].some(roleId => member.roles.cache.has(roleId));
         const isMod = isAdmin || [config.roles.leadMod, config.roles.mod].some(roleId => member.roles.cache.has(roleId)) ||
                       (member.permissions.has(PermissionsBitField.Flags.BanMembers) && member.permissions.has(PermissionsBitField.Flags.KickMembers)); // Check specific perms too

         // Check for Temp Mod Access Role
         const tempRole = message.guild.roles.cache.find(role => role.name === 'TempModAccess');
         const hasTempAccess = tempRole && member.roles.cache.has(tempRole.id);

        if (!isMod && !hasTempAccess) {
             return message.reply('🛡️ You need Ban & Kick permissions or temporary access to use this command.');
        }


        // 2. Argument Parsing: ?softban <user> [reason]
        if (args.length < 1) {
            return message.reply('Usage: `?softban <@user|userID|username> [reason]`');
        }
        const targetIdentifier = args[0];
        const reason = args.slice(1).join(' ') || 'No reason provided.';

        // 3. Find Target User/Member
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) {
            return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        }
        const target = targetMember.user;

        // 4. Basic & Hierarchy Checks
        if (targetMember.id === message.author.id) {
            return message.reply('❌ You cannot softban yourself.');
        }
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
         if (!botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) {
             return message.reply('❌ I do not have permission to ban members (required for softban).');
         }
         if (targetMember.roles.highest.position >= member.roles.highest.position && message.guild.ownerId !== message.author.id) {
             return message.reply('❌ You cannot softban someone with an equal or higher role.');
         }
          if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
             return message.reply('❌ I cannot softban someone with an equal or higher role than me.');
         }


        // 5. Perform Softban (Ban + Immediate Unban)
        try {
            // DM User (Best effort)
            try {
                await target.send(`You are being softbanned from **${message.guild.name}** for: \`${reason}\`. This kicks you but allows immediate rejoin.`);
            } catch (dmError) {
                console.log(`Could not DM ${target.tag} before softban.`);
            }

            // Ban (0 seconds = kick effect, no message deletion)
            await message.guild.members.ban(target.id, { deleteMessageSeconds: 0, reason: `Softban by ${message.author.tag}: ${reason}` });

            // Unban immediately
            await message.guild.members.unban(target.id, 'Softban automatic unban');

            // 6. Public Confirmation Embed
            const embed = new EmbedBuilder()
                .setTitle('🔨 Softban Executed')
                .setDescription(`Moderator ${message.author} issued a softban (kick). The user can rejoin.`)
                .addFields(
                    { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
                    { name: 'Action', value: 'Kick (Softban)', inline: true },
                    { name: 'Messages Purged?', value: 'No', inline: true }, // As deleteMessageSeconds is 0
                    { name: 'Reason', value: reason, inline: false }
                )
                .setColor(0xDC143C) // Crimson
                .setTimestamp();
            await message.channel.send({ embeds: [embed] });

            // 7. Log Action
             const settings = await Settings.findOne({ guildId: message.guild.id });
              if (settings && settings.modlogChannelId) {
                 await logModerationAction(message.guild, settings, 'Softban', target, message.author, reason, 'No messages deleted');
              }

        } catch (error) {
            console.error('Softban error:', error);
            message.reply('❌ Failed to softban user. Check my "Ban Members" permission and role hierarchy.');
        }
    },
};
