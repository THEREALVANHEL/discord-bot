// commands/purge.js (NEW or REPLACE - Bulk delete messages in channel)
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a specified number of messages from the channel.')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)),
  async execute(interaction, client, logModerationAction) {
    const amount = interaction.options.getInteger('amount');

    if (amount < 1 || amount > 100) {
      return interaction.reply({ content: 'Amount must be between 1 and 100.', ephemeral: true });
    }

    if (!interaction.channel.manageable) {
      return interaction.reply({ content: 'I cannot manage messages in this channel.', ephemeral: true });
    }

    try {
      // Fetch and delete messages (Discord limits bulk delete to 14+ days old, but this works for recent)
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      await interaction.channel.bulkDelete(messages, true);

      // Public confirmation (visible to everyone)
      await interaction.reply({ 
        content: `🧹 **Purge Executed:** ${amount} messages have been deleted from this channel by ${interaction.user.tag}.`, 
        ephemeral: false 
      }).then(msg => {
        // Auto-delete the reply after 5 seconds to clean up
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Purge', interaction.channel, interaction.user, `Deleted ${amount} messages`, 'Bulk purge');

    } catch (error) {
      console.error('Purge error:', error);
      await interaction.reply({ content: 'Failed to purge messages. Ensure the bot has "Manage Messages" permission.', ephemeral: true });
    }
  },
};
