// events/messageUpdate.js
const Settings = require('../models/Settings');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    if (oldMessage.author?.bot) return;
    // FIX: Add null check for oldMessage.author before reading .tag
    if (!oldMessage.author) return; 
    if (!oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;

    const settings = await Settings.findOne({ guildId: oldMessage.guild.id });
    if (!settings || !settings.autologChannelId) return;

    const logChannel = oldMessage.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    logChannel.send({
      embeds: [{
        title: 'Message Edited',
        color: 0xFFA500,
        fields: [
          { name: 'User ', value: `${oldMessage.author.tag} (${oldMessage.author.id})` },
          { name: 'Channel', value: `${oldMessage.channel}` },
          { name: 'Before', value: oldMessage.content || '[No content]' },
          { name: 'After', value: newMessage.content || '[No content]' },
        ],
        timestamp: new Date(),
      }],
    });
  },
};
