// commands/unlock.js (REPLACE - Premium GUI, Fixed: Removed invalid thread permissions)
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
    
    // Defer for speed and to combat timeout issues
    await interaction.deferReply();

    if (!channel.manageable) {
      // Use editReply since we deferred
      return interaction.editReply({ content: '❌ **Error:** I cannot manage this channel.', ephemeral: true });
    }

    try {
      // FIX: Restore ONLY SendMessages and AddReactions. The thread permissions 
      // (ViewThread, CreatePublicThreads, CreatePrivateThreads) are known to cause API errors.
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null,
        AddReactions: null,
      });

      // Remove from locks Map if present
      client.locks.delete(channel.id);

      const unlockEmbed = new EmbedBuilder()
        .setTitle('🔓 Channel Unlocked')
        .setDescription(`${channel} has been unlocked by ${interaction.user}. Messaging restored.`)
        .setColor(0x00FF00)
        .setTimestamp()
        .setFooter({ text: `Unlocked by ${interaction.user.tag}` });

      // Use editReply to send the public success message
      await interaction.editReply({ embeds: [unlockEmbed] });

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Channel Unlock', channel, interaction.user, 'Manual unlock');

    } catch (error) {
      console.error('Unlock error:', error);
      // Send the ephemeral error message as a follow up
      await interaction.followUp({ content: '❌ **Error:** Failed to unlock channel. Check bot permissions (Manage Channels).', ephemeral: true });
    }
  },
};
