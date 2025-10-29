// commands/lock.js (REPLACE - Removed invalid thread permissions, Premium GUI, Added deferReply)
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
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
    // ADDED: Defer reply (can be non-ephemeral as lock is public)
    await interaction.deferReply();

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Check bot permissions
    const botMember = await interaction.guild.members.fetch(client.user.id);
    if (!channel.permissionsFor(botMember).has(PermissionsBitField.Flags.ManageChannels) || !channel.permissionsFor(botMember).has(PermissionsBitField.Flags.ManageRoles)) {
        return interaction.editReply({ content: '❌ **Error:** I need "Manage Channels" and "Manage Roles/Permissions" permissions to lock/unlock channels.', ephemeral: true });
    }
    // Deprecated check, use permissionsFor
    // if (!channel.manageable) { ... }

    try {
      // FIX: Removed invalid or non-existent thread permissions
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
        AddReactions: false,
      });

      let endTime = null;
      let durationMsg = '🔒 **permanently**';
      let timeoutId = null; // To store timeout for potential cancellation

      if (durationStr) {
        const durationMs = ms(durationStr);
        if (!durationMs || durationMs < 5000) { // Min duration 5s
          // Use editReply
          return interaction.editReply({ content: '❌ **Error:** Invalid duration format or duration too short (min 5s). Use e.g., 10m, 1h.', ephemeral: true });
        }
        endTime = Date.now() + durationMs;
        durationMsg = `for **${durationStr}** (until <t:${Math.floor(endTime / 1000)}:R>)`;

        // Auto-unlock
        timeoutId = setTimeout(async () => {
          // Check if lock still exists in map before auto-unlocking
          if (client.locks && client.locks.has(channel.id)) {
            try {
              // Fetch channel again in case of cache issues
               const currentChannel = await client.channels.fetch(channel.id);
               if (!currentChannel) return; // Channel deleted

              await currentChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: null, // Reset to default/inherit
                AddReactions: null,
              });

              client.locks.delete(channel.id); // Remove from map after successful unlock

              const unlockEmbed = new EmbedBuilder()
                .setTitle('🔓 Channel Unlocked')
                .setDescription(`${currentChannel} is now unlocked as the temporary lock expired.`)
                .setColor(0x00FF00)
                .setTimestamp();
              await currentChannel.send({ embeds: [unlockEmbed] }).catch(console.error);

               // Log auto-unlock
               const settings = await Settings.findOne({ guildId: interaction.guild.id });
               if (logModerationAction && settings) {
                   await logModerationAction(interaction.guild, settings, 'Channel Auto-Unlock', currentChannel, client.user, `Lock duration expired (${durationStr})`);
               }

            } catch (e) {
                console.error(`Auto-unlock error for channel ${channel.id}:`, e);
                // Attempt to notify in channel if possible
                try {
                   await channel.send(`⚠️ Error during auto-unlock for ${channel}. Permissions might need manual reset.`).catch(()=>{});
                } catch {}
            }
          }
        }, durationMs);

         // Store lock info including the timeout ID
         if (!client.locks) client.locks = new Map(); // Ensure map exists
         client.locks.set(channel.id, { endTime, reason, timeoutId });

      } else {
           // For permanent locks, ensure no previous timer exists or clear it
           if (client.locks && client.locks.has(channel.id)) {
               const existingLock = client.locks.get(channel.id);
               if (existingLock.timeoutId) clearTimeout(existingLock.timeoutId);
           }
           if (!client.locks) client.locks = new Map();
           client.locks.set(channel.id, { endTime: null, reason, timeoutId: null }); // Store permanent lock marker
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

      // Use editReply
      await interaction.editReply({ embeds: [lockEmbed] });

      // Log
      try {
         const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
         if (logModerationAction && settings) {
            await logModerationAction(interaction.guild, settings, 'Channel Lock', channel, interaction.user, reason, durationStr ? `Auto-unlock in ${durationStr}` : 'Permanent');
         }
      } catch (logError) {
          console.error("Error logging channel lock:", logError);
      }

    } catch (error) {
      console.error('Lock error:', error);
      // Use editReply or followUp for error after defer
       try {
           await interaction.editReply({ content: '❌ **Error:** Failed to lock channel. Check bot permissions (Manage Channels/Roles).', ephemeral: true });
       } catch (replyError) {
            await interaction.followUp({ content: '❌ **Error:** Failed to lock channel. Check bot permissions (Manage Channels/Roles).', ephemeral: true }).catch(console.error);
       }
    }
  },
};
