// commands/grant.js (Updated with Role ID)
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const { findUserInGuild } = require('../utils/findUserInGuild');

// const grantedUsers = client.grantedUsers; // Access via client in execute

module.exports = {
    name: 'grant',
    description: 'Temporarily grants moderation command access to a user.',
    aliases: ['tempperms'],
    async execute(message, args, client) {
        // Access the map via client
        const grantedUsers = client.grantedUsers;
        const tempRoleId = '1433118039275999232'; // THE SPECIFIC ROLE ID

        // 1. Permission Check: Only allow high-level admins
        const adminRoles = [client.config.roles.forgottenOne, client.config.roles.overseer];
        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                        adminRoles.some(roleId => message.member.roles.cache.has(roleId));

        if (!isAdmin) {
            return message.reply('❌ You do not have permission to use this command.');
        }

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
        const tempRole = await message.guild.roles.fetch(tempRoleId).catch(() => null); // Fetch by ID

        if (!tempRole) {
            // Attempt to fetch again, maybe cache was stale
             await message.guild.roles.fetch({ cache: false });
             const freshTempRole = message.guild.roles.cache.get(tempRoleId);
             if (!freshTempRole) {
                return message.reply(`❌ The temporary role with ID \`${tempRoleId}\` was not found. Please ensure it exists.`);
             }
             // If found fresh, use it (this case is less likely but adds robustness)
             // tempRole = freshTempRole; // No need to reassign, just proceed
        }


        // 6. Check if user already has the role or is already granted
        if (targetMember.roles.cache.has(tempRole.id)) {
            return message.reply(`⚠️ ${targetMember.displayName} already has the temporary access role.`);
        }
        if (grantedUsers.has(targetMember.id)) {
            // Optionally: Allow extending? For now, just block.
            return message.reply(`⚠️ ${targetMember.displayName} already has temporary permissions active (timer running). Use \`?ungrant\` first if needed.`);
        }

        // 7. Grant the Role and Set Timeout
        try {
            await targetMember.roles.add(tempRole.id, `Temporary grant by ${message.author.tag}`);

            const timeoutId = setTimeout(async () => {
                try {
                    const memberStillExists = await message.guild.members.fetch(targetMember.id).catch(() => null);
                    if (memberStillExists && memberStillExists.roles.cache.has(tempRole.id)) {
                        await memberStillExists.roles.remove(tempRole.id, 'Temporary grant expired');
                        console.log(`Removed temporary role ${tempRole.id} from ${targetMember.user.tag}`);
                         try {
                             await targetMember.user.send(`Your temporary moderation access in ${message.guild.name} has expired.`).catch(() => {});
                         } catch {}
                    }
                } catch (removeError) {
                    console.error(`Failed to remove temporary role ${tempRole.id} from ${targetMember.user.tag}:`, removeError);
                } finally {
                    grantedUsers.delete(targetMember.id); // Remove user from tracking map
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
                    { name: 'Role Added', value: `${tempRole}`, inline: false } // Shows role mention
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

            try {
                await targetMember.user.send(`You have been granted temporary moderation access in **${message.guild.name}** via the ${tempRole.name} role for **${durationStr}**, expiring <t:${expiryTimestamp}:R>. Granted by: ${message.author.tag}.`);
            } catch {
                message.channel.send(`⚠️ Couldn't DM ${targetMember} about their temporary access.`);
            }

        } catch (error) {
            console.error('Error granting temporary role:', error);
            message.reply(`❌ Failed to grant the temporary role <@&${tempRoleId}>. Check my permissions and ensure my role is higher than this role.`);
        }
    },
};
