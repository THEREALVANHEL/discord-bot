// commands/userinfo.js (REPLACE - Added truncation for Roles field)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('View user information.')
    .addUserOption(option => 
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
      .map(r => `<@&${r.id}>`);
      
    let rolesValue = roles.length > 0 ? roles.join(', ') : 'No roles (excluding @everyone)';

    // FIX: Truncate the roles string to fit Discord embed limit (1024 chars)
    if (rolesValue.length > 1000) { 
        rolesValue = rolesValue.substring(0, 1000) + '... (Too many roles to display)';
    }

    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.tag} Info`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setColor(0x0099FF)
      .addFields(
        { name: 'ID', value: targetUser.id, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`, inline: true }, 
        { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: true },
        // Use the truncated value
        { name: `Roles (${member.roles.cache.size - 1})`, value: rolesValue, inline: false },
        { name: 'Permissions', value: member.permissions.toArray().slice(0, 5).join(', ') + (member.permissions.toArray().length > 5 ? '...' : ''), inline: false },
        { name: 'Status', value: member.presence?.status || 'Offline', inline: true },
        { name: 'Boosting?', value: member.premiumSince ? 'Yes' : 'No', inline: true },
      )
      .setFooter({ text: `Nickname: ${member.nickname || 'None'}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
