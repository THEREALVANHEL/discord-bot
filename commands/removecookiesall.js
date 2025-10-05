// commands/removecookiesall.js (REPLACE - Fixed infinite role add/remove loop)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removecookiesall')
    .setDescription('Remove cookies from all members in the server.')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of cookies to remove from everyone')
        .setRequired(true)),
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      return interaction.reply({ content: 'Amount must be a positive number.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true }); // Defer reply as this can take time

    const members = await interaction.guild.members.fetch();
    let updatedCount = 0;

    for (const member of members.values()) {
      if (member.user.bot) continue; // Skip bots

      let user = await User.findOne({ userId: member.user.id });
      if (user) {
        user.cookies = Math.max(0, user.cookies - amount); // Ensure cookies don't go below 0
        await user.save();
        updatedCount++;

        // Update cookie roles for each member (FIXED logic)
        const cookieRoles = interaction.client.config.cookieRoles;

        // FIX: Find the single highest eligible role
        const targetCookieRole = cookieRoles
          .filter(r => r.cookies <= user.cookies)
          .sort((a, b) => b.cookies - a.cookies)[0];
          
        const targetCookieRoleId = targetCookieRole ? targetCookieRole.roleId : null;

        for (const roleConfig of cookieRoles) {
          const roleId = roleConfig.roleId;
          const hasRole = member.roles.cache.has(roleId);
          
          if (roleId === targetCookieRoleId) {
              // If this is the correct role but the user doesn't have it, add it.
              if (!hasRole) {
                  await member.roles.add(roleId).catch(() => {});
              }
          } else {
              // If the user has a different cookie role, remove it.
              if (hasRole) {
                  await member.roles.remove(roleId).catch(() => {});
              }
          }
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('Cookies Removed from All')
      .setDescription(`Successfully removed ${amount} cookies from ${updatedCount} members.`)
      .setColor(0xFF0000)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], ephemeral: true });
  },
};
