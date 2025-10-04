// commands/serverinfo.js (REPLACE - Premium GUI, Fixed integer to string bug)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('View server information.'),
  async execute(interaction) {
    await interaction.deferReply(); // Defer to prevent "Application did not respond"
    const guild = interaction.guild;
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
        // FIX: Ensure values are strings by converting numbers/enums explicitly
        { name: 'Boosts 🚀', value: `${guild.premiumSubscriptionCount || 0} (Tier ${guild.premiumTier})`, inline: true },
        { name: 'Verification Level', value: `${guild.verificationLevel}`, inline: true }, // FIX: Convert to string
        { name: 'Server Created 📅', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false },
      )
      .setFooter({ text: `ID: ${guild.id} | You Joined: ${new Date(interaction.member.joinedTimestamp).toLocaleDateString()}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
