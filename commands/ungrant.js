// commands/ungrant.js
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { findUserInGuild } = require('../utils/findUserInGuild');

// Get the grantedUsers map from the client instance (set in index.js)
// const grantedUsers = client.grantedUsers; // Access via client

module.exports = {
    name: 'ungrant',
    description: 'Revokes temporary moderation command access granted via ?grant.',
    aliases: ['revoke'],
    async execute(message, args, client) {
        // Access the map via client
        const grantedUsers = client.grantedUsers;

        // 1. Permission Check: Only allow high-level admins
        const adminRoles = [client.config.roles.forgottenOne, client.config.roles.overseer];
        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                        adminRoles.some(roleId => message.member.roles.cache.has(roleId));

        if (!isAdmin) {
            return message.reply('❌ You do not have permission to use this command.');
        }

        // 2. Argument Parsing: ?ungrant <user>
        if (args.length < 1) {
            return message.reply('Usage: `?ungrant <@user|userID|username>`');
        }
        const targetIdentifier = args[0];

        // 3. Find Target User/Member
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) {
            return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        }

        // 4. Check if User Has Granted Role Stored
        const grantInfo = grantedUsers.get(targetMember.id);
        const tempRoleId = '1433118039275999232'; // Use the specific ID

        // Check both the map AND if they actually have the role (for manual additions/removals)
        if (!grantInfo && !targetMember.roles.cache.has(tempRoleId)) {
            return message.reply(`❌ ${targetMember.displayName} does not currently have temporary permissions granted by the bot.`);
        }

        // 5. Revoke Role and Clear Timeout
        try {
            // Clear the timeout if it exists in the map
            if (grantInfo && grantInfo.timeoutId) {
                clearTimeout(grantInfo.timeoutId);
            }
            grantedUsers.delete(targetMember.id); // Remove from tracking

            // Remove the role if they have it
            if (targetMember.roles.cache.has(tempRoleId)) {
                await targetMember.roles.remove(tempRoleId, `Temporary access revoked by ${message.author.tag}`);
                console.log(`Manually removed temporary role from ${targetMember.user.tag}`);

                 const embed = new EmbedBuilder()
                    .setTitle('✅ Temporary Permissions Revoked')
                    .setDescription(`${message.author} revoked temporary moderation access for ${targetMember}.`)
                    .addFields(
                        { name: 'User', value: `${targetMember} (${targetMember.user.tag})`, inline: true },
                        { name: 'Role Removed', value: `<@&${tempRoleId}>`, inline: false }
                    )
                    .setColor(0xFF4500) // OrangeRed
                    .setTimestamp();
                 await message.channel.send({ embeds: [embed] });

                 try {
                     await targetMember.user.send(`Your temporary moderation access in **${message.guild.name}** has been revoked by ${message.author.tag}.`).catch(() => {});
                 } catch {}

            } else {
                 // If they didn't have the role but were in the map (e.g., role removed manually)
                 message.reply(`ℹ️ ${targetMember.displayName} did not have the role, but their pending expiry timer was cleared.`);
            }


        } catch (error) {
            console.error('Error revoking temporary role:', error);
            message.reply('❌ Failed to revoke the temporary role. Check my permissions and role hierarchy.');
        }
    },
};
