// commands/userinfo.js (NEW)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('View user information.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('user')
        .setDescription('User  to view info for (defaults to you)')
        .setRequired(false)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(targetUser.id) || await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: 'User  not found in this server.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.tag} Info`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setColor(0x0099FF)
      .addFields(
        { name: 'ID', value: targetUser.id, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`, inline: true },
        { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: true },
        { name: 'Roles', value: member.roles.cache.size > 1 ? member.roles.cache.map(r => r.name).join(', ') : 'No roles', inline: false },
        { name: 'Permissions', value: member.permissions.toArray().slice(0, 5).join(', ') + (member.permissions.toArray().length > 5 ? '...' : ''), inline: false },
        { name: 'Status', value: member.presence?.status || 'Offline', inline: true },
        { name: 'Boosting?', value: member.premiumSince ? 'Yes' : 'No', inline: true },
      )
      .setFooter({ text: `Nickname: ${member.nickname || 'None'}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
