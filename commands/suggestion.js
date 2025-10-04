// commands/suggestion.js (REPLACE - Simplified: removed thread creation, Added image_url option)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Submit a suggestion for the server.')
    .addStringOption(option =>
      option.setName('idea')
        .setDescription('Your suggestion')
        .setRequired(true))
    .addStringOption(option => // NEW IMAGE OPTION
      option.setName('image_url')
        .setDescription('A direct URL for an image to include with the suggestion')
        .setRequired(false)),
  async execute(interaction) {
    const idea = interaction.options.getString('idea');
    const imageUrl = interaction.options.getString('image_url'); // GET NEW OPTION

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
      .setFooter({ text: `Use the reactions to vote! | Suggested by: ${interaction.user.tag}` });
      
    if (imageUrl) { // SET IMAGE IF PROVIDED
      embed.setImage(imageUrl);
    }

    try {
      const suggestionMessage = await suggestionChannel.send({ embeds: [embed] });
      await suggestionMessage.react('👍');
      await suggestionMessage.react('👎');

      await interaction.reply({ content: '✅ **Suggestion Submitted!** Your idea is now open for community voting.', ephemeral: true });
    } catch (error) {
      console.error('Error submitting suggestion:', error);
      await interaction.reply({ content: '❌ **Error:** Failed to submit suggestion. Check my permissions (send messages, add reactions).', ephemeral: true });
    }
  },
};
