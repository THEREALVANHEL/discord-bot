// commands/purge.js (REPLACE - Bulk delete messages in channel, Fixed Acknowledgment)
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js'); // Added PermissionsBitField

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a specified number of messages from the channel.')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages), // Added required permission for visibility/use
  async execute(interaction, client, logModerationAction) {
    const amount = interaction.options.getInteger('amount');

    // FIX 1: Defer the reply immediately and ephemerally to acknowledge the interaction.
    await interaction.deferReply({ ephemeral: true });

    if (amount < 1 || amount > 100) {
      // Use editReply after deferral
      return interaction.editReply({ content: 'Amount must be between 1 and 100.', ephemeral: true });
    }

    if (!interaction.channel.manageable) {
      // Use editReply after deferral
      return interaction.editReply({ content: 'I cannot manage messages in this channel.', ephemeral: true });
    }

    try {
      // Fetch and delete messages (Discord limits bulk delete to 14+ days old, but this works for recent)
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      await interaction.channel.bulkDelete(messages, true);

      // Public confirmation (visible to everyone)
      // FIX 2: Use followUp for the non-ephemeral public response.
      const publicMessage = await interaction.followUp({ 
        content: `🧹 **Purge Executed:** ${amount} messages have been deleted from this channel by ${interaction.user.tag}.`, 
        ephemeral: false 
      });
      
      // Update deferred ephemeral reply for successful purge
      await interaction.editReply({ content: `✅ Successfully deleted ${amount} messages. Public confirmation sent to channel.` });

      // Auto-delete the public confirmation after 5 seconds to clean up
      setTimeout(() => publicMessage.delete().catch(() => {}), 5000);
      

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Purge', interaction.channel, interaction.user, `Deleted ${amount} messages`, 'Bulk purge');

    } catch (error) {
      console.error('Purge error:', error);
      // FIX 3: Use editReply to send the ephemeral error message back to the user.
      await interaction.editReply({ content: '❌ **Error:** Failed to purge messages. Ensure the bot has "Manage Messages" permission.', ephemeral: true });
    }
  },
};
