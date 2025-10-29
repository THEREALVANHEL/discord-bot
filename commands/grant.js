// commands/grant.js
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const User = require('../models/User'); // Assuming User model might be needed later

// In-memory store for granted roles (reset on bot restart)
// For persistence, you'd need to store this in your database
const grantedUsers = new Map(); // userId -> { roleId: string, timeoutId: NodeJS.Timeout }

module.exports = {
    name: 'grant',
    description: 'Temporarily grants moderation command access to a user.',
    aliases: [], // Add aliases if needed, e.g., ['tempperms']
    async execute(message, args, client) {
        // 1. Permission Check: Only allow high-level admins (e.g., Administrator permission or specific role)
        const adminRoles = [client.config.roles.forgottenOne, client.config.roles.overseer]; // Example admin roles
        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                        adminRoles.some(roleId => message.member.roles.cache.has(roleId));

        if (!isAdmin) {
            return message.reply('❌ You do not have permission to use this command.');
        }

        // 2. Argument Parsing: ?grant @user <duration> (e.g., ?grant @Vanhel 1h)
        if (args.length < 2) {
            return message.reply('Usage: `?grant <@user|userID|username> <duration (e.g., 10m, 1h, 1d)>`');
        }

        const targetIdentifier = args[0];
        const durationStr = args[1];

        // 3. Find Target User/Member
        const { findUserInGuild } = require('../utils/findUserInGuild'); // Assuming you keep this utility
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);

        if (!targetMember) {
            return message.reply(`❌ Could not find user: "${targetIdentifier}". Please use a mention, ID, or full username.`);
        }

        // Prevent granting to self or bots
        if (targetMember.id === message.author.id) {
            return message.reply('❌ You cannot grant temporary permissions to yourself.');
        }
        if (targetMember.user.bot) {
            return message.reply('❌ You cannot grant temporary permissions to bots.');
        }

        // 4. Parse Duration
        const durationMs = ms(durationStr);
        if (!durationMs || durationMs <= 0) {
            return message.reply('❌ Invalid duration format. Use e.g., 10m, 1h, 1d.');
        }
        const maxDuration = ms('7d'); // Example: Max 7 days
        if (durationMs > maxDuration) {
            return message.reply(`❌ Duration cannot exceed 7 days.`);
        }

        // 5. Define the Temporary Role
        // IMPORTANT: Create a role named "TempModAccess" (or similar) on your server.
        // This role should have permissions for the commands: warn, warnlist, removewarn, timeout, softban, claimticket, ticket close.
        // You can get the Role ID after creating it.
        const tempRoleName = 'TempModAccess'; // MAKE SURE THIS ROLE EXISTS
        const tempRole = message.guild.roles.cache.find(role => role.name === tempRoleName);

        if (!tempRole) {
            return message.reply(`❌ The temporary role "${tempRoleName}" was not found. Please create it first.`);
        }

        // 6. Check if user already has the role or is already granted
        if (targetMember.roles.cache.has(tempRole.id)) {
            return message.reply(`⚠️ ${targetMember.displayName} already has the "${tempRoleName}" role.`);
        }
        if (grantedUsers.has(targetMember.id)) {
            return message.reply(`⚠️ ${targetMember.displayName} already has temporary permissions active.`);
        }

        // 7. Grant the Role and Set Timeout
        try {
            await targetMember.roles.add(tempRole.id, `Temporary grant by ${message.author.tag}`);

            const timeoutId = setTimeout(async () => {
                try {
                    const memberStillExists = await message.guild.members.fetch(targetMember.id).catch(() => null);
                    if (memberStillExists && memberStillExists.roles.cache.has(tempRole.id)) {
                        await memberStillExists.roles.remove(tempRole.id, 'Temporary grant expired');
                        console.log(`Removed temporary role from ${targetMember.user.tag}`);
                        targetMember.user.send(`Your temporary moderation access in ${message.guild.name} has expired.`).catch(() => {});
                    }
                } catch (removeError) {
                    console.error(`Failed to remove temporary role from ${targetMember.user.tag}:`, removeError);
                } finally {
                    grantedUsers.delete(targetMember.id);
                }
            }, durationMs);

            // Store the grant info
            grantedUsers.set(targetMember.id, { roleId: tempRole.id, timeoutId: timeoutId });

            const expiryTimestamp = Math.floor((Date.now() + durationMs) / 1000);
            const embed = new EmbedBuilder()
                .setTitle('✅ Temporary Permissions Granted')
                .setDescription(`${message.author} granted temporary moderation access to ${targetMember}.`)
                .addFields(
                    { name: 'User', value: `${targetMember} (${targetMember.user.tag})`, inline: true },
                    { name: 'Duration', value: durationStr, inline: true },
                    { name: 'Expires', value: `<t:${expiryTimestamp}:R>`, inline: true },
                    { name: 'Role Added', value: `${tempRole}`, inline: false }
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

            try {
                await targetMember.user.send(`You have been granted temporary moderation access in **${message.guild.name}** for **${durationStr}**, expiring <t:${expiryTimestamp}:R>. Granted by: ${message.author.tag}.`);
            } catch {
                message.channel.send(`⚠️ Couldn't DM ${targetMember} about their temporary access.`);
            }

        } catch (error) {
            console.error('Error granting temporary role:', error);
            message.reply('❌ Failed to grant the temporary role. Check my permissions and role hierarchy.');
        }
    },
};
