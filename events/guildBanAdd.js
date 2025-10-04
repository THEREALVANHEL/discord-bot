// events/guildBanAdd.js
const Settings = require('../models/Settings');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban, client) {
    const settings = await Settings.findOne({ guildId: ban.guild.id });
    if (!settings || !settings.modlogChannelId) return;

    const modlogChannel = ban.guild.channels.cache.get(settings.modlogChannelId);
    if (!modlogChannel) return;

    const embed = new EmbedBuilder()
      .setTitle('Member Banned')
      .setColor(0xFF0000) // Red
      .addFields(
        { name: 'User', value: `${ban.user.tag} (${ban.user.id})` },
        { name: 'Reason', value: ban.reason || 'No reason provided' },
      )
      .setTimestamp();
    modlogChannel.send({ embeds: [embed] });
  },
};
