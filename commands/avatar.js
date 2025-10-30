// commands/avatar.js (REPLACE)
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'avatar',
    description: 'Shows a user\'s avatar. Works for users in or out of the server.',
    aliases: ['ava', 'pfp'],
    async execute(message, args, client) {
        let targetUser;

        if (args.length > 0) {
            const targetIdentifier = args.join(' ').replace(/[<@!>]/g, '');
            
            // Check if it's a user ID (numeric)
            if (/^\d+$/.test(targetIdentifier)) {
                try {
                    // Try to fetch user globally by ID
                    targetUser = await client.users.fetch(targetIdentifier);
                } catch (error) {
                    return message.reply(`❌ Could not find user with ID: "${targetIdentifier}".`);
                }
            } else {
                // Try to find user in the current server
                const members = await message.guild.members.fetch();
                const targetMember = members.find(member => 
                    member.user.username.toLowerCase().includes(targetIdentifier.toLowerCase()) ||
                    member.displayName.toLowerCase().includes(targetIdentifier.toLowerCase()) ||
                    member.user.tag.toLowerCase().includes(targetIdentifier.toLowerCase())
                );
                
                if (targetMember) {
                    targetUser = targetMember.user;
                } else {
                    return message.reply(`❌ Could not find user: "${targetIdentifier}" in this server.`);
                }
            }
        } else {
            targetUser = message.author; // Default to command author
        }

        // Get avatar URLs
        const avatarUrl = targetUser.displayAvatarURL({ dynamic: true, size: 4096 });
        const globalAvatarUrl = targetUser.avatarURL({ dynamic: true, size: 4096 });
        
        let avatarType = 'Global Avatar';
        let description = `[Click here to view the image directly](${avatarUrl})`;

        // Check if user is in the server and has a server-specific avatar
        try {
            const member = await message.guild.members.fetch(targetUser.id);
            const serverAvatarUrl = member.avatarURL({ dynamic: true, size: 4096 });
            
            if (serverAvatarUrl && serverAvatarUrl !== globalAvatarUrl) {
                // User has a server-specific avatar
                const embed = new EmbedBuilder()
                    .setTitle(`🖼️ ${targetUser.username}'s Avatars`)
                    .setColor(0x0099FF)
                    .addFields(
                        { name: '🌐 Global Avatar', value: `[View](${globalAvatarUrl})`, inline: true },
                        { name: '🏠 Server Avatar', value: `[View](${serverAvatarUrl})`, inline: true }
                    )
                    .setImage(serverAvatarUrl)
                    .setThumbnail(globalAvatarUrl)
                    .setFooter({ text: `User ID: ${targetUser.id}` });

                return await message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            // User is not in the server, just show global avatar
        }

        // Single avatar embed for users not in server or without server avatar
        const embed = new EmbedBuilder()
            .setTitle(`🖼️ ${targetUser.username}'s ${avatarType}`)
            .setDescription(description)
            .setImage(avatarUrl)
            .setFooter({ text: `User ID: ${targetUser.id}` })
            .setColor(0x0099FF);

        await message.channel.send({ embeds: [embed] });
    },
};
