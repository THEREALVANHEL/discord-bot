// commands/ticket.js (REPLACED - Moved setDefaultMemberPermissions to the correct builder)
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings');
const Ticket = require('../models/Ticket'); // Make sure Ticket model is imported

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Setup the ticket panel or manage ticket settings.')
    // Apply default permissions needed for the 'setup' subcommand at the top level
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
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
        // REMOVED .setDefaultMemberPermissions from here
        )
    .addSubcommand(subcommand =>
      subcommand.setName('close')
        .setDescription('Close the current ticket channel.')),
        // No default perms needed for close, checked dynamically

  async execute(interaction, client, logModerationAction) {
    const subcommand = interaction.options.getSubcommand();

    // Defer reply (ephemeral for setup, depends for close)
    // Defer reply needs careful handling based on subcommand
    const isSetup = subcommand === 'setup';
    await interaction.deferReply({ ephemeral: isSetup }); // Ephemeral only for setup confirmation

    if (isSetup) {
        // --- Setup Subcommand Logic ---
        // (User permission check for ManageGuild is handled by Discord via setDefaultMemberPermissions)

        const panelChannel = interaction.options.getChannel('channel');
        const ticketCategory = interaction.options.getChannel('category');

        // Permission check for bot in target channels
        let botMember;
        try {
            botMember = interaction.guild.members.me || await interaction.guild.members.fetch(client.user.id);
        } catch {
             return interaction.editReply({ content: `❌ Error: Could not fetch my own member data to check permissions.`, ephemeral: true });
        }
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
        // --- Close Subcommand Logic ---
        // Deferral happened at the start (non-ephemeral by default here)

        const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

        if (!ticket) {
            // Edit the deferred reply, make it ephemeral for this error
            return interaction.editReply({ content: 'This is not a ticket channel.', ephemeral: true });
        }

        if (ticket.status === 'closed') {
            // Edit the deferred reply, make it ephemeral
            return interaction.editReply({ content: 'This ticket is already closed.', ephemeral: true });
        }

        // Check if the user has permission (mod or admin or ticket owner)
        const member = interaction.member;
        const config = client.config; // Ensure config is available
        const roles = config.roles || {};
        const isAdmin = member.roles.cache.has(roles.forgottenOne) || member.roles.cache.has(roles.overseer) || member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isMod = member.roles.cache.has(roles.leadMod) || member.roles.cache.has(roles.mod) || isAdmin;

        if (!isMod && ticket.userId !== interaction.user.id) {
            // Edit the deferred reply, make it ephemeral
            return interaction.editReply({ content: 'You do not have permission to close this ticket, and you are not the creator.', ephemeral: true });
        }

        ticket.status = 'closed';
        await ticket.save();

        // Send public closing message first
        try {
            await interaction.channel.send({ content: `🔒 Ticket closed by ${interaction.user}. This channel will be deleted shortly.`});
        } catch (sendError) {
            console.error("Error sending closing message:", sendError);
        }

        // Edit the original deferred reply (which was non-ephemeral for 'close')
        // We can just confirm it's closing, maybe make this one ephemeral after all?
        // Let's edit it to be ephemeral confirmation for the closer.
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
                 try {
                     const settings = await Settings.findOne({ guildId: interaction.guild.id });
                     const modlogChannel = settings?.modlogChannelId ? await interaction.guild.channels.fetch(settings.modlogChannelId).catch(()=>null) : null;
                     if (modlogChannel) {
                        modlogChannel.send(`⚠️ Failed to automatically delete closed ticket channel <#${interaction.channel.id}> (ID: ${interaction.channel.id}). Please delete it manually. Error: ${deleteError.message}`);
                     }
                 } catch {}
            } finally {
                // Optionally delete the ticket document from DB after channel deletion attempt
                await Ticket.deleteOne({ channelId: interaction.channel.id }).catch(console.error);
            }
        }, 10000); // 10 seconds
        }
    },
};
