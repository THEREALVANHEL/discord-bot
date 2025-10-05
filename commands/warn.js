// commands/warn.js (REPLACE - Refined for better public visibility + GUI Update + User Tagging)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const ms = require('ms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for warning')
        .setRequired(true)),
  async execute(interaction, client, logModerationAction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');
    const member = interaction.guild.members.cache.get(target.id);

    if (target.bot) {
      return interaction.reply({ content: '❌ **Error:** You cannot warn bots.', ephemeral: true });
    }
    if (target.id === interaction.user.id) {
      return interaction.reply({ content: '❌ **Error:** You cannot warn yourself.', ephemeral: true });
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
    const newWarningCount = user.warnings.length;

    // DM user (private)
    try {
      await target.send(`You have been warned in ${interaction.guild.name} for: **${reason}**\nTotal warnings: **${newWarningCount}**`);
    } catch {}

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Warning Issued')
      .setDescription(`Moderator ${interaction.user} issued a warning.`)
      .addFields(
        { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Total Warnings', value: `**${newWarningCount}**`, inline: true }
      )
      .setColor(0xFFA500)
      .setTimestamp();

    // Public confirmation (visible to everyone)
    await interaction.reply({ embeds: [embed], ephemeral: false });

    // Log
    const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
    await logModerationAction(interaction.guild, settings, 'Warn', target, interaction.user, reason);

    // Auto timeout after 5 warnings (configurable later)
    if (newWarningCount >= 5) {
      if (member) {
        try {
          const timeoutDuration = ms('1h');
          await member.timeout(timeoutDuration, 'Auto timeout: 5 warnings reached');
          
          const autoTimeoutEmbed = new EmbedBuilder()
            .setTitle('🚨 Automatic Action: Timeout')
            .setDescription(`${target} has reached **${newWarningCount} warnings** and was automatically timed out for **1 hour** to prevent further issues.`)
            .setColor(0xDC143C)
            .setTimestamp();

          // Public auto-action message
          await interaction.followUp({ embeds: [autoTimeoutEmbed], ephemeral: false });
          await logModerationAction(interaction.guild, settings, 'Auto Timeout', target, client.user, '5 warnings reached', 'Duration: 1h');
          try {
            await target.send(`You have been automatically timed out for 1 hour due to accumulating 5 warnings.`);
          } catch {}
        } catch {}
      }
    }
  },
};
