// commands/ticket.js (ADDED deferReply)
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js'); // Added ChannelType, Permissions
const Settings = require('../models/Settings');
const Ticket = require('../models/Ticket'); // Make sure Ticket model is imported

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
            .addChannelTypes(ChannelType.GuildText) // Ensure text channel
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('category')
            .setDescription('The category where new tickets will be created')
            .addChannelTypes(ChannelType.GuildCategory) // GuildCategory type is 4
            .setRequired(true))
        // Permissions for setup
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        )
    .addSubcommand(subcommand =>
      subcommand.setName('close')
        .setDescription('Close the current ticket channel.')),
        // No default perms needed for close, checked dynamically

  async execute(interaction, client, logModerationAction) {
    const subcommand = interaction.options.getSubcommand();

    // ADDED: Defer reply (ephemeral for setup, depends for close)
    await interaction.deferReply({ ephemeral: subcommand === 'setup' }); // Ephemeral only for setup confirmation

    if (subcommand === 'setup') {
      const panelChannel = interaction.options.getChannel('channel');
      const ticketCategory = interaction.options.getChannel('category');

       // Permission check for bot in target channels
       const botMember = await interaction.guild.members.fetch(client.user.id);
       const panelChannelPerms = panelChannel.permissionsFor(botMember);
       const categoryPerms = ticketCategory.permissionsFor(botMember);

       if (!panelChannelPerms || !panelChannelPerms.has(PermissionsBitField.Flags.SendMessages) || !panelChannelPerms.has(PermissionsBitField.Flags.EmbedLinks)) {
           return interaction.editReply({ content: `❌ Error: I need permission to send messages and embed links in ${panelChannel}.`, ephemeral: true });
       }
       if (!categoryPerms || !categoryPerms.has(PermissionsBitField.Flags.ManageChannels) || !categoryPerms.has(PermissionsBitField.Flags.ViewChannel)) {
           return interaction.editReply({ content: `❌ Error: I need permission to view and manage channels within the ${ticketCategory.name} category.`, ephemeral: true });
       }


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
            .setCustomId('create_ticket') // Ensure this ID is handled in interactionCreate.js
            .setLabel('Create Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫'),
        );

       try {
           await panelChannel.send({ embeds: [embed], components: [row] });
           // Use editReply
           await interaction.editReply({ content: `Ticket panel set up in ${panelChannel} and tickets will be created in ${ticketCategory}.`, ephemeral: true });
       } catch (error) {
            console.error("Error sending ticket panel:", error);
            await interaction.editReply({ content: `Failed to send panel to ${panelChannel}. Please check my permissions.`, ephemeral: true });
       }

    } else if (subcommand === 'close') {
      // Deferral happened at the start

      const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

      if (!ticket) {
        // Use editReply (make ephemeral for "not a ticket channel")
        return interaction.editReply({ content: 'This is not a ticket channel.', ephemeral: true });
      }

      if (ticket.status === 'closed') {
         // Use editReply (ephemeral)
        return interaction.editReply({ content: 'This ticket is already closed.', ephemeral: true });
      }

      // Check if the user has permission (mod or admin or ticket owner)
      const member = interaction.member;
      const config = client.config; // Ensure config is available
      const roles = config.roles || {};
      const isAdmin = member.roles.cache.has(roles.forgottenOne) || member.roles.cache.has(roles.overseer) || member.permissions.has(PermissionsBitField.Flags.Administrator);
      const isMod = member.roles.cache.has(roles.leadMod) || member.roles.cache.has(roles.mod) || isAdmin;

      if (!isMod && ticket.userId !== interaction.user.id) {
         // Use editReply (ephemeral)
        return interaction.editReply({ content: 'You do not have permission to close this ticket, and you are not the creator.', ephemeral: true });
      }

      ticket.status = 'closed';
      await ticket.save();

      // Send public closing message first
       try {
           await interaction.channel.send({ content: `🔒 Ticket closed by ${interaction.user}. This channel will be deleted shortly.`});
       } catch (sendError) {
            console.error("Error sending closing message:", sendError);
            // Continue even if message fails, try to delete channel
       }


       // Use editReply for the ephemeral confirmation
       await interaction.editReply({ content: 'Ticket marked as closed. Deletion scheduled.', ephemeral: true });


      // Log the action - Ensure logModerationAction exists and handles errors
      try {
         const settings = await Settings.findOne({ guildId: interaction.guild.id });
         if (logModerationAction && settings) {
            await logModerationAction(interaction.guild, settings, 'Ticket Closed', interaction.channel, interaction.user, `Ticket #${ticket.ticketId} closed by ${interaction.user.tag}`);
         } else if (!settings) {
             console.log("Modlog channel not configured, skipping log for ticket close.");
         }
      } catch (logError) {
          console.error("Error logging ticket close:", logError);
      }

      // Schedule deletion
      setTimeout(async () => {
         try {
             // Fetch channel before deleting to ensure it exists
             const channelToDelete = await interaction.guild.channels.fetch(interaction.channel.id).catch(() => null);
             if (channelToDelete) {
                await channelToDelete.delete(`Ticket #${ticket.ticketId} closed`);
             }
         } catch (deleteError) {
             console.error(`Failed to delete ticket channel ${interaction.channel.id}:`, deleteError);
             // Maybe send a message to a mod channel if deletion fails?
         } finally {
              // Optionally delete the ticket document from DB after channel deletion
              // await Ticket.deleteOne({ channelId: interaction.channel.id }).catch(console.error);
         }
      }, 10000); // 10 seconds
    }
  },
};
