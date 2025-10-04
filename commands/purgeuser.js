// commands/purgeuser.js (NEW or REPLACE - Delete messages from a specific user)
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purgeuser')
    .setDescription('Delete a specified number of messages from a user in the channel.')
    .addUser Option(option =>
      option.setName('target')
        .setDescription('User  whose messages to delete')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)),
  async execute(interaction, client, logModerationAction) {
    const target = interaction.options.getUser ('target');
    const amount = interaction.options.getInteger('amount');

    if (amount < 1 || amount > 100) {
      return interaction.reply({ content: 'Amount must be between 1 and 100.', ephemeral: true });
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: 'You cannot purge your own messages.', ephemeral: true });
    }

    if (!interaction.channel.manageable) {
      return interaction.reply({ content: 'I cannot manage messages in this channel.', ephemeral: true });
    }

    try {
      // Fetch user's messages
      const userMessages = [];
      let lastId;
      for (let i = 0; i < amount; i += 100) {
        const fetched = await interaction.channel.messages.fetch({ limit: 100, before: lastId });
        const userMsgs = fetched.filter(msg => msg.author.id === target.id);
        userMessages.push(...userMsgs.values());
        if (userMsgs.size < 100) break;
        lastId = fetched.last().id;
      }

      const messagesToDelete = userMessages.slice(0, amount);
      if (messagesToDelete.length === 0) {
        return interaction.reply({ content: `No recent messages found from ${target.tag}.`, ephemeral: true });
      }

      await interaction.channel.bulkDelete(messagesToDelete, true);

      // Public confirmation (visible to everyone)
      await interaction.reply({ 
        content: `🧹 **User  Purge Executed:** ${messagesToDelete.length} messages from ${target.tag} have been deleted by ${interaction.user.tag}.`, 
        ephemeral: false 
      }).then(msg => {
        // Auto-delete the reply after 5 seconds
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'User  Purge', target, interaction.user, `Deleted ${messagesToDelete.length} messages`, 'Targeted purge');

    } catch (error) {
      console.error('Purgeuser error:', error);
      await interaction.reply({ content: 'Failed to purge user messages. Ensure the bot has "Manage Messages" permission.', ephemeral: true });
    }
  },
};
