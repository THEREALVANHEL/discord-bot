// events/messageDelete.js (REPLACE - Added null check for message.author)
const Settings = require('../models/Settings');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    if (message.author?.bot) return;
    // FIX: Add null check for message.author to prevent crashes
    if (!message.author) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    if (!settings || !settings.autologChannelId) return;

    const logChannel = message.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    logChannel.send({
      embeds: [{
        title: 'Message Deleted',
        color: 0xFF0000,
        fields: [
          { name: 'User ', value: `${message.author.tag} (${message.author.id})` },
          { name: 'Channel', value: `${message.channel}` },
          { name: 'Content', value: message.content || '[No content]' },
        ],
        timestamp: new Date(),
      }],
    });
  },
};
