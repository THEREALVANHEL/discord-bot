// commands/ungrant.js (Updated with STRICT Role ID Check)
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { findUserInGuild } = require('../utils/findUserInGuild');

module.exports = {
    name: 'ungrant',
    description: 'Revokes temporary moderation command access granted via ?grant.',
    aliases: ['revoke'],
    async execute(message, args, client) {
        // Access the map via client
        const grantedUsers = client.grantedUsers;
        const tempRoleId = '1433118039275999232'; // Use the specific ID for temporary access

        // 1. Permission Check: STRICTLY only allow the "Forgotten One" role
        const forgottenOneRoleId = client.config.roles.forgottenOne;
        if (!forgottenOneRoleId) {
            console.error("Configuration Error: 'forgottenOne' role ID is missing in client.config.roles");
            return message.reply('❌ Configuration error: The required role ID for this command is not set.');
        }

        // Check if the message author has ONLY the specific role
        const isForgottenOne = message.member.roles.cache.has(forgottenOneRoleId);

        if (!isForgottenOne) {
            // Provide a specific message indicating the required role
            return message.reply(`❌ Only users with the <@&${forgottenOneRoleId}> role can use this command.`);
        }

        // --- Rest of the command logic remains the same ---

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

        // Check both the map AND if they actually have the role
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

            // Fetch the role object to display its name (optional, but good for UX)
            const tempRole = message.guild.roles.cache.get(tempRoleId);

            // Remove the role if they have it
            if (targetMember.roles.cache.has(tempRoleId)) {
                await targetMember.roles.remove(tempRoleId, `Temporary access revoked by ${message.author.tag}`);
                console.log(`Manually removed temporary role ${tempRoleId} from ${targetMember.user.tag}`);

                 const embed = new EmbedBuilder()
                    .setTitle('✅ Temporary Permissions Revoked')
                    .setDescription(`${message.author} revoked temporary moderation access for ${targetMember}.`)
                    .addFields(
                        { name: 'User', value: `${targetMember} (${targetMember.user.tag})`, inline: true },
                        { name: 'Role Removed', value: tempRole ? `${tempRole}` : `<@&${tempRoleId}>`, inline: false } // Show role mention
                    )
                    .setColor(0xFF4500) // OrangeRed
                    .setTimestamp();
                 await message.channel.send({ embeds: [embed] });

                 try {
                     await targetMember.user.send(`Your temporary moderation access in **${message.guild.name}** has been revoked by ${message.author.tag}.`).catch(() => {});
                 } catch {}

            } else {
                 message.reply(`ℹ️ ${targetMember.displayName} did not have the role, but their pending expiry timer was cleared.`);
            }

        } catch (error) {
            console.error('Error revoking temporary role:', error);
            message.reply('❌ Failed to revoke the temporary role. Check my permissions and role hierarchy.');
        }
    },
};
