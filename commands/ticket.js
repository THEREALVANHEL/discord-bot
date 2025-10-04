// commands/ticket.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Setup the ticket panel or manage ticket settings.')
    .addSubcommand(subcommand =>
      subcommand.setName('setup')
        .setDescription('Set up the ticket creation panel in a channel.')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel where the ticket panel will be sent')
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('category')
            .setDescription('The category where new tickets will be created')
            .addChannelTypes(4) // GuildCategory
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand.setName('close')
        .setDescription('Close the current ticket channel.')),
  async execute(interaction, client, logModerationAction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const panelChannel = interaction.options.getChannel('channel');
      const ticketCategory = interaction.options.getChannel('category');

      let settings = await Settings.findOne({ guildId: interaction.guild.id });
      if (!settings) {
        settings = new Settings({ guildId: interaction.guild.id });
      }
      settings.ticketPanelChannelId = panelChannel.id;
      settings.ticketCategoryId = ticketCategory.id;
      await settings.save();

      const embed = new EmbedBuilder()
        .setTitle('Support Ticket System')
        .setDescription('Click the button below to create a new support ticket. A staff member will assist you shortly.')
        .setColor(0x0099FF);

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel('Create Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫'),
        );

      await panelChannel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: `Ticket panel set up in ${panelChannel} and tickets will be created in ${ticketCategory}.`, ephemeral: true });
    } else if (subcommand === 'close') {
      const Ticket = require('../models/Ticket');
      const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

      if (!ticket) {
        return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
      }

      if (ticket.status === 'closed') {
        return interaction.reply({ content: 'This ticket is already closed.', ephemeral: true });
      }

      // Check if the user has permission (mod or admin)
      const member = interaction.member;
      const config = client.config;
      const isAdmin = member.roles.cache.has(config.roles.forgottenOne) || member.roles.cache.has(config.roles.overseer);
      const isMod = member.roles.cache.has(config.roles.leadMod) || member.roles.cache.has(config.roles.mod);

      if (!isAdmin && !isMod && ticket.userId !== interaction.user.id) {
        return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
      }

      ticket.status = 'closed';
      await ticket.save();

      await interaction.channel.send('This ticket has been closed. It will be deleted in 10 seconds.');
      await interaction.reply({ content: 'Ticket closed successfully.', ephemeral: true });

      // Log the action
      await logModerationAction(interaction.guild, await Settings.findOne({ guildId: interaction.guild.id }), 'Ticket Closed', interaction.user, interaction.user, `Ticket #${ticket.ticketId} closed by ${interaction.user.tag}`);

      setTimeout(async () => {
        await interaction.channel.delete().catch(console.error);
      }, 10000);
    }
  },
};
