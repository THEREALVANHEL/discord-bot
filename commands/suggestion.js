// commands/suggestion.js (REPLACE - Simplified: removed thread creation, Changed image option to Attachment)
const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js'); // Added ChannelType
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Submit a suggestion for the server.')
    .addStringOption(option =>
      option.setName('idea')
        .setDescription('Your suggestion')
        .setRequired(true))
    .addAttachmentOption(option => // FIX: Changed to AttachmentOption for file uploads
      option.setName('image')
        .setDescription('An image file to include with the suggestion')
        .setRequired(false)),
  async execute(interaction) {
    const idea = interaction.options.getString('idea');
    const imageAttachment = interaction.options.getAttachment('image'); // Get Attachment

    const settings = await Settings.findOne({ guildId: interaction.guild.id });
    if (!settings || !settings.suggestionChannelId) {
      return interaction.reply({ content: '❌ **Error:** The suggestion system is not set up yet.', ephemeral: true });
    }

    const suggestionChannel = interaction.guild.channels.cache.get(settings.suggestionChannelId);
    if (!suggestionChannel || suggestionChannel.type !== ChannelType.GuildText) {
      return interaction.reply({ content: '❌ **Error:** The configured suggestion channel was not found or is not a text channel.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('💡 New Community Suggestion')
      .setDescription(`> **${idea}**`) // Highlight the suggestion
      .addFields(
        { name: 'Suggested By', value: `${interaction.user}`, inline: true },
        // Removed Status field
      )
      .setColor(0x3498DB) // Blue for suggestions
      .setTimestamp()
      .setFooter({ text: `Use the reactions to vote! | ID: ${interaction.user.id}` });
      
    if (imageAttachment) { // Use attachment URL
      embed.setImage(imageAttachment.url);
    }

    try {
      const suggestionMessage = await suggestionChannel.send({ embeds: [embed] });
      await suggestionMessage.react('👍');
      await suggestionMessage.react('👎');
      
      // Create a thread for discussion
      await suggestionMessage.startThread({
          name: `Discuss ${interaction.user.username}'s Idea`,
          autoArchiveDuration: 60 * 24, // 24 hours
          reason: 'Discussion thread for community suggestion',
      }).catch(console.error); // Handle missing permissions for thread creation

      await interaction.reply({ content: '✅ **Suggestion Submitted!** Your idea is now open for community discussion and voting.', ephemeral: true });
    } catch (error) {
      console.error('Error submitting suggestion:', error);
      await interaction.reply({ content: '❌ **Error:** Failed to submit suggestion. Check my permissions (send messages, add reactions, manage threads).', ephemeral: true });
    }
  },
};
