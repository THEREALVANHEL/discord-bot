// commands/purgeuser.js (REPLACE - Delete messages from a specific user + GUI Update + User Tagging + Improved Fetching)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
// ... (data block)
  async execute(interaction, client, logModerationAction) {
    const target = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (amount < 1 || amount > 100) {
      return interaction.reply({ content: '❌ **Error:** Amount must be between 1 and 100.', ephemeral: true });
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: '❌ **Error:** You cannot purge your own messages.', ephemeral: true });
    }

    if (!interaction.channel.manageable) {
      return interaction.reply({ content: '❌ **Error:** I cannot manage messages in this channel.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true }); // Defer to ensure log can be sent first

    try {
      // Fetch user's messages
      const userMessages = [];
      let lastId;
      // FIX: Fetch up to 500 messages total (5 fetches of 100) to find the target's messages
      const maxFetches = 5; 
      let totalFetches = 0;
      
      let fetched;
      
      while (userMessages.length < amount && totalFetches < maxFetches) {
        fetched = await interaction.channel.messages.fetch({ limit: 100, before: lastId });
        if (fetched.size === 0) break;

        const userMsgs = fetched.filter(msg => msg.author.id === target.id);
        userMessages.push(...userMsgs.values());
        
        totalFetches++;
        lastId = fetched.last().id;
      }


      const messagesToDelete = userMessages.slice(0, amount);
      if (messagesToDelete.length === 0) {
        return interaction.editReply({ content: `✅ **Success:** No recent messages found from ${target} in this channel to delete (searched up to ${totalFetches * 100} messages).` });
      }

      await interaction.channel.bulkDelete(messagesToDelete, true);

      // Log
// ... (log and embed creation)
        
      await interaction.editReply({ content: `Successfully purged ${messagesToDelete.length} messages.`, ephemeral: true }); // Edit the deferred reply

// ... (public reply creation and auto-delete)
    } catch (error) {
// ... (error handling)
    }
  },
};
