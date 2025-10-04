// commands/softban.js (REPLACE - No message deletion, improved DM and logging)
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Softban a user (temporary ban without deleting messages).')
    .addUser Option(option =>
      option.setName('target')
        .setDescription('User  to softban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for softban')
        .setRequired(true)),
  async execute(interaction, client, logModerationAction) {
    const target = interaction.options.getUser ('target');
    const reason = interaction.options.getString('reason');

    const member = interaction.guild.members.cache.get(target.id);
    if (!member) {
      return interaction.reply({ content: 'User  not found in this server.', ephemeral: true });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({ content: 'You cannot softban yourself.', ephemeral: true });
    }

    if (member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'You cannot softban administrators.', ephemeral: true });
    }

    try {
      // Ban without deleting messages (days: 0)
      await member.ban({ days: 0, reason });
      // Immediate unban
      await interaction.guild.members.unban(target.id, 'Softban unban');

      // DM the user
      try {
        await target.send(`You have been softbanned from ${interaction.guild.name} for: \`${reason}\`. This is a temporary action to warn you. Please review the server rules.`);
      } catch (dmError) {
        console.log(`Could not DM ${target.tag}: ${dmError.message}`);
      }

      await interaction.reply({ content: `${target.tag} has been softbanned for \`${reason}\`. (No messages were deleted.)`, ephemeral: true });

      // Log the action
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Softban', target, interaction.user, reason, 'No messages deleted');

    } catch (error) {
      console.error('Softban error:', error);
      await interaction.reply({ content: 'Failed to softban user. Ensure the bot has "Ban Members" permission.', ephemeral: true });
    }
  },
};
