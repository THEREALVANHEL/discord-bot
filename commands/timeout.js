// commands/timeout.js (REPLACE - Success reply now visible to everyone)
const { SlashCommandBuilder } = require('discord.js');
const ms = require('ms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user for a specified duration.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User  to timeout')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 10m, 1h, 1d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for timeout')
        .setRequired(true)),
  async execute(interaction, client, logModerationAction) {
    const target = interaction.options.getUser('target');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');

    const member = interaction.guild.members.cache.get(target.id);
    if (!member) {
      return interaction.reply({ content: 'User  not found in this server.', ephemeral: true });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({ content: 'You cannot timeout yourself.', ephemeral: true });
    }

    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 10000 || durationMs > 2419200000) {
      return interaction.reply({ content: 'Valid duration: 10s to 28d (e.g., 10m, 1h).', ephemeral: true });
    }

    try {
      await member.timeout(durationMs, reason);

      // DM the user (private)
      try {
        await target.send(`You have been timed out in ${interaction.guild.name} for ${durationStr} for: \`${reason}\`. You can speak again on <t:${Math.floor(Date.now() + durationMs) / 1000}:F>.`);
      } catch (dmError) {
        console.log(`Could not DM ${target.tag}: ${dmError.message}`);
      }

      // Public confirmation (visible to everyone)
      await interaction.reply({
        content: `⏰ **Timeout Executed:** ${target.tag} has been timed out by ${interaction.user.tag} for ${durationStr} due to: \`${reason}\`.`,
        ephemeral: false
      });

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Timeout', target, interaction.user, reason, `Duration: ${durationStr}`);

    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Failed to timeout user. Check bot permissions (Moderate Members).', ephemeral: true });
    }
  },
};
