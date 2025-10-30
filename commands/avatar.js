// commands/avatar.js (REPLACE)
const { EmbedBuilder } = require('discord.js');
const { findUserInGuild } = require('../utils/findUserInGuild'); // FIXED PATH

module.exports = {
    name: 'avatar',
    description: 'Shows a user\'s avatar.',
    aliases: ['ava', 'pfp'], // Responds to ?ava
    async execute(message, args, client) {
        let targetMember;

        if (args.length > 0) {
            const targetIdentifier = args.join(' ');
            targetMember = await findUserInGuild(message.guild, targetIdentifier);
            if (!targetMember) {
                return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
            }
        } else {
            targetMember = message.member; // Default to command author
        }
        
        const targetUser = targetMember.user;

        // Logic from your avatar.js
        let avatarUrl = targetMember.displayAvatarURL({ dynamic: true, size: 512 });
        let avatarType;

        const customServerAvatarUrl = targetMember.avatarURL({ dynamic: true, size: 512 });
        
        if (customServerAvatarUrl) {
            avatarType = 'Server/Guild';
        } else {
            avatarType = 'Server Profile (Global Default)';
        }

        const embed = new EmbedBuilder()
            .setTitle(`🖼️ ${targetUser.username}'s ${avatarType} Avatar`)
            .setDescription(`[Click here to view the image directly](${avatarUrl})`)
            .setImage(avatarUrl)
            .setFooter({ text: `User ID: ${targetUser.id}` })
            .setColor(0x0099FF);

        await message.channel.send({ embeds: [embed] });
    },
};
