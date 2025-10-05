// commands/removecookies.js (REPLACE - Fixed infinite role add/remove loop)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removecookies')
    .setDescription('Remove cookies from a user.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to remove cookies from')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of cookies to remove')
        .setRequired(true)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      return interaction.reply({ content: '❌ **Error:** Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      return interaction.reply({ content: `⚠️ **Warning:** ${targetUser} does not have any cookies yet.`, ephemeral: true });
    }

    user.cookies = Math.max(0, user.cookies - amount);
    await user.save();

    // Update cookie roles (FIXED logic)
    const member = interaction.guild.members.cache.get(targetUser.id);
    if (member) {
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

    const embed = new EmbedBuilder()
      .setTitle('🔪 Cookies Smashed')
      .setDescription(`Admin ${interaction.user} smashed **${amount} cookies** from ${targetUser}.`)
      .addFields(
        { name: 'Target User', value: `${targetUser}`, inline: true },
        { name: 'Amount Removed', value: `**-${amount}** 🍪`, inline: true },
        { name: 'New Cookie Count', value: `**${user.cookies}** 🍪`, inline: true }
      )
      .setColor(0xFF0000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
