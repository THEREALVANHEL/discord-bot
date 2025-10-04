// events/messageReactionAdd.js
const Settings = require('../models/Settings');

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    if (user.bot) return;
    if (!reaction.message.guild) return;

    const settings = await Settings.findOne({ guildId: reaction.message.guild.id });
    if (!settings) return;

    const rr = settings.reactionRoles.find(r =>
      r.messageId === reaction.message.id &&
      (r.emoji === reaction.emoji.identifier || r.emoji === reaction.emoji.name)
    );
    if (!rr) return;

    const member = await reaction.message.guild.members.fetch(user.id);
    if (!member) return;

    try {
      await member.roles.add(rr.roleId);
    } catch (error) {
      console.error('Failed to add reaction role:', error);
    }
  },
};
