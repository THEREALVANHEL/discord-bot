// events/guildMemberAdd.js
const Settings = require('../models/Settings');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    try {
      // Auto assign join role
      const autoJoinRoleId = client.config.roles.autoJoin;
      if (autoJoinRoleId && !member.roles.cache.has(autoJoinRoleId)) {
        await member.roles.add(autoJoinRoleId).catch(console.error);
      }

      // Welcome message in channel
      const settings = await Settings.findOne({ guildId: member.guild.id });
      if (settings && settings.welcomeChannelId) {
        const channel = member.guild.channels.cache.get(settings.welcomeChannelId);
        if (channel) {
          channel.send({
            content: `Welcome ${member} to the server! Joined on <t:${Math.floor(member.joinedTimestamp / 1000)}:F>`,
            files: ['https://tenor.com/view/catdance-gangnam-style-cute-cat-gif-11020797830010762324.gif'],
          });
        }
      }

      // Send DM to user
      try {
        await member.send(`Welcome to ${member.guild.name}! We're glad to have you here.`);
      } catch {}

    } catch (error) {
      console.error('Error in guildMemberAdd event:', error);
    }
  },
};
