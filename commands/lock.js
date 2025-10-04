// commands/lock.js (NEW - Completed)
const { SlashCommandBuilder } = require('discord.js');
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
      return interaction.reply({ content: 'I cannot manage this channel.', ephemeral: true });
    }

    try {
      // Deny send messages for @everyone
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
        AddReactions: false,
      });

      let endTime = null;
      if (durationStr) {
        const durationMs = ms(durationStr);
        if (!durationMs) {
          return interaction.reply({ content: 'Invalid duration format.', ephemeral: true });
        }
        endTime = Date.now() + durationMs;
        client.locks.set(channel.id, { endTime, reason });

        // Auto-unlock
        setTimeout(async () => {
          try {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
              SendMessages: null,
              AddReactions: null,
            });
            client.locks.delete(channel.id);
            channel.send(`🔓 Channel unlocked automatically.`);
          } catch {}
        }, durationMs);
      }

      await interaction.reply({ content: `🔒 ${channel} has been locked${durationStr ? ` for ${durationStr}` : ''}. Reason: ${reason}` });

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Channel Lock', channel, interaction.user, reason, durationStr ? `Auto-unlock in ${durationStr}` : 'Permanent until unlocked');

      // Ping lead mod role
      if (client.config.roles.leadMod) {
        await channel.send(`<@&${client.config.roles.leadMod}> - Channel locked by ${interaction.user}.`);
      }

    } catch (error) {
      console.error('Lock error:', error);
      await interaction.reply({ content: 'Failed to lock channel. Check bot permissions (Manage Channels).', ephemeral: true });
    }
  },
};
