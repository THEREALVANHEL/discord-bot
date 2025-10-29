// commands/addcookies.js (REPLACE - Fixed infinite role add/remove loop + Added deferReply)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addcookies')
    .setDescription('Add cookies to a user.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to add cookies to')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of cookies to add')
        .setRequired(true)),
  async execute(interaction) {
    // ADDED: Defer reply immediately
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      // Use editReply
      return interaction.editReply({ content: '❌ **Error:** Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      user = new User({ userId: targetUser.id });
    }

    user.cookies += amount;
    await user.save();

    // Update cookie roles (FIXED logic)
    const member = interaction.guild.members.cache.get(targetUser.id);
    if (member) {
      // Ensure config and roles are available
      const cookieRoles = interaction.client.config?.cookieRoles || [];

      // FIX: Find the single highest eligible role
      const targetCookieRole = cookieRoles
        .filter(r => r.cookies <= user.cookies)
        .sort((a, b) => b.cookies - a.cookies)[0]; // Sort descending by cookie requirement

      const targetCookieRoleId = targetCookieRole ? targetCookieRole.roleId : null;

      // Use try-catch for role operations
      try {
        for (const roleConfig of cookieRoles) {
          const roleId = roleConfig.roleId;
          if (!roleId) continue; // Skip if roleId is missing in config

          const hasRole = member.roles.cache.has(roleId);

          if (roleId === targetCookieRoleId) {
            // If this is the correct role but the user doesn't have it, add it.
            if (!hasRole) {
              await member.roles.add(roleId);
            }
          } else {
            // If the user has a different cookie role, remove it.
            if (hasRole) {
              await member.roles.remove(roleId);
            }
          }
        }
      } catch (roleError) {
          console.error(`Error updating cookie roles for ${targetUser.tag}:`, roleError);
          // Optionally inform the user ephemerally
          // await interaction.followUp({ content: 'Error updating roles, please check my permissions.', ephemeral: true });
      }
    } else {
        console.log(`Could not find member ${targetUser.tag} (${targetUser.id}) to update cookie roles.`);
    }


    const embed = new EmbedBuilder()
      .setTitle('🍪 Cookies Granted')
      .setDescription(`Admin ${interaction.user} baked **${amount} cookies** for ${targetUser}.`)
      .addFields(
        { name: 'Target User', value: `${targetUser}`, inline: true },
        { name: 'Amount Added', value: `**+${amount}** 🍪`, inline: true },
        { name: 'New Cookie Count', value: `**${user.cookies}** 🍪`, inline: true }
      )
      .setColor(0x00FF00)
      .setTimestamp();

    // Use editReply
    await interaction.editReply({ embeds: [embed] });
  },
};
