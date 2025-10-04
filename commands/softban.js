// commands/softban.js (REPLACE - Improved with DM and better logging)
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Softban a user (ban then unban to delete messages).')
    .addUser Option(option =>
      option.setName('target')
        .setDescription('User  to softban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for softban')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('delete_days')
        .setDescription('Days of messages to delete (0-7, default 7)')
        .setRequired(false)),
  async execute(interaction, client, logModerationAction) {
    const target = interaction.options.getUser ('target');
    const reason = interaction.options.getString('reason');
    const deleteDays = interaction.options.getInteger('delete_days') || 7;

    const member = interaction.guild.members.cache.get(target.id);
    if (!member) return interaction.reply({ content: 'User  not found in this server.', ephemeral: true });

    if (member.id === interaction.user.id) return interaction.reply({ content: 'You cannot softban yourself.', ephemeral: true });

    try {
      // Ban
      await member.ban({ days: deleteDays, reason });
      // Immediate unban
      await interaction.guild.members.unban(target.id);

      // DM the user
      try {
        await target.send(`You have been softbanned from ${interaction.guild.name} for: \`${reason}\`. Your recent messages have been deleted.`);
      } catch (dmError) {
        console.log(`Could not DM ${target.tag}: ${dmError.message}`);
      }

      await interaction.reply({ content: `${target.tag} has been softbanned for \`${reason}\`.`, ephemeral: true });

      // Log
      await logModerationAction(interaction.guild, await require('../models/Settings').findOne({ guildId: interaction.guild.id }), 'Softban', target, interaction.user, reason, `Deleted ${deleteDays} days of messages`);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Failed to softban user. Check bot permissions (Ban Members).', ephemeral: true });
    }
  },
};
