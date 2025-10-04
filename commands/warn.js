// commands/warn.js (REPLACE - Refined for better public visibility)
const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user.')
    .addUser Option(option =>
      option.setName('target')
        .setDescription('User  to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for warning')
        .setRequired(true)),
  async execute(interaction, client, logModerationAction) {
    const target = interaction.options.getUser ('target');
    const reason = interaction.options.getString('reason');

    if (target.bot) {
      return interaction.reply({ content: 'You cannot warn bots.', ephemeral: true });
    }
    if (target.id === interaction.user.id) {
      return interaction.reply({ content: 'You cannot warn yourself.', ephemeral: true });
    }

    let user = await User.findOne({ userId: target.id });
    if (!user) {
      user = new User({ userId: target.id });
    }

    user.warnings.push({
      reason,
      moderatorId: interaction.user.id,
      date: new Date(),
    });

    await user.save();

    // DM user (private)
    try {
      await target.send(`You have been warned in ${interaction.guild.name} for: ${reason}\nTotal warnings: ${user.warnings.length}`);
    } catch {}

    // Public confirmation (visible to everyone)
    await interaction.reply({ 
      content: `⚠️ **Warning Issued:** ${target.tag} has been warned by ${interaction.user.tag} for: \`${reason}\`. (Total warnings: ${user.warnings.length})`, 
      ephemeral: false 
    });

    // Log
    const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
    await logModerationAction(interaction.guild, settings, 'Warn', target, interaction.user, reason);

    // Auto timeout after 5 warnings (configurable later)
    if (user.warnings.length >= 5) {
      const member = interaction.guild.members.cache.get(target.id);
      if (member) {
        try {
          await member.timeout(3600000, 'Auto timeout: 5 warnings reached');
          // Public auto-action message
          await interaction.followUp({ 
            content: `🚨 **Auto-Action:** ${target.tag} has been automatically timed out for 1 hour (5 warnings reached).`, 
            ephemeral: false 
          });
          await logModerationAction(interaction.guild, settings, 'Auto Timeout', target, client.user, '5 warnings reached');
          try {
            await target.send(`You have been automatically timed out for 1 hour due to accumulating 5 warnings.`);
          } catch {}
        } catch {}
      }
    }
  },
};
