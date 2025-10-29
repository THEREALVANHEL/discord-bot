// commands/warn.js (FIXED Temp Role Check)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { findUserInGuild } = require('../utils/findUserInGuild');
const { logModerationAction } = require('../utils/logModerationAction');
const ms = require('ms');

module.exports = {
    name: 'warn',
    description: 'Warn a user.',
    aliases: [],
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
        if (args.length < 1) return message.reply('Usage: `?warn <@user|userID|username> [reason]`');
        const targetIdentifier = args[0];
        const reason = args.slice(1).join(' ') || 'No reason provided.';
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        const target = targetMember.user;
        if (target.bot) return message.reply('❌ You cannot warn bots.');
        if (target.id === message.author.id) return message.reply('❌ You cannot warn yourself.');
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
        if (targetMember.roles.highest.position >= member.roles.highest.position && message.guild.ownerId !== message.author.id) return message.reply('❌ You cannot warn someone with an equal or higher role.');
        if (targetMember.roles.highest.position >= botMember.roles.highest.position) return message.reply('❌ I cannot warn someone with an equal or higher role than me.');

        let userDB = await User.findOne({ userId: target.id }); if (!userDB) userDB = new User({ userId: target.id });
        const warningData = { reason, moderatorId: message.author.id, date: new Date() };
        userDB.warnings.push(warningData);
        try { await userDB.save(); } catch (dbError) { console.error("Failed to save warning:", dbError); return message.reply('❌ Database Error: Could not save the warning.'); }
        const newWarningCount = userDB.warnings.length;
        try { await target.send(`You have been warned in **${message.guild.name}** for: \`${reason}\`\nThis is warning **#${newWarningCount}**.`); } catch (dmError) { console.log(`Could not DM ${target.tag} about warning.`); }

        const embed = new EmbedBuilder().setTitle('⚠️ Warning Issued').setDescription(`Moderator ${message.author} issued a warning.`).addFields({ name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },{ name: 'Reason', value: reason, inline: false },{ name: 'Total Warnings', value: `**${newWarningCount}**`, inline: true }).setColor(0xFFA500).setTimestamp();
        await message.channel.send({ embeds: [embed] });

        const settings = await Settings.findOne({ guildId: message.guild.id });
        if (settings && settings.modlogChannelId) await logModerationAction(message.guild, settings, 'Warn', target, message.author, reason, `Warning #${newWarningCount}`);

        // Auto Timeout Logic
        const AUTO_TIMEOUT_THRESHOLD = 5; const AUTO_TIMEOUT_DURATION = '1h';
        if (newWarningCount >= AUTO_TIMEOUT_THRESHOLD) {
            if (botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers) && targetMember.moderatable && !targetMember.isCommunicationDisabled()) {
                try {
                    const timeoutDuration = ms(AUTO_TIMEOUT_DURATION); await targetMember.timeout(timeoutDuration, `Auto timeout: ${AUTO_TIMEOUT_THRESHOLD} warnings reached`);
                    const autoTimeoutEmbed = new EmbedBuilder().setTitle('🚨 Automatic Action: Timeout').setDescription(`${target} reached **${newWarningCount} warnings** and was automatically timed out for **${AUTO_TIMEOUT_DURATION}**.`).setColor(0xDC143C).setTimestamp();
                    await message.channel.send({ embeds: [autoTimeoutEmbed] });
                    if (settings && settings.modlogChannelId) await logModerationAction(message.guild, settings, 'Auto Timeout', target, client.user, `${AUTO_TIMEOUT_THRESHOLD} warnings reached`, `Duration: ${AUTO_TIMEOUT_DURATION}`);
                    try { await target.send(`You have been automatically timed out in **${message.guild.name}** for **${AUTO_TIMEOUT_DURATION}** due to accumulating ${newWarningCount} warnings.`); } catch {}
                } catch (timeoutError) { console.error(`Failed to auto-timeout ${target.tag}:`, timeoutError); message.channel.send(`⚠️ Failed to automatically timeout ${target.tag}. Check permissions/hierarchy.`).catch(console.error); }
            } else { message.channel.send(`⚠️ ${target.tag} reached ${newWarningCount} warnings, but I couldn't apply the automatic timeout (Permissions/Hierarchy/Already Timed Out).`).catch(console.error); }
        }
    },
};
