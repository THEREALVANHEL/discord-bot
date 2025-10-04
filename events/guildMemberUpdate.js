// events/guildMemberUpdate.js
const Settings = require('../models/Settings');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, client) {
    const settings = await Settings.findOne({ guildId: newMember.guild.id });
    if (!settings || !settings.modlogChannelId) return;

    const modlogChannel = newMember.guild.channels.cache.get(settings.modlogChannelId);
    if (!modlogChannel) return;

    let embed = null;
    let shouldSend = false;

    // Role changes
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
    const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

    if (addedRoles.size > 0) {
      embed = new EmbedBuilder()
        .setTitle('👑 Member Roles Added')
        .setColor(0x00FF00) // Green
        .setDescription(`**${newMember.user.tag}** had roles added.`)
        .addFields(
          { name: 'Member', value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
          { name: 'Added Roles', value: addedRoles.map(r => `<@&${r.id}>`).join(', ') || 'None', inline: false },
        )
        .setTimestamp();
      shouldSend = true;
    }

    if (removedRoles.size > 0) {
      embed = new EmbedBuilder()
        .setTitle('👑 Member Roles Removed')
        .setColor(0xFF0000) // Red
        .setDescription(`**${newMember.user.tag}** had roles removed.`)
        .addFields(
          { name: 'Member', value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
          { name: 'Removed Roles', value: removedRoles.map(r => `<@&${r.id}>`).join(', ') || 'None', inline: false },
        )
        .setTimestamp();
      shouldSend = true;
    }

    // Timeout changes (communicationDisabledUntil)
    if (oldMember.communicationDisabledUntil !== newMember.communicationDisabledUntil) {
      const timeoutEnd = newMember.communicationDisabledUntil;
      let action = '⏰ Timeout Removed';
      let color = 0x00FF00; // Green

      if (timeoutEnd) {
        action = '⏰ Member Timed Out';
        color = 0xFFA500; // Orange
      }

      embed = new EmbedBuilder()
        .setTitle(action)
        .setColor(color)
        .setDescription(`**${newMember.user.tag}**'s timeout status changed.`)
        .addFields(
          { name: 'Member', value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
          { name: 'Timeout Until', value: timeoutEnd ? `<t:${Math.floor(timeoutEnd.getTime() / 1000)}:F>` : 'No timeout', inline: true },
        )
        .setTimestamp();
      shouldSend = true;
    }

    // Nickname changes
    if (oldMember.nickname !== newMember.nickname && newMember.nickname) {
      embed = new EmbedBuilder()
        .setTitle('📝 Nickname Changed')
        .setColor(0x0099FF) // Blue
        .setDescription(`**${newMember.user.tag}** changed their nickname.`)
        .addFields(
          { name: 'Member', value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
          { name: 'Old Nickname', value: oldMember.nickname || 'None (default username)', inline: true },
          { name: 'New Nickname', value: newMember.nickname, inline: true },
        )
        .setTimestamp();
      shouldSend = true;
    }

    // Boost status changes (premium booster)
    if (oldMember.premiumSince !== newMember.premiumSince) {
      const action = newMember.premiumSince ? 'Boost Added' : 'Boost Removed';
      const color = newMember.premiumSince ? 0x57F287 : 0xED4245; // Green for added, Red for removed

      embed = new EmbedBuilder()
        .setTitle(`⭐ Server Boost ${action}`)
        .setColor(color)
        .setDescription(`**${newMember.user.tag}** ${action.toLowerCase()}.`)
        .addFields(
          { name: 'Member', value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
          { name: 'Boost Since', value: newMember.premiumSince ? `<t:${Math.floor(newMember.premiumSince.getTime() / 1000)}:F>` : 'N/A', inline: true },
        )
        .setTimestamp();
      shouldSend = true;
    }

    // If any change occurred, send the embed
    if (shouldSend && embed) {
      try {
        await modlogChannel.send({ embeds: [embed] });
      } catch (error) {
        console.error('Failed to send modlog for guildMemberUpdate:', error);
      }
    }
  },
};
