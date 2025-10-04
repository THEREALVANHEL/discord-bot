// commands/purge.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a specified number of messages from the current channel.')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The number of messages to delete (1-99)')
        .setRequired(true)),
  async execute(interaction, client, logModerationAction) {
    const amount = interaction.options.getInteger('amount');

    if (amount < 1 || amount > 99) {
      return interaction.reply({ content: 'You can only delete between 1 and 99 messages.', ephemeral: true });
    }

    try {
      const fetchedMessages = await interaction.channel.messages.fetch({ limit: amount });
      const deletedMessages = await interaction.channel.bulkDelete(fetchedMessages, true); // true to filter old messages

      const embed = new EmbedBuilder()
        .setTitle('Messages Purged')
        .setDescription(`Successfully deleted ${deletedMessages.size} messages in ${interaction.channel}.`)
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      // Log the action
      await logModerationAction(
        interaction.guild,
        await Settings.findOne({ guildId: interaction.guild.id }),
        'Messages Purged',
        interaction.channel, // Target is the channel
        interaction.user,
        `Deleted ${deletedMessages.size} messages in ${interaction.channel.name}`
      );

    } catch (error) {
      console.error('Error purging messages:', error);
      await interaction.reply({ content: 'Failed to purge messages. Do I have "Manage Messages" permission?', ephemeral: true });
    }
  },
};
