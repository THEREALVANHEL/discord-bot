// commands/suggestion.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Submit a suggestion for the server.')
    .addStringOption(option =>
      option.setName('idea')
        .setDescription('Your suggestion')
        .setRequired(true)),
  async execute(interaction) {
    const idea = interaction.options.getString('idea');

    const settings = await Settings.findOne({ guildId: interaction.guild.id });
    if (!settings || !settings.suggestionChannelId) {
      return interaction.reply({ content: 'The suggestion system is not set up yet.', ephemeral: true });
    }

    const suggestionChannel = interaction.guild.channels.cache.get(settings.suggestionChannelId);
    if (!suggestionChannel) {
      return interaction.reply({ content: 'The configured suggestion channel was not found.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('💡 New Suggestion')
      .setDescription(idea)
      .addFields(
        { name: 'Suggested By', value: interaction.user.tag, inline: true },
        { name: 'Status', value: 'Pending', inline: true },
      )
      .setColor(0xFFA500) // Orange
      .setTimestamp();

    try {
      const suggestionMessage = await suggestionChannel.send({ embeds: [embed] });
      await suggestionMessage.react('👍');
      await suggestionMessage.react('👎');

      // Create a thread for discussion
      const thread = await suggestionMessage.startThread({
        name: `Suggestion by ${interaction.user.username}`,
        autoArchiveDuration: 1440, // 24 hours
        reason: 'Discussion for new suggestion',
      });
      await thread.send(`Discuss this suggestion here! Original suggestion: ${suggestionMessage.url}`);

      await interaction.reply({ content: 'Your suggestion has been submitted!', ephemeral: true });
    } catch (error) {
      console.error('Error submitting suggestion:', error);
      await interaction.reply({ content: 'Failed to submit suggestion. Do I have permissions to send messages, add reactions, and create threads in the suggestion channel?', ephemeral: true });
    }
  },
};
