// MultipleFiles/guildMemberRemove.js
module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    try {
      const Settings = require('../models/Settings'); // Require here
      const settings = await Settings.findOne({ guildId: member.guild.id });
      if (settings && settings.leaveChannelId) {
        const channel = member.guild.channels.cache.get(settings.leaveChannelId);
        if (channel) {
          channel.send({
            content: `${member.user.tag} left the server on <t:${Math.floor(Date.now() / 1000)}:F>`,
            files: ['https://tenor.com/view/flcl-mamimi-aaahhh-wtf-shocked-gif-24981847.gif'],
          });
        }
      }
    } catch (error) {
      console.error('Error in guildMemberRemove event:', error);
    }
  },
};
