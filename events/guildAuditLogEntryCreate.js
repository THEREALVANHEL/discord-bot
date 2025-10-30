// events/guildAuditLogEntryCreate.js (SIMPLIFIED - For ModLog Channel)
const Settings = require('../models/Settings');
const { AuditLogEvent, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'guildAuditLogEntryCreate',
  async execute(auditLogEntry, guild, client) {
    const settings = await Settings.findOne({ guildId: guild.id });
    if (!settings?.modlogChannelId) return;

    const modlogChannel = guild.channels.cache.get(settings.modlogChannelId);
    if (!modlogChannel) return;

    const { action, target, executor, reason } = auditLogEntry;
    
    let description = '';
    let color = 0x808080;
    let emoji = '📋';

    switch (action) {
      case AuditLogEvent.MemberKick:
        emoji = '👢';
        description = `**Member Kicked**\n${target?.tag || 'Unknown'} kicked by ${executor?.tag}`;
        color = 0xFFA500;
        break;
        
      case AuditLogEvent.MemberBanAdd:
        emoji = '🔨';
        description = `**Member Banned**\n${target?.tag || 'Unknown'} banned by ${executor?.tag}`;
        color = 0xFF0000;
        break;
        
      case AuditLogEvent.MemberBanRemove:
        emoji = '✅';
        description = `**Member Unbanned**\n${target?.tag || 'Unknown'} unbanned by ${executor?.tag}`;
        color = 0x00FF00;
        break;

      case AuditLogEvent.ChannelCreate:
        emoji = '➕';
        description = `**Channel Created**\n${target?.name} created by ${executor?.tag}`;
        color = 0x00FF00;
        break;
        
      case AuditLogEvent.ChannelDelete:
        emoji = '➖';
        description = `**Channel Deleted**\n${target?.name} deleted by ${executor?.tag}`;
        color = 0xFF0000;
        break;

      case AuditLogEvent.RoleCreate:
        emoji = '➕';
        description = `**Role Created**\n${target?.name} created by ${executor?.tag}`;
        color = 0x00FF00;
        break;
        
      case AuditLogEvent.RoleDelete:
        emoji = '➖';
        description = `**Role Deleted**\n${target?.name} deleted by ${executor?.tag}`;
        color = 0xFF0000;
        break;

      default:
        return; // Ignore other events
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setDescription(`${emoji} ${description}`)
      .setFooter({ text: reason || 'No reason provided' })
      .setTimestamp();

    await modlogChannel.send({ embeds: [embed] }).catch(console.error);
  },
};

// ===== events/guildBanAdd.js (SIMPLIFIED) =====
const Settings2 = require('../models/Settings');
const { EmbedBuilder: EmbedBuilder2 } = require('discord.js');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban, client) {
    const settings = await Settings2.findOne({ guildId: ban.guild.id });
    if (!settings?.modlogChannelId) return;

    const modlogChannel = ban.guild.channels.cache.get(settings.modlogChannelId);
    if (!modlogChannel) return;

    const embed = new EmbedBuilder2()
      .setColor(0xFF0000)
      .setDescription(`🔨 **Ban Added**\n${ban.user.tag} (${ban.user.id})`)
      .setFooter({ text: ban.reason || 'No reason provided' })
      .setTimestamp();

    await modlogChannel.send({ embeds: [embed] }).catch(console.error);
  },
};
