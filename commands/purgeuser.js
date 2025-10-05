// commands/purgeuser.js (NEW or REPLACE - Delete messages from a specific user + GUI Update + User Tagging)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purgeuser')
    .setDescription('Delete a specified number of messages from a user in the channel.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User whose messages to delete')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)),
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
      // Fetch more than the requested amount to ensure we get enough from the user
      const fetchLimit = amount * 3; 
      
      let fetched;
      let totalFetched = 0;
      
      // Loop to fetch more messages if the initial fetch didn't yield enough from the target
      while (userMessages.length < amount && totalFetched < fetchLimit) {
        const fetchAmount = Math.min(100, fetchLimit - totalFetched);
        fetched = await interaction.channel.messages.fetch({ limit: fetchAmount, before: lastId });
        if (fetched.size === 0) break;

        const userMsgs = fetched.filter(msg => msg.author.id === target.id);
        userMessages.push(...userMsgs.values());
        
        totalFetched += fetched.size;
        lastId = fetched.last().id;
      }


      const messagesToDelete = userMessages.slice(0, amount);
      if (messagesToDelete.length === 0) {
        return interaction.editReply({ content: `✅ **Success:** No recent messages found from ${target} in this channel to delete.` });
      }

      await interaction.channel.bulkDelete(messagesToDelete, true);

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Targeted Purge', target, interaction.user, `Deleted ${messagesToDelete.length} messages from ${target.tag}`, `Channel: ${interaction.channel.name}`);
      
      // Public confirmation (visible to everyone)
      const embed = new EmbedBuilder()
        .setTitle('🧹 Targeted Purge Executed')
        .setDescription(`Moderator ${interaction.user} has deleted messages from ${target}.`)
        .addFields(
            { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
            { name: 'Channel', value: `${interaction.channel}`, inline: true },
            { name: 'Messages Deleted', value: `**${messagesToDelete.length}**`, inline: true }
        )
        .setColor(0x9B59B6)
        .setTimestamp();
        
      await interaction.editReply({ content: 'Successfully purged messages.', ephemeral: true }); // Edit the deferred reply

      // Send public reply which will be deleted shortly
      const publicReply = await interaction.channel.send({ embeds: [embed] });
      // Auto-delete the reply after 5 seconds
      setTimeout(() => publicReply.delete().catch(() => {}), 5000);
      

    } catch (error) {
      console.error('Purgeuser error:', error);
      await interaction.editReply({ content: '❌ **Error:** Failed to purge user messages. Ensure the bot has "Manage Messages" permission.' });
    }
  },
};
