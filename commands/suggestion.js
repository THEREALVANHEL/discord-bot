// commands/suggestion.js (REPLACE - Premium GUI)
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
      return interaction.reply({ content: '❌ **Error:** The suggestion system is not set up yet.', ephemeral: true });
    }

    const suggestionChannel = interaction.guild.channels.cache.get(settings.suggestionChannelId);
    if (!suggestionChannel) {
      return interaction.reply({ content: '❌ **Error:** The configured suggestion channel was not found.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('💡 New Community Suggestion')
      .setDescription(`> ${idea}`)
      .addFields(
        { name: 'Suggested By', value: interaction.user.tag, inline: true },
        { name: 'Status', value: '📊 Pending Vote', inline: true },
      )
      .setColor(0xFFA500)
      .setTimestamp()
      .setFooter({ text: `Use the reactions to vote!` });

    try {
      const suggestionMessage = await suggestionChannel.send({ embeds: [embed] });
      await suggestionMessage.react('👍');
      await suggestionMessage.react('👎');

      // Create a thread for discussion
      const thread = await suggestionMessage.startThread({
        name: `Suggestion: ${idea.substring(0, 30)}...`,
        autoArchiveDuration: 1440,
        reason: 'Discussion for new suggestion',
      });
      await thread.send(`Discuss this suggestion here! Please keep the discussion civil and constructive. ${suggestionMessage.url}`);

      await interaction.reply({ content: '✅ **Suggestion Submitted!** Your idea is now open for community voting and discussion.', ephemeral: true });
    } catch (error) {
      console.error('Error submitting suggestion:', error);
      await interaction.reply({ content: '❌ **Error:** Failed to submit suggestion. Check my permissions (send messages, add reactions, and create threads).', ephemeral: true });
    }
  },
};
