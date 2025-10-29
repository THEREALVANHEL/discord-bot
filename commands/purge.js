// commands/purge.js (Converted to Prefix Command)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings'); // Required for logging
const { logModerationAction } = require('../utils/logModerationAction'); // Required for logging

module.exports = {
    name: 'purge',
    description: 'Delete a specified number of messages from the channel.',
    aliases: ['clear', 'prune'], // Optional aliases
    // cooldown: 5, // Optional: Cooldown in seconds

    async execute(message, args, client) {
        // 1. Permission Check (User)
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply('❌ You need the `Manage Messages` permission to use this command.');
        }

        // 2. Permission Check (Bot)
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
        if (!message.channel.permissionsFor(botMember).has(PermissionsBitField.Flags.ManageMessages)) {
             return message.reply('❌ I need the `Manage Messages` permission in this channel to delete messages.');
        }
         // Deprecated check, use permissionsFor
         // if (!message.channel.manageable) { ... }


        // 3. Argument Parsing: ?purge <amount>
        const amount = parseInt(args[0], 10);

        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('Usage: `?purge <number_between_1_and_100>`');
        }

        // Add 1 to include the command message itself if desired, otherwise just use `amount`
        const amountToDelete = amount; // Or amount + 1

        // 4. Delete Messages
        try {
            // Fetch messages before deleting (bulkDelete requires fetched messages)
            const messages = await message.channel.messages.fetch({ limit: amountToDelete });
            const deletedMessages = await message.channel.bulkDelete(messages, true); // `true` filters messages older than 14 days

            const deletedCount = deletedMessages.size; // Get the actual number deleted

            // 5. Send Confirmation (ephemeral-like behavior: auto-delete)
            const confirmationMsg = await message.channel.send(`🧹 **Purge Executed:** ${deletedCount} message(s) deleted by ${message.author.tag}.`);
            setTimeout(() => confirmationMsg.delete().catch(() => {}), 5000); // Delete confirmation after 5 seconds

            // 6. Log Action
            const settings = await Settings.findOne({ guildId: message.guild.id });
            if (settings && settings.modlogChannelId) {
                await logModerationAction(message.guild, settings, 'Purge', message.channel, message.author, `Deleted ${deletedCount} messages`, `Amount requested: ${amount}`);
            }

            // Attempt to delete the original command message
            await message.delete().catch(() => {}); // Ignore errors if already deleted or permissions missing

        } catch (error) {
            console.error('Purge error:', error);
             // Handle specific common errors
             if (error.code === 50035) { // Invalid Form Body (often due to deleting 0 messages or other API issues)
                 message.reply('❌ Error: Could not delete messages. They might be too old (Discord limits bulk delete to messages under 14 days old).').catch(console.error);
             } else if (error.code === 50013) { // Missing Permissions
                 message.reply('❌ Error: I seem to be missing permissions to delete messages here.').catch(console.error);
             } else {
                 message.reply('❌ An unexpected error occurred while trying to purge messages.').catch(console.error);
             }
        }
    },
};
