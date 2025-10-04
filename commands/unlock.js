// commands/unlock.js (NEW)
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel (restore permissions for @everyone).')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to unlock (defaults to current)')
        .setRequired(false)),
  async execute(interaction, client, logModerationAction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (!channel.manageable) {
      return interaction.reply({ content: 'I cannot manage this channel.', ephemeral: true });
    }

    try {
      // Restore permissions for @everyone
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null,
        AddReactions: null,
      });

      // Remove from locks Map if present
      client.locks.delete(channel.id);

      await interaction.reply({ content: `🔓 ${channel} has been unlocked.` });

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Channel Unlock', channel, interaction.user, 'Manual unlock');

    } catch (error) {
      console.error('Unlock error:', error);
      await interaction.reply({ content: 'Failed to unlock channel. Check bot permissions (Manage Channels).', ephemeral: true });
    }
  },
};
