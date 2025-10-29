// commands/ticketpanel.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
    name: 'ticketpanel',
    description: 'Sets up the ticket creation panel in a specified channel (Forgotten One Role Only).',
    aliases: ['tpanel'],
    async execute(message, args, client) {
        // 1. Permission Check: STRICTLY only allow the "Forgotten One" role
        const forgottenOneRoleId = client.config.roles.forgottenOne;
        if (!forgottenOneRoleId) {
            console.error("Configuration Error: 'forgottenOne' role ID is missing in client.config.roles");
            return message.reply('❌ Configuration error: The required role ID for this command is not set.');
        }

        const isForgottenOne = message.member.roles.cache.has(forgottenOneRoleId);

        if (!isForgottenOne) {
            return message.reply(`❌ Only users with the <@&${forgottenOneRoleId}> role can use this command.`);
        }

        // 2. Argument Parsing: ?ticketpanel <#channel> <categoryID or Category Name>
        if (args.length < 2) {
            return message.reply('Usage: `?ticketpanel <#channel_mention> <category_ID | "Category Name">`\nExample: `?ticketpanel #support-tickets "Support Channels"`');
        }

        // Find Panel Channel
        const panelChannel = message.mentions.channels.first();
        if (!panelChannel || panelChannel.type !== ChannelType.GuildText) {
            return message.reply('❌ Please mention a valid text channel first for the panel.');
        }

        // Find Category
        const categoryIdentifier = args.slice(1).join(' '); // Join remaining args for category name/ID
        let ticketCategory = message.guild.channels.cache.find(c =>
            (c.type === ChannelType.GuildCategory) && (c.id === categoryIdentifier || c.name.toLowerCase() === categoryIdentifier.toLowerCase())
        );

        // If not found by ID or exact name match in cache, try fetching just in case
        if (!ticketCategory) {
            try {
                const fetchedChannels = await message.guild.channels.fetch();
                ticketCategory = fetchedChannels.find(c =>
                    (c.type === ChannelType.GuildCategory) && (c.id === categoryIdentifier || c.name.toLowerCase() === categoryIdentifier.toLowerCase())
                 );
            } catch (fetchError){
                 console.error("Error fetching channels:", fetchError);
            }
        }


        if (!ticketCategory || ticketCategory.type !== ChannelType.GuildCategory) {
            return message.reply(`❌ Could not find a category matching "${categoryIdentifier}". Please provide a valid Category ID or exact Category Name.`);
        }

        // 3. Bot Permission Checks
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
        const panelChannelPerms = panelChannel.permissionsFor(botMember);
        const categoryPerms = ticketCategory.permissionsFor(botMember);

        if (!panelChannelPerms?.has(PermissionsBitField.Flags.SendMessages) || !panelChannelPerms?.has(PermissionsBitField.Flags.EmbedLinks)) {
            return message.reply(`❌ I need permission to Send Messages and Embed Links in ${panelChannel}.`);
        }
        if (!categoryPerms?.has(PermissionsBitField.Flags.ManageChannels) || !categoryPerms?.has(PermissionsBitField.Flags.ViewChannel)) {
            // ManageChannels is needed to create the ticket channel inside the category
            return message.reply(`❌ I need permission to View Channels and Manage Channels within the ${ticketCategory.name} category.`);
        }

        // 4. Update Settings
        let settings = await Settings.findOne({ guildId: message.guild.id });
        if (!settings) {
            settings = new Settings({ guildId: message.guild.id });
        }
        settings.ticketPanelChannelId = panelChannel.id;
        settings.ticketCategoryId = ticketCategory.id;

        try {
            await settings.save();
        } catch (dbError) {
             console.error("Failed to save ticket settings:", dbError);
             return message.reply("❌ Database error: Could not save settings.");
        }


        // 5. Create and Send Panel Embed
        const embed = new EmbedBuilder()
            .setTitle('Support Ticket System')
            .setDescription('Click the button below to create a new support ticket. A staff member will assist you shortly.')
            .setColor(0x0099FF) // Blue
            .setFooter({ text: `Panel configured by ${message.author.tag}`});

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket') // This ID MUST be handled in your interactionCreate.js
                    .setLabel('Create Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎫'),
            );

        try {
            await panelChannel.send({ embeds: [embed], components: [row] });
            await message.reply(`✅ Ticket panel successfully sent to ${panelChannel} and category set to ${ticketCategory.name}.`);
        } catch (error) {
            console.error("Error sending ticket panel message:", error);
            await message.reply(`❌ Failed to send the panel message to ${panelChannel}. Please double-check my permissions in that channel.`);
        }
    },
};
