// commands/softban.js (REPLACE - Success reply now visible to everyone + GUI Update + User Tagging)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Softban a user (temporary ban without deleting messages).')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User to softban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for softban')
        .setRequired(true)),
  async execute(interaction, client, logModerationAction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');

    const member = interaction.guild.members.cache.get(target.id);
    if (!member) {
      return interaction.reply({ content: '❌ **Error:** User not found in this server.', ephemeral: true });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({ content: '❌ **Error:** You cannot softban yourself.', ephemeral: true });
    }

    if (member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ **Error:** You cannot softban administrators.', ephemeral: true });
    }

    try {
      // Ban without deleting messages (days: 0)
      await member.ban({ deleteMessageSeconds: 0, reason }); // Changed days: 0 to deleteMessageSeconds: 0 as per latest d.js docs
      // Immediate unban
      await interaction.guild.members.unban(target.id, 'Softban unban');

      // DM the user (private)
      try {
        await target.send(`You have been softbanned from **${interaction.guild.name}** for: \`${reason}\`. This is a temporary action to warn you. Please review the server rules.`);
      } catch (dmError) {
        console.log(`Could not DM ${target.tag}: ${dmError.message}`);
      }

      const embed = new EmbedBuilder()
        .setTitle('🔨 Softban Executed')
        .setDescription(`Moderator ${interaction.user} issued a temporary ban.`)
        .addFields(
            { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
            { name: 'Action', value: 'Temporary Ban (Softban)', inline: true },
            { name: 'Messages Purged?', value: 'No', inline: true },
            { name: 'Reason', value: reason, inline: false }
        )
        .setColor(0xDC143C) // Crimson
        .setTimestamp();

      // Public confirmation (visible to everyone)
      await interaction.reply({ embeds: [embed], ephemeral: false });

      // Log the action (private modlog)
      const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Softban', target, interaction.user, reason, 'No messages deleted');

    } catch (error) {
      console.error('Softban error:', error);
      await interaction.reply({ content: '❌ **Error:** Failed to softban user. Ensure the bot has "Ban Members" permission.', ephemeral: true });
    }
  },
};
