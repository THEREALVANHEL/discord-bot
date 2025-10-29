// commands/purgeuser.js (Converted to Prefix Command)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings'); // Required for logging
const { logModerationAction } = require('../utils/logModerationAction'); // Required for logging
const { findUserInGuild } = require('../utils/findUserInGuild'); // Required for finding user

module.exports = {
    name: 'purgeuser',
    description: 'Delete messages from a specific user in the channel.',
    aliases: ['clearuser'],
    // cooldown: 10, // Optional cooldown

    async execute(message, args, client) {
        // 1. Permission Check (User)
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply('❌ You need the `Manage Messages` permission to use this command.');
        }

        // 2. Permission Check (Bot)
        const botMember = message.guild.members.me || await message.guild.members.fetch(client.user.id);
        if (!message.channel.permissionsFor(botMember).has(PermissionsBitField.Flags.ManageMessages)) {
             return message.reply('❌ I need the `Manage Messages` permission in this channel.');
        }

        // 3. Argument Parsing: ?purgeuser <user> <amount>
        if (args.length < 2) {
            return message.reply('Usage: `?purgeuser <@user|userID|username|displayName> <number_1_to_100>`');
        }

        const targetIdentifier = args[0];
        const amount = parseInt(args[1], 10);

        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('❌ Amount must be a number between 1 and 100.');
        }

        // 4. Find Target User/Member
        const targetMember = await findUserInGuild(message.guild, targetIdentifier);
        if (!targetMember) {
            return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
        }
        const target = targetMember.user;

        if (target.id === message.author.id) {
            return message.reply('❌ You cannot purge your own messages this way (use `?purge` instead).');
        }
        if (target.bot) {
             return message.reply('❌ You cannot target bots with this command.');
        }


        // 5. Fetch and Delete User's Messages
        try {
            // Fetch last 100 messages (Discord API limit for scanning)
            const fetchedMessages = await message.channel.messages.fetch({ limit: 100 });
            // Filter messages by the target user
            const userMessages = fetchedMessages.filter(msg => msg.author.id === target.id);
            // Get the specific number requested, up to the max found
            const messagesToDelete = Array.from(userMessages.values()).slice(0, amount);

            if (messagesToDelete.length === 0) {
                return message.reply(`✅ No recent messages found from ${target.tag} in the last 100 messages scanned.`);
            }

            const deletedMessages = await message.channel.bulkDelete(messagesToDelete, true); // `true` filters messages older than 14 days
            const deletedCount = deletedMessages.size;

            // 6. Send Confirmation (ephemeral-like)
            const confirmationMsg = await message.channel.send(`🧹 **User Purge:** ${deletedCount} message(s) by ${target.tag} deleted by ${message.author.tag}.`);
            setTimeout(() => confirmationMsg.delete().catch(() => {}), 7000); // Delete confirmation after 7 seconds

            // 7. Log Action
            const settings = await Settings.findOne({ guildId: message.guild.id });
             if (settings && settings.modlogChannelId) {
                await logModerationAction(message.guild, settings, 'Purge User', target, message.author, `Deleted ${deletedCount} messages`, `Channel: ${message.channel}\nAmount requested: ${amount}`);
            }

            // Attempt to delete the original command message
            await message.delete().catch(() => {});

        } catch (error) {
            console.error('Purge User error:', error);
            if (error.code === 50035) {
                message.reply('❌ Error: Could not delete messages. They might be too old (Discord limits bulk delete to < 14 days).').catch(console.error);
            } else if (error.code === 50013) {
                message.reply('❌ Error: I seem to be missing permissions here.').catch(console.error);
            } else {
                message.reply('❌ An unexpected error occurred while purging user messages.').catch(console.error);
            }
        }
    },
};
