// commands/lock.js (REPLACE - Removed ping, disabled threads, Premium GUI)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel (deny sending messages for @everyone).')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to lock (defaults to current)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Auto-unlock after duration (e.g., 1h, optional)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for lock')
        .setRequired(false)),
  async execute(interaction, client, logModerationAction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!channel.manageable) {
      return interaction.reply({ content: '❌ **Error:** I cannot manage this channel.', ephemeral: true });
    }

    try {
      // Deny send messages, add reactions, and thread creation for @everyone
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
        AddReactions: false,
        ViewThread: false,           // Deny viewing existing threads
        CreatePublicThreads: false,  // Deny creating new threads
        CreatePrivateThreads: false, // Deny creating private threads (if channel is text)
      });

      let endTime = null;
      let durationMsg = '🔒 **permanently**';

      if (durationStr) {
        const durationMs = ms(durationStr);
        if (!durationMs) {
          return interaction.reply({ content: '❌ **Error:** Invalid duration format.', ephemeral: true });
        }
        endTime = Date.now() + durationMs;
        client.locks.set(channel.id, { endTime, reason });
        durationMsg = `for **${durationStr}** (until <t:${Math.floor(endTime / 1000)}:R>)`;

        // Auto-unlock
        setTimeout(async () => {
          try {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
              SendMessages: null,
              AddReactions: null,
              ViewThread: null,
              CreatePublicThreads: null,
              CreatePrivateThreads: null,
            });
            client.locks.delete(channel.id);
            const unlockEmbed = new EmbedBuilder()
              .setTitle('🔓 Channel Unlocked')
              .setDescription(`${channel} is now unlocked as the temporary lock expired.`)
              .setColor(0x00FF00)
              .setTimestamp();
            channel.send({ embeds: [unlockEmbed] }).catch(() => {});
          } catch (e) { console.error('Auto-unlock error:', e); }
        }, durationMs);
      }

      const lockEmbed = new EmbedBuilder()
        .setTitle('🔒 Channel Locked')
        .setDescription(`${channel} has been locked ${durationMsg}.`)
        .addFields(
            { name: 'Reason', value: reason }
        )
        .setColor(0xFF0000)
        .setTimestamp()
        .setFooter({ text: `Locked by ${interaction.user.tag}` });

      await interaction.reply({ embeds: [lockEmbed] });

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Channel Lock', channel, interaction.user, reason, durationStr ? `Auto-unlock in ${durationStr}` : 'Permanent');

    } catch (error) {
      console.error('Lock error:', error);
      await interaction.reply({ content: '❌ **Error:** Failed to lock channel. Check bot permissions (Manage Channels).', ephemeral: true });
    }
  },
};
