// commands/purgeuser.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purgeuser')
    .setDescription('Delete a specified number of messages from a specific user in the current channel.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user whose messages to delete')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The number of messages to delete (1-99)')
        .setRequired(true)),
  async execute(interaction, client, logModerationAction) {
    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (amount < 1 || amount > 99) {
      return interaction.reply({ content: 'You can only delete between 1 and 99 messages.', ephemeral: true });
    }

    try {
      const fetchedMessages = await interaction.channel.messages.fetch({ limit: 100 }); // Fetch more to find user's messages
      const userMessages = fetchedMessages.filter(msg => msg.author.id === targetUser.id).first(amount);

      if (userMessages.length === 0) {
        return interaction.reply({ content: `No messages found from ${targetUser.tag} in the last 100 messages.`, ephemeral: true });
      }

      const deletedMessages = await interaction.channel.bulkDelete(userMessages, true);

      const embed = new EmbedBuilder()
        .setTitle('User Messages Purged')
        .setDescription(`Successfully deleted ${deletedMessages.size} messages from ${targetUser.tag} in ${interaction.channel}.`)
        .setColor(0xFF0000)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      // Log the action
      await logModerationAction(
        interaction.guild,
        await Settings.findOne({ guildId: interaction.guild.id }),
        'User Messages Purged',
        targetUser, // Target is the user
        interaction.user,
        `Deleted ${deletedMessages.size} messages from ${targetUser.tag} in ${interaction.channel.name}`
      );

    } catch (error) {
      console.error('Error purging user messages:', error);
      await interaction.reply({ content: 'Failed to purge user messages. Do I have "Manage Messages" permission?', ephemeral: true });
    }
  },
};
