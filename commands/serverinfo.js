// commands/prefix/serverinfo.js (NEW FILE)
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'serverinfo',
    description: 'View server information.',
    aliases: ['si', 'server'],
    async execute(message, args, client) {
        const guild = message.guild;
        const owner = await guild.members.fetch(guild.ownerId).catch(() => null);

        const embed = new EmbedBuilder()
            .setTitle(`⭐ ${guild.name} Server Details`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .setColor(0x0099FF)
            .addFields(
                { name: 'Owner 👑', value: owner ? owner.user.tag : `<@${guild.ownerId}>`, inline: true },
                { name: 'Members 👥', value: `${guild.memberCount}`, inline: true },
                { name: 'Channels #️⃣', value: `${guild.channels.cache.size}`, inline: true },
                { name: 'Roles 🎭', value: `${guild.roles.cache.size}`, inline: true },
                { name: 'Boosts 🚀', value: `${guild.premiumSubscriptionCount || 0} (Tier ${guild.premiumTier})`, inline: true },
                { name: 'Verification Level', value: `${guild.verificationLevel}`, inline: true },
                { name: 'Server Created 📅', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false },
            )
            .setFooter({ text: `ID: ${guild.id} | You Joined: ${new Date(message.member.joinedTimestamp).toLocaleDateString()}` })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
    },
};
