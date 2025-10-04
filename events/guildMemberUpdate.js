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

    // Role changes
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
    const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

    if (addedRoles.size > 0) {
      const embed = new EmbedBuilder()
        .setTitle('Member Roles Updated')
        .setColor(0x00FF00) // Green for added roles
        .setDescription(`**${newMember.user.tag}** had roles added.`)
        .addFields(
          { name: 'Member', value: `${newMember.user.tag} (${newMember.user.id})` },
          { name: 'Added Roles', value: addedRoles.map(r => r.name).join(', ') || 'None' },
        )
        .setTimestamp();
      modlogChannel.send({ embeds: [embed] });
    }

    if (removedRoles.size > 0) {
      const embed = new EmbedBuilder()
        .setTitle('Member Roles Updated')
        .setColor(0xFF0000) // Red for removed roles
        .setDescription(`**${newMember.user.tag}** had roles removed.`)
        .addFields(
          { name: 'Member', value: `${newMember.user.tag} (${newMember.user.id})` },
          { name: 'Removed Roles', value: removedRoles.map(r => r.name).join(', ') || 'None' },
        )
        .setTimestamp();
      modlogChannel.send({ embeds: [embed] });
    }

    // Timeout changes
    if (oldMember.communicationDisabledUntil !== newMember.communicationDisabledUntil) {
      const timeoutEnd = newMember.communicationDisabledUntil;
      let action = 'Timeout Removed';
      let color = 0x00FF00; // Green

      if (timeoutEnd) {
        action = 'Member Timed Out';
        color = 0xFFA500; // Orange
      }

      const embed = new EmbedBuilder()
        .setTitle(action)
        .setColor(color)
        .addFields(
          { name: 'Member', value: `${newMember.user.tag} (${newMember.user.id})` },
          { name: 'Timeout Until', value: timeoutEnd ? `<t:${Math.floor(timeoutEnd.getTime() / 1000)}:F>` : 'None' },
        )
        .setTimestamp();
      modlogChannel.send({ embeds: [embed] });
    }
  },
};
