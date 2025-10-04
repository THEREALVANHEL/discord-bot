// events/guildMemberRemove.js
const Settings = require('../models/Settings');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    try {
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

      // Send DM to user if possible
      try {
        await member.send(`You left ${member.guild.name}. We're sorry to see you go!`);
      } catch {}

    } catch (error) {
      console.error('Error in guildMemberRemove event:', error);
    }
  },
};
