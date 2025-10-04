const Settings = require('../models/Settings');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    if (message.author?.bot) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    if (!settings || !settings.autologChannelId)
