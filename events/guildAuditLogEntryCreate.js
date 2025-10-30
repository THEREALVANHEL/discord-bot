// events/guildAuditLogEntryCreate.js (REPLACE - Removed MemberBanAdd block, expanded MessageDelete)
const Settings = require('../models/Settings');
const { AuditLogEvent, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'guildAuditLogEntryCreate',
  async execute(auditLogEntry, guild, client) {
    const settings = await Settings.findOne({ guildId: guild.id });
    if (!settings || !settings.modlogChannelId) return;

    const modlogChannel = guild.channels.cache.get(settings.modlogChannelId);
    if (!modlogChannel) return;

    const { action, target, executor, reason, extra } = auditLogEntry;

    let title = 'Audit Log Event';
    let description = '';
    let color = 0x808080; // Grey default

    // Safety check: if target is null for actions that require it, skip.
    if (!target && [AuditLogEvent.MemberKick, AuditLogEvent.ChannelCreate, AuditLogEvent.ChannelUpdate, AuditLogEvent.ChannelDelete, AuditLogEvent.RoleCreate, AuditLogEvent.RoleDelete, AuditLogEvent.RoleUpdate].includes(action)) {
        return; 
    }

    switch (action) {
      case AuditLogEvent.ChannelCreate:
        title = 'Channel Created';
        description = `Channel: ${target?.name} (<#${target?.id}>)`;
        color = 0x00FF00;
        break;
      case AuditLogEvent.ChannelDelete:
        title = 'Channel Deleted';
        description = `Channel: ${target?.name}`;
        color = 0xFF0000;
        break;
      case AuditLogEvent.ChannelUpdate:
        title = 'Channel Updated';
        description = `Channel: ${target?.name} (<#${target?.id}>)`;
        color = 0xFFA500;
        break;
      case AuditLogEvent.RoleCreate:
        title = 'Role Created';
        description = `Role: ${target?.name} (<@&${target?.id}>)`;
        color = 0x00FF00;
        break;
      case AuditLogEvent.RoleDelete:
        title = 'Role Deleted';
        description = `Role: ${target?.name}`;
        color = 0xFF0000;
        break;
      case AuditLogEvent.RoleUpdate:
        title = 'Role Updated';
        description = `Role: ${target?.name} (<@&${target?.id}>)`;
        color = 0xFFA500;
        break;
      case AuditLogEvent.MemberKick:
        title = 'Member Kicked';
        description = `Member: ${target?.tag || 'Unknown User'} (${target?.id || 'N/A'})`; 
        color = 0xFFA500;
        break;
      case AuditLogEvent.MemberBanAdd:
        // FIX: Now logging this
        title = 'Member Banned (Audit)';
        description = `Member: ${target?.tag || 'Unknown User'} (${target?.id || 'N/A'})`;
        color = 0xFF0000;
        break;
      case AuditLogEvent.MemberUpdate:
        // This can be very noisy, skip to avoid spam. (Handled by guildMemberUpdate)
        return; 
      case AuditLogEvent.MessageDelete:
        // FIX: Expanded to log single mod deletes + bulk
        if (extra && extra.channel && extra.count) {
          title = 'Messages Purged';
          description = `Channel: <#${extra.channel.id}>\nMessages Deleted: ${extra.count}`;
          color = 0xFF0000;
        } else if (extra && extra.channel) {
          // Log single message delete by a mod
          title = 'Message Deleted by Mod';
          // Target is the user whose message was deleted
          description = `User: ${target?.tag || 'Unknown User'} (${target?.id || 'N/A'})\nChannel: <#${extra.channel.id}>`;
          color = 0xFF0000;
        } else {
          // Unknown message delete, skip
          return;
        }
        break;
      default:
        return; // Ignore other audit log events for now
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setDescription(description)
      .addFields(
        { name: 'Executor', value: `${executor?.tag || 'Unknown'} (${executor?.id || 'N/A'})` },
        { name: 'Reason', value: reason || 'No reason provided' },
      )
      .setTimestamp();

    modlogChannel.send({ embeds: [embed] });
  },
};
