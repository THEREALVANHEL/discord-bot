// commands/grant.js (Updated with STRICT Role ID Check)
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const { findUserInGuild } = require('../utils/findUserInGuild');

module.exports = {
    name: 'grant',
    description: 'Temporarily grants moderation command access to a user.',
    aliases: ['tempperms'],
    async execute(message, args, client) {
        // Access the map via client
        const grantedUsers = client.grantedUsers;
        const tempRoleId = '1433118039275999232'; // THE SPECIFIC ROLE ID for temporary access

        // 1. Permission Check: STRICTLY only allow the "Forgotten One" role
        const forgottenOneRoleId = client.config.roles.forgottenOne; // Get the specific role ID from config
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

        // 2. Argument Parsing: ?grant @user <duration>
        if (args.length < 2) {
            return message.reply('Usage: `?grant <@user|userID|username> <duration (e.g., 10m, 1h, 1d)>`');
        }

        const targetIdentifier = args[0];
        const durationStr = args[1];

        // 3. Find Target User/Member
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) {
            return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        }
        if (targetMember.id === message.author.id) {
            return message.reply('❌ You cannot grant temporary permissions to yourself.');
        }
        if (targetMember.user.bot) {
            return message.reply('❌ You cannot grant temporary permissions to bots.');
        }

        // 4. Parse Duration
        const durationMs = ms(durationStr);
        if (!durationMs || durationMs <= 0) {
            return message.reply('❌ Invalid duration format.');
        }
        const maxDuration = ms('7d');
        if (durationMs > maxDuration) {
            return message.reply(`❌ Duration cannot exceed 7 days.`);
        }

        // 5. Get the Temporary Role using ID
        const tempRole = await message.guild.roles.fetch(tempRoleId).catch(() => null);
        if (!tempRole) {
            await message.guild.roles.fetch({ cache: false }); // Force fetch roles
            const freshTempRole = message.guild.roles.cache.get(tempRoleId);
            if (!freshTempRole) {
               return message.reply(`❌ The temporary role with ID \`${tempRoleId}\` was not found. Please ensure it exists.`);
            }
            // Use freshTempRole if found - logic continues below
        }
        const finalTempRole = tempRole || message.guild.roles.cache.get(tempRoleId); // Use whichever is available

        // 6. Check if user already has the role or is already granted
        if (targetMember.roles.cache.has(finalTempRole.id)) {
            return message.reply(`⚠️ ${targetMember.displayName} already has the temporary access role.`);
        }
        if (grantedUsers.has(targetMember.id)) {
            return message.reply(`⚠️ ${targetMember.displayName} already has temporary permissions active (timer running). Use \`?ungrant\` first if needed.`);
        }

        // 7. Grant the Role and Set Timeout
        try {
            await targetMember.roles.add(finalTempRole.id, `Temporary grant by ${message.author.tag}`);

            const timeoutId = setTimeout(async () => {
                try {
                    const memberStillExists = await message.guild.members.fetch(targetMember.id).catch(() => null);
                    if (memberStillExists && memberStillExists.roles.cache.has(finalTempRole.id)) {
                        await memberStillExists.roles.remove(finalTempRole.id, 'Temporary grant expired');
                        console.log(`Removed temporary role ${finalTempRole.id} from ${targetMember.user.tag}`);
                         try {
                             await targetMember.user.send(`Your temporary moderation access in ${message.guild.name} has expired.`).catch(() => {});
                         } catch {}
                    }
                } catch (removeError) {
                    console.error(`Failed to remove temporary role ${finalTempRole.id} from ${targetMember.user.tag}:`, removeError);
                } finally {
                    grantedUsers.delete(targetMember.id);
                }
            }, durationMs);

            grantedUsers.set(targetMember.id, { roleId: finalTempRole.id, timeoutId: timeoutId });

            const expiryTimestamp = Math.floor((Date.now() + durationMs) / 1000);
            const embed = new EmbedBuilder()
                .setTitle('✅ Temporary Permissions Granted')
                .setDescription(`${message.author} granted temporary moderation access to ${targetMember}.`)
                .addFields(
                    { name: 'User', value: `${targetMember} (${targetMember.user.tag})`, inline: true },
                    { name: 'Duration', value: durationStr, inline: true },
                    { name: 'Expires', value: `<t:${expiryTimestamp}:R>`, inline: true },
                    { name: 'Role Added', value: `${finalTempRole}`, inline: false }
                )
                .setColor(0x00FF00)
                .setTimestamp();
            await message.channel.send({ embeds: [embed] });

            try {
                await targetMember.user.send(`You have been granted temporary moderation access in **${message.guild.name}** via the ${finalTempRole.name} role for **${durationStr}**, expiring <t:${expiryTimestamp}:R>. Granted by: ${message.author.tag}.`);
            } catch {
                message.channel.send(`⚠️ Couldn't DM ${targetMember} about their temporary access.`);
            }

        } catch (error) {
            console.error('Error granting temporary role:', error);
            message.reply(`❌ Failed to grant the temporary role <@&${finalTempRole.id}>. Check my permissions and ensure my role is higher than this role.`);
        }
    },
};
