// commands/reminders.js (REPLACE - View made public)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('View or remove your personal reminders.')
    .addSubcommand(subcommand =>
      subcommand.setName('view')
        .setDescription('View your active reminders.'))
    .addSubcommand(subcommand =>
      subcommand.setName('remove')
        .setDescription('Remove one of your active reminders.')),
  // FIX: Changed to execute: async (interaction) => format for deployment stability
  execute: async (interaction, client) => { 
    const subcommand = interaction.options.getSubcommand();
    let user = await User.findOne({ userId: interaction.user.id });

    if (!user || user.reminders.length === 0) {
      return interaction.reply({ content: '✅ **No Reminders:** You have no active reminders set.', ephemeral: true });
    }
    
    // FIX: Defer reply, but only ephemeral if it's 'remove'
    await interaction.deferReply({ ephemeral: subcommand !== 'view' }); 

    if (subcommand === 'view') {
      const embed = new EmbedBuilder()
        .setTitle('⏰ Your Active Reminders')
        .setDescription(`You currently have ${user.reminders.length} active reminder(s).`)
        .setColor(0x7289DA)
        .setTimestamp();

      user.reminders.forEach((reminder, index) => {
        const channel = interaction.guild.channels.cache.get(reminder.channelId);
        embed.addFields({
          name: `Reminder #${index + 1} (ID: ${reminder._id})`,
          value: `**Message:** ${reminder.message}\n**Remind At:** <t:${Math.floor(reminder.remindAt.getTime() / 1000)}:R>\n**Original Channel:** ${channel || 'Unknown Channel'}`,
        });
      });

      await interaction.editReply({ embeds: [embed] }); // Removed ephemeral: true for view

    } else if (subcommand === 'remove') {
      const removeOptions = user.reminders.map((reminder, index) => ({
        label: `Reminder #${index + 1}: ${reminder.message.substring(0, 40)}...`,
        style: ButtonStyle.Danger,
        customId: `remove_reminder_${reminder._id.toString()}`
      }));

      // Group buttons into rows (max 5 buttons per row)
      const rows = [];
      for (let i = 0; i < removeOptions.length; i += 5) {
        const row = new ActionRowBuilder();
        row.addComponents(removeOptions.slice(i, i + 5).map(opt => 
            new ButtonBuilder().setCustomId(opt.customId).setLabel(opt.label).setStyle(opt.style)
        ));
        rows.push(row);
      }

      await interaction.editReply({
        content: '🗑️ **Select a reminder to remove:**',
        components: rows,
      });

      // Buttons are handled in interactionCreate.js
    }
  },
};
