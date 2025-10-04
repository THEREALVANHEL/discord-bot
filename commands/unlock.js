// commands/unlock.js (REPLACE - Premium GUI)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
      return interaction.reply({ content: '❌ **Error:** I cannot manage this channel.', ephemeral: true });
    }

    try {
      // Restore permissions for @everyone (null resets to default/inherits)
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null,
        AddReactions: null,
        ViewThread: null,
        CreatePublicThreads: null,
        CreatePrivateThreads: null,
      });

      // Remove from locks Map if present
      client.locks.delete(channel.id);

      const unlockEmbed = new EmbedBuilder()
        .setTitle('🔓 Channel Unlocked')
        .setDescription(`${channel} has been unlocked by ${interaction.user}. Messaging and thread creation restored.`)
        .setColor(0x00FF00)
        .setTimestamp()
        .setFooter({ text: `Unlocked by ${interaction.user.tag}` });

      await interaction.reply({ embeds: [unlockEmbed] });

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Channel Unlock', channel, interaction.user, 'Manual unlock');

    } catch (error) {
      console.error('Unlock error:', error);
      await interaction.reply({ content: '❌ **Error:** Failed to unlock channel. Check bot permissions (Manage Channels).', ephemeral: true });
    }
  },
};
