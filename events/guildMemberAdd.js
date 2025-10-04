// MultipleFiles/guildMemberAdd.js
module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    try {
      // Auto assign join role
      const autoJoinRoleId = client.config.roles.autoJoin;
      if (autoJoinRoleId && !member.roles.cache.has(autoJoinRoleId)) {
        await member.roles.add(autoJoinRoleId).catch(console.error);
      }

      // Welcome message
      const Settings = require('../models/Settings'); // Require here to avoid circular dependency if Settings also requires User
      const settings = await Settings.findOne({ guildId: member.guild.id });
      if (settings && settings.welcomeChannelId) {
        const channel = member.guild.channels.cache.get(settings.welcomeChannelId);
        if (channel) {
          channel.send({
            content: `Welcome ${member} to the server! Joined on <t:${Math.floor(member.joinedTimestamp / 1000)}:F>`,
            files: ['https://tenor.com/view/meow-dancing-cat-cat-dancing-meow-meow-meow-gif-14608759981751543562.gif'],
          });
        }
      }
    } catch (error) {
      console.error('Error in guildMemberAdd event:', error);
    }
  },
};
