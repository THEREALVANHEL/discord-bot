// events/messageUpdate.js (REPLACE - Removed bot check)
const Settings = require('../models/Settings');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    // FIX: Removed bot check
    // if (oldMessage.author?.bot) return; 
    
    if (!oldMessage.author) return; 
    if (!oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return; // Still skip if content is same (e.g., embed only)

    const settings = await Settings.findOne({ guildId: oldMessage.guild.id });
    if (!settings || !settings.autologChannelId) return;

    const logChannel = oldMessage.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    logChannel.send({
      embeds: [{
        title: 'Message Edited',
        color: 0xFFA500,
        fields: [
          { name: 'User ', value: `${oldMessage.author.tag} (${oldMessage.author.id}) ${oldMessage.author.bot ? '[BOT]' : ''}` },
          { name: 'Channel', value: `${oldMessage.channel}` },
          { name: 'Message', value: `[Jump to Message](${newMessage.url})`},
          { name: 'Before', value: (oldMessage.content || '[No content]').substring(0, 1024) },
          { name: 'After', value: (newMessage.content || '[No content]').substring(0, 1024) },
        ],
        timestamp: new Date(),
      }],
    });
  },
};
