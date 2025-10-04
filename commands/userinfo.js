// commands/userinfo.js (NEW, with role pings and full timestamps)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('View user information.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User to view info for (defaults to you)')
        .setRequired(false)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target') || interaction.user;
    const member = interaction.guild.members.cache.get(targetUser.id) || await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    }

    // Get roles as mentions, excluding @everyone
    const roles = member.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `<@&${r.id}>`)
      .join(', ');
      
    const rolesValue = roles.length > 0 ? roles : 'No roles (excluding @everyone)';

    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.tag} Info`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setColor(0x0099FF)
      .addFields(
        { name: 'ID', value: targetUser.id, inline: true },
        // FIX: Use full timestamp (:F) instead of relative (:R)
        { name: 'Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`, inline: true }, 
        // FIX: Use full timestamp (:F) instead of relative (:R)
        { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: true },
        // FIX: Use role pings for every role
        { name: `Roles (${member.roles.cache.size - 1})`, value: rolesValue.substring(0, 1024), inline: false },
        { name: 'Permissions', value: member.permissions.toArray().slice(0, 5).join(', ') + (member.permissions.toArray().length > 5 ? '...' : ''), inline: false },
        { name: 'Status', value: member.presence?.status || 'Offline', inline: true },
        { name: 'Boosting?', value: member.premiumSince ? 'Yes' : 'No', inline: true },
      )
      .setFooter({ text: `Nickname: ${member.nickname || 'None'}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
