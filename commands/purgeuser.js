// commands/purgeuser.js (REPLACE - Delete messages from a specific user + GUI Update + User Tagging + Improved Fetching)
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purgeuser')
    .setDescription('Delete a specified number of messages from a specific user in the channel.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user whose messages should be deleted')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages), // Added required permission for visibility/use
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
      // Fetch up to 500 messages total (5 fetches of 100) to find the target's messages
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

      const deletedCount = messagesToDelete.length; // Capture the actual count
      await interaction.channel.bulkDelete(messagesToDelete, true);

      // Log
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Purge User', target, interaction.user, `Deleted ${deletedCount} messages by user`, `Channel: <#${interaction.channel.id}>`);
        
      await interaction.editReply({ content: `Successfully purged ${deletedCount} messages by ${target.tag}.`, ephemeral: true }); // Edit the deferred reply

      // Public confirmation (visible to everyone)
      const publicEmbed = new EmbedBuilder()
          .setTitle('🧹 User Purge Executed')
          .setDescription(`Moderator ${interaction.user} purged **${deletedCount}** messages from **${target}** in this channel.`)
          .setColor(0xDC143C)
          .setTimestamp();

      // Send the public message (as a followUp, since the reply was ephemeral deferred)
      interaction.channel.send({ embeds: [publicEmbed] })
          .then(msg => {
            // Auto-delete the public reply after 5 seconds to clean up
            setTimeout(() => msg.delete().catch(() => {}), 5000);
          })
          .catch(() => {});
          
    } catch (error) {
      console.error('Purge User error:', error);
      await interaction.editReply({ content: '❌ **Error:** Failed to purge messages. Ensure the bot has "Manage Messages" permission.', ephemeral: true });
    }
  },
};
