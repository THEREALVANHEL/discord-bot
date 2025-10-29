// commands/ticket.js (REPLACED - Handles prefix '?ticket close', keeps slash for setup)
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings');
const Ticket = require('../models/Ticket');
const { logModerationAction } = require('../utils/logModerationAction'); // Assuming utility exists

module.exports = {
  // Keep Slash Command data ONLY for the setup subcommand
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Setup the ticket panel (Slash Only) or close tickets (Prefix Only).')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild) // For setup
    .addSubcommand(subcommand =>
      subcommand.setName('setup')
        .setDescription('Set up the ticket creation panel in a channel.')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel where the ticket panel will be sent')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('category')
            .setDescription('The category where new tickets will be created')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true))
        )
    // Note: 'close' is NOT defined as a slash subcommand here.
    ,
  name: 'ticket', // Name for prefix command handling
  description: 'Close the current ticket channel (`?ticket close`). Setup is slash only.',
  aliases: [],

  // Execute function handles BOTH slash (setup) and prefix (close)
  async execute(interactionOrMessage, args, client) {
    // --- Distinguish between Interaction (Slash) and Message (Prefix) ---
    const isInteraction = interactionOrMessage.isChatInputCommand?.();
    const isMessage = !isInteraction;

    // --- Slash Command Logic (Setup) ---
    if (isInteraction) {
        const interaction = interactionOrMessage;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            await interaction.deferReply({ ephemeral: true });

            // (Keep your existing slash command setup logic here...)
             const panelChannel = interaction.options.getChannel('channel');
             const ticketCategory = interaction.options.getChannel('category');
             // ... (permission checks for bot) ...
              let botMember;
             try { botMember = interaction.guild.members.me || await interaction.guild.members.fetch(client.user.id); } catch { return interaction.editReply(`❌ Error: Could not fetch my own member data.`);}
             const panelChannelPerms = panelChannel.permissionsFor(botMember);
             const categoryPerms = ticketCategory.permissionsFor(botMember);
             if (!panelChannelPerms?.has(PermissionsBitField.Flags.SendMessages) || !panelChannelPerms?.has(PermissionsBitField.Flags.EmbedLinks)) { return interaction.editReply(`❌ Error: I need Send Messages & Embed Links in ${panelChannel}.`); }
             if (!categoryPerms?.has(PermissionsBitField.Flags.ManageChannels) || !categoryPerms?.has(PermissionsBitField.Flags.ViewChannel)) { return interaction.editReply(`❌ Error: I need View & Manage Channels in the ${ticketCategory.name} category.`); }

             let settings = await Settings.findOne({ guildId: interaction.guild.id });
             if (!settings) settings = new Settings({ guildId: interaction.guild.id });
             settings.ticketPanelChannelId = panelChannel.id;
             settings.ticketCategoryId = ticketCategory.id;
             await settings.save();

             const embed = new EmbedBuilder().setTitle('Support Ticket System').setDescription('Click below to create a ticket.').setColor(0x0099FF);
             const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'));

             try {
                 await panelChannel.send({ embeds: [embed], components: [row] });
                 await interaction.editReply(`Ticket panel set up in ${panelChannel}, category set to ${ticketCategory}.`);
             } catch (error) {
                 console.error("Error sending ticket panel:", error);
                 await interaction.editReply(`Failed to send panel to ${panelChannel}. Check permissions.`);
             }
            return; // End slash command execution
        } else {
             // Should not happen if only setup is defined for slash
             return interaction.reply({ content: 'Invalid slash subcommand.', ephemeral: true });
        }
    }

    // --- Prefix Command Logic (Close) ---
    if (isMessage) {
        const message = interactionOrMessage;
        // The command name 'ticket' and argument 'close' were already checked in messageCreate.js

        const ticket = await Ticket.findOne({ channelId: message.channel.id });

        if (!ticket) {
            return message.reply('This is not a ticket channel.');
        }
        if (ticket.status === 'closed') {
            return message.reply('This ticket is already closed.');
        }

        // Permission Check (Mod/Admin or Ticket Owner)
        const member = message.member;
        const config = client.config;
        const roles = config.roles || {};
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                        [roles.forgottenOne, roles.overseer].some(roleId => member.roles.cache.has(roleId));
        const isMod = isAdmin || [roles.leadMod, roles.mod].some(roleId => member.roles.cache.has(roleId));

        if (!isMod && ticket.userId !== message.author.id) {
            return message.reply('You do not have permission to close this ticket, and you are not the creator.');
        }

        ticket.status = 'closed';
        await ticket.save();

        // Send closing message
        await message.channel.send(`🔒 Ticket closed by ${message.author}. This channel will be deleted shortly.`).catch(console.error);

        // Log action
        const settings = await Settings.findOne({ guildId: message.guild.id });
        if (settings && settings.modlogChannelId) {
            await logModerationAction(message.guild, settings, 'Ticket Closed', message.channel, message.author, `Ticket #${ticket.ticketId} closed`);
        }

        // Schedule deletion
        setTimeout(async () => {
            try {
                const channelToDelete = await message.guild.channels.fetch(message.channel.id).catch(() => null);
                if (channelToDelete) {
                    await channelToDelete.delete(`Ticket #${ticket.ticketId} closed`);
                    await Ticket.deleteOne({ channelId: message.channel.id }).catch(console.error); // Clean DB
                }
            } catch (deleteError) {
                console.error(`Failed to delete ticket channel ${message.channel.id}:`, deleteError);
                 // Log deletion failure
                 if (settings && settings.modlogChannelId) {
                     const modLog = message.guild.channels.cache.get(settings.modlogChannelId);
                     if (modLog) modLog.send(`⚠️ Failed to delete closed ticket channel ID ${message.channel.id}. Manual deletion required. Error: ${deleteError.message}`);
                 }
            }
        }, 10000); // 10 seconds

        return; // End prefix command execution
    }
  },
};
