// commands/prefix/reroll.js (NEW FILE)
const { EmbedBuilder } = require('discord.js');
const { findUserInGuild } = require('../../utils/findUserInGuild'); // Adjust path

module.exports = {
    name: 'reroll',
    description: 'Reroll a specific winner for a finished giveaway.',
    aliases: [],
    async execute(message, args, client) {
        // ?reroll <message_id> <@excluded_user> [channel_mention_or_id]
        if (args.length < 2) {
            return message.reply('Usage: `?reroll <message_id> <@user_to_exclude> [channel]`');
        }

        const messageId = args[0];
        const excludedUserIdentifier = args[1];
        const channelIdentifier = args[2];
        
        let channel = message.channel;
        if (channelIdentifier) {
            const channelId = channelIdentifier.replace(/[<#>]/g, '');
            const foundChannel = await message.guild.channels.fetch(channelId).catch(() => null);
            if (foundChannel && foundChannel.isTextBased()) {
                channel = foundChannel;
            } else {
                return message.reply('Invalid channel specified.');
            }
        }

        const excludedUser = await findUserInGuild(message.guild, excludedUserIdentifier);
        if (!excludedUser) {
             return message.reply(`Could not find user: "${excludedUserIdentifier}".`);
        }

        let giveawayMessage;
        try {
            giveawayMessage = await channel.messages.fetch(messageId);
        } catch (e) {
            return message.reply('❌ **Error:** Could not find a message with that ID in the specified channel.');
        }
        
        const reaction = giveawayMessage.reactions.cache.get('🎁');
        if (!reaction) {
            return message.reply('❌ **Error:** The specified message is not a valid giveaway (missing the 🎁 reaction).');
        }

        let prize = 'Unknown Prize';
        if (giveawayMessage.embeds && giveawayMessage.embeds.length > 0) {
            const embed = giveawayMessage.embeds[0];
            const prizeMatch = embed.description ? embed.description.match(/Prize:\s\*\*(.*?)\*\*/i) : null;
            if (prizeMatch && prizeMatch[1]) {
                prize = prizeMatch[1]; 
            } else if (embed.title) {
                prize = embed.title.replace(/(\s*🎁\s*|\s*🎉\s*)?Giveaway Ended:\s*/i, '').trim() || 'Unknown Prize';
            }
        }
        
        const users = await reaction.users.fetch();
        const participants = users
            .filter(user => !user.bot && user.id !== excludedUser.id)
            .map(user => user.id);
            
        if (participants.length === 0) {
            return message.reply(`⚠️ **Reroll Failed:** No valid participants to draw from (excluding the bot and ${excludedUser.tag}).`);
        }

        const newWinnerId = participants[Math.floor(Math.random() * participants.length)];
        const newWinnerMention = `<@${newWinnerId}>`;

        await message.reply({ content: `✅ **Reroll Complete!** New winner announced.` });
        
        channel.send(`🎉 **REROLL!** ${newWinnerMention} has replaced ${excludedUser} as the new winner for **${prize}**!`);
    },
};
