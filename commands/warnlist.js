// commands/warnlist.js (REPLACE - Removed ephemeral, Premium GUI)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnlist')
    .setDescription('View warnings of a user.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('User  to view warnings for')
        .setRequired(true)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    await interaction.deferReply(); // Defer to prevent "Application did not respond"

    let user = await User.findOne({ userId: targetUser.id });
    if (!user || !user.warnings.length) {
      return interaction.editReply({ content: `✅ **No Warnings:** ${targetUser.tag} has no warnings on record.`, ephemeral: false });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🚨 Warning Log for ${targetUser.tag}`)
      .setColor(0xFFA500)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
      .setTimestamp()
      .setFooter({ text: `Total Warnings: ${user.warnings.length}` });

    user.warnings.forEach((warn, i) => {
        // Truncate long reasons
        const reason = warn.reason.length > 50 ? warn.reason.substring(0, 47) + '...' : warn.reason;

      embed.addFields({
        name: `Warning #${i + 1}`,
        value: `Reason: \`${reason}\`\nModerator: <@${warn.moderatorId}>\nDate: <t:${Math.floor(new Date(warn.date).getTime() / 1000)}:F>`,
      });
    });

    await interaction.editReply({ embeds: [embed] }); // Removed ephemeral: true
  },
};
