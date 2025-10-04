// commands/removecookies.js
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
      return interaction.reply({ content: 'Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      return interaction.reply({ content: `${targetUser.tag} does not have any cookies yet.`, ephemeral: true });
    }

    user.cookies = Math.max(0, user.cookies - amount); // Ensure cookies don't go below 0
    await user.save();

    // Update cookie roles
    const member = interaction.guild.members.cache.get(targetUser.id);
    if (member) {
      const cookieRoles = interaction.client.config.cookieRoles;
      for (const roleConfig of cookieRoles) {
        if (member.roles.cache.has(roleConfig.roleId)) {
          await member.roles.remove(roleConfig.roleId).catch(() => {});
        }
      }
      const newCookieRole = cookieRoles
        .filter(r => r.cookies <= user.cookies)
        .sort((a, b) => b.cookies - a.cookies)[0];
      if (newCookieRole) {
        await member.roles.add(newCookieRole.roleId).catch(() => {});
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('Cookies Removed')
      .setDescription(`Removed ${amount} cookies from ${targetUser.tag}. They now have ${user.cookies} cookies.`)
      .setColor(0xFF0000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
