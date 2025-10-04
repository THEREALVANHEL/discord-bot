// commands/claimticket.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Ticket = require('../models/Ticket');
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claimticket')
    .setDescription('Claim the current ticket.'),
  async execute(interaction, client, logModerationAction) {
    const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

    if (!ticket) {
      return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
    }

    if (ticket.status === 'claimed') {
      return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimedBy}>.`, ephemeral: true });
    }

    if (ticket.status === 'closed') {
      return interaction.reply({ content: 'This ticket is already closed.', ephemeral: true });
    }

    ticket.status = 'claimed';
    ticket.claimedBy = interaction.user.id;
    await ticket.save();

    const embed = new EmbedBuilder()
      .setTitle('Ticket Claimed')
      .setDescription(`This ticket has been claimed by ${interaction.user}.`)
      .setColor(0x00FF00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Log the action
    await logModerationAction(interaction.guild, await Settings.findOne({ guildId: interaction.guild.id }), 'Ticket Claimed', interaction.user, interaction.user, `Ticket #${ticket.ticketId} claimed by ${interaction.user.tag}`);
  },
};
