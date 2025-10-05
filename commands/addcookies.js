// commands/addcookies.js (REPLACE - Premium GUI + User Tagging)
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
    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      return interaction.reply({ content: '❌ **Error:** Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      user = new User({ userId: targetUser.id });
    }

    user.cookies += amount;
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
      .setTitle('🍪 Cookies Granted')
      .setDescription(`Admin ${interaction.user} baked **${amount} cookies** for ${targetUser}.`)
      .addFields(
        { name: 'Target User', value: `${targetUser}`, inline: true },
        { name: 'Amount Added', value: `**+${amount}** 🍪`, inline: true },
        { name: 'New Cookie Count', value: `**${user.cookies}** 🍪`, inline: true }
      )
      .setColor(0x00FF00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
