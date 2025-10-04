// commands/addcookiesall.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addcookiesall')
    .setDescription('Add cookies to all members in the server.')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of cookies to add to everyone')
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
      if (!user) {
        user = new User({ userId: member.user.id });
      }

      user.cookies += amount;
      await user.save();
      updatedCount++;

      // Update cookie roles for each member
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
      .setTitle('Cookies Added to All')
      .setDescription(`Successfully added ${amount} cookies to ${updatedCount} members.`)
      .setColor(0x00FF00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], ephemeral: true });
  },
};
