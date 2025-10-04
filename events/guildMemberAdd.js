module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    try {
      // Auto assign join role
      const autoJoinRoleId = client.config.roles.autoJoin;
      if (!member.roles.cache.has(autoJoinRoleId)) {
        await member.roles.add(autoJoinRoleId);
      }

      // Welcome message
      const settings = await require('../models/Settings').findOne({ guildId: member.guild.id });
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
