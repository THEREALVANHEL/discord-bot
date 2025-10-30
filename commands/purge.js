// commands/purge.js (Converted to Prefix Command, Added specific logging)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings'); // Required for logging
const { logModerationAction } = require('../utils/logModerationAction'); // Required for logging

module.exports = {
    name: 'purge',
    description: 'Delete a specified number of messages from the channel.',
    aliases: ['clear', 'prune'], 
    
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

        // 3. Argument Parsing: ?purge <amount>
        const amount = parseInt(args[0], 10);

        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('Usage: `?purge <number_between_1_and_100>`');
        }
        
        // We will delete the command message separately
        const amountToDelete = amount;

        // 4. Delete Messages
        try {
            // Attempt to delete the original command message first
            await message.delete().catch(() => {}); 

            // Fetch messages (bulkDelete doesn't accept a number > 100)
            const messages = await message.channel.messages.fetch({ limit: amountToDelete });
            const deletedMessages = await message.channel.bulkDelete(messages, true); // `true` filters messages older than 14 days

            const deletedCount = deletedMessages.size; // Get the actual number deleted

            // 5. Send Confirmation (ephemeral-like behavior: auto-delete)
            const confirmationMsg = await message.channel.send(`🧹 **Purge Executed:** ${deletedCount} message(s) deleted by ${message.author.tag}.`);
            setTimeout(() => confirmationMsg.delete().catch(() => {}), 5000); // Delete confirmation after 5 seconds

            // 6. Log Action (FIX: Enhanced Logging)
            const settings = await Settings.findOne({ guildId: message.guild.id });
            if (settings && settings.modlogChannelId) {
                // Use logModerationAction utility
                await logModerationAction(
                    message.guild, 
                    settings, 
                    'Purge', // Action
                    message.channel, // Target (the channel)
                    message.author, // Moderator
                    `Deleted ${deletedCount} messages`, // Reason
                    `Amount requested: ${amount}` // Extra
                );
            }
            // --- END LOGGING FIX ---

        } catch (error) {
            console.error('Purge error:', error);
             if (error.code === 50035) { 
                 message.reply('❌ Error: Could not delete messages. They might be too old (Discord limits bulk delete to messages under 14 days old).').catch(console.error);
             } else if (error.code === 50013) { 
                 message.reply('❌ Error: I seem to be missing permissions to delete messages here.').catch(console.error);
             } else {
                 message.reply('❌ An unexpected error occurred while trying to purge messages.').catch(console.error);
             }
        }
    },
};
