// commands/warnlist.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('View warnings of a user.')
    .addUser Option(option =>
      option.setName('target')
        .setDescription('User  to view warnings for')
        .setRequired(true)),
  async execute(interaction) {
    const targetUser  = interaction.options.getUser ('target');

    let user = await User.findOne({ userId: targetUser .id });
    if (!user || !user.warnings.length) {
      return interaction.reply({ content: `${targetUser .tag} has no warnings.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Warnings for ${targetUser .tag}`)
      .setColor(0xFFA500)
      .setTimestamp();

    user.warnings.forEach((warn, i) => {
      embed.addFields({
        name: `Warning #${i + 1}`,
        value: `Reason: ${warn.reason}\nModerator: <@${warn.moderatorId}>\nDate: <t:${Math.floor(new Date(warn.date).getTime() / 1000)}:F>`,
      });
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
