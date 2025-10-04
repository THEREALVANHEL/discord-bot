// events/guildAuditLogEntryCreate.js
const Settings = require('../models/Settings');
const { AuditLogEvent, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'guildAuditLogEntryCreate',
  async execute(auditLogEntry, guild, client) {
    const settings = await Settings.findOne({ guildId: guild.id });
    if (!settings || !settings.modlogChannelId) return;

    const modlogChannel = guild.channels.cache.get(settings.modlogChannelId);
    if (!modlogChannel) return;

    const { action, target, executor, reason } = auditLogEntry;

    let title = 'Audit Log Event';
    let description = '';
    let color = 0x808080; // Grey default

    switch (action) {
      case AuditLogEvent.ChannelCreate:
        title = 'Channel Created';
        description = `Channel: ${target.name} (<#${target.id}>)`;
        color = 0x00FF00;
        break;
      case AuditLogEvent.ChannelDelete:
        title = 'Channel Deleted';
        description = `Channel: ${target.name}`;
        color = 0xFF0000;
        break;
      case AuditLogEvent.ChannelUpdate:
        title = 'Channel Updated';
        description = `Channel: ${target.name} (<#${target.id}>)`;
        color = 0xFFA500;
        break;
      case AuditLogEvent.RoleCreate:
        title = 'Role Created';
        description = `Role: ${target.name} (<@&${target.id}>)`;
        color = 0x00FF00;
        break;
      case AuditLogEvent.RoleDelete:
        title = 'Role Deleted';
        description = `Role: ${target.name}`;
        color = 0xFF0000;
        break;
      case AuditLogEvent.RoleUpdate:
        title = 'Role Updated';
        description = `Role: ${target.name} (<@&${target.id}>)`;
        color = 0xFFA500;
        break;
      case AuditLogEvent.MemberKick:
        title = 'Member Kicked';
        description = `Member: ${target.tag} (${target.id})`;
        color = 0xFFA500;
        break;
      case AuditLogEvent.MemberBanAdd:
        // Handled by guildBanAdd, but this is a fallback/additional info
        title = 'Member Banned (Audit Log)';
        description = `Member: ${target.tag} (${target.id})`;
        color = 0xFF0000;
        break;
      case AuditLogEvent.MemberUpdate:
        // This can be very noisy, only log specific changes if needed
        // For example, nickname changes, avatar changes, etc.
        // For now, we'll keep it general or skip to avoid spam.
        return; // Skip for now to avoid spam
      case AuditLogEvent.MessageDelete:
        // This can be noisy if not filtered, messageDelete event is usually sufficient
        // Only log if the executor is different from the message author (e.g., mod deleting)
        if (auditLogEntry.extra && auditLogEntry.extra.channel && auditLogEntry.extra.count) {
          title = 'Messages Purged';
          description = `Channel: <#${auditLogEntry.extra.channel.id}>\nMessages Deleted: ${auditLogEntry.extra.count}`;
          color = 0xFF0000;
        } else {
          return; // Skip if not a bulk delete
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
        { name: 'Executor', value: `${executor.tag} (${executor.id})` },
        { name: 'Reason', value: reason || 'No reason provided' },
      )
      .setTimestamp();

    modlogChannel.send({ embeds: [embed] });
  },
};
