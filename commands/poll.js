// commands/poll.js (REPLACE - Added duration/result subcommand, Premium GUI, Multi-choice, Tie fix, Owner-only button)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ms = require('ms');

const emojiList = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

// Helper function to handle the end of a poll
async function endPoll(channel, messageId, client, interaction, isManual = false) {
    let message;
    try {
        message = await channel.messages.fetch(messageId);
    } catch (e) {
        // Only reply if it's a manual end attempt (and we are inside a valid interaction)
        if (isManual && interaction) {
             // The interaction would have been deferred in interactionCreate.js
             return interaction.editReply({ content: '❌ **Error:** Poll message not found or I do not have permissions to read the messages.' });
        }
        return;
    }

    const pollData = client.polls.get(messageId);
    client.polls.delete(messageId); 

    const reactions = message.reactions.cache.filter(reaction => emojiList.includes(reaction.emoji.name));

    const results = [];
    let totalVotes = 0;
    let winningOptions = []; // Array to store options for ties
    let maxVotes = -1;

    for (const reaction of reactions.values()) {
        const count = reaction.count - 1; // Exclude bot's own reaction
        const index = emojiList.indexOf(reaction.emoji.name);
        // Safely extract option text from the embed description
        const optionText = message.embeds[0].description.split('\n')[index]?.substring(3).trim() || `Option ${index + 1}`;
        
        totalVotes += count;
        results.push({ emoji: reaction.emoji.name, text: optionText, count });

        if (count > maxVotes) {
            maxVotes = count;
            winningOptions = [{ text: optionText, count }];
        } else if (count === maxVotes && count > 0) {
            winningOptions.push({ text: optionText, count });
        }
    }
    
    const winnerText = winningOptions.map(w => w.text).join(' & ');
    
    // Final result embed
    const resultEmbed = new EmbedBuilder()
        .setTitle(`✅ Poll Ended: ${message.embeds[0].title.substring(2).trim()}`)
        .setDescription(results.map(r => 
            `**${r.emoji} ${r.text}:** ${r.count} votes (${((r.count / totalVotes) * 100).toFixed(1)}%)`
        ).join('\n') || 'No votes recorded.')
        .addFields(
            { name: 'Winner(s)', value: `**${winnerText || 'No Votes'}** with **${maxVotes > 0 ? maxVotes : 0}** votes!` },
            { name: 'Total Votes', value: `${totalVotes}`, inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp()
        .setFooter({ text: `Poll ended by ${isManual ? interaction.user.tag : 'Duration Expired'}` });

    await message.edit({ embeds: [resultEmbed], components: [] });
    // Send the announcement message visible to everyone in the channel
    channel.send(`📊 **Results for Poll:** ${message.url}`);
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll with multiple options.')
    .addSubcommand(subcommand =>
        subcommand.setName('create')
            .setDescription('Create a new poll.')
            .addStringOption(option =>
                option.setName('title')
                    .setDescription('The title of the poll')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('options')
                    .setDescription('Poll options, separated by commas (2-10 options)')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('duration')
                    .setDescription('How long the poll will last (e.g., 1h, 30m, optional)')
                    .setRequired(false))
            .addBooleanOption(option =>
                option.setName('multi_choice') // NEW
                    .setDescription('Allow users to select multiple options? (Default: False)')
                    .setRequired(false))
            .addRoleOption(option =>
                option.setName('ping_role')
                    .setDescription('The role to ping with the poll')
                    .setRequired(false))
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('The channel to send the poll to (defaults to current channel)')
                    .setRequired(false)))
    .addSubcommand(subcommand =>
        subcommand.setName('result')
            .setDescription('Manually end a poll and show results (Mod/Admin Only).')
            .addStringOption(option =>
                option.setName('message_id')
                    .setDescription('The message ID of the poll')
                    .setRequired(true))),
  // Expose endPoll function to interactionCreate for button handling
  endPoll: endPoll,
  
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'create') {
        await interaction.deferReply({ ephemeral: true }); // Defer to prevent Unknown Interaction
        
        const title = interaction.options.getString('title');
        const optionsString = interaction.options.getString('options');
        const durationStr = interaction.options.getString('duration');
        const multiChoice = interaction.options.getBoolean('multi_choice') || false;
        const pingRole = interaction.options.getRole('ping_role');
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        const options = optionsString.split(',').map(opt => opt.trim()).filter(Boolean);
        if (options.length < 2 || options.length > 10) {
            return interaction.editReply({ content: '❌ **Error:** Please provide between 2 and 10 options for the poll, separated by commas.' });
        }
        
        let durationMs = 0;
        if (durationStr) {
            durationMs = ms(durationStr);
            if (!durationMs || durationMs < 60000) {
                return interaction.editReply({ content: '❌ **Error:** Invalid duration. Must be at least 1 minute (e.g., 1m, 1h).' });
            }
        }

        const pollOptions = options.map((opt, index) => `${emojiList[index]} **${opt}**`).join('\n');
        
        const typeText = multiChoice ? 'Multi-Choice Allowed' : 'Single Choice';

        const embed = new EmbedBuilder()
            .setTitle(`🗳️ Poll: ${title}`)
            .setDescription(pollOptions)
            .addFields(
                { name: 'Type', value: typeText, inline: true }, // NEW
                { name: 'Ends', value: durationMs > 0 ? `<t:${Math.floor((Date.now() + durationMs) / 1000)}:R>` : 'Never (Manual Close)', inline: true },
                { name: 'Created By', value: `${interaction.user.tag}`, inline: true }
            )
            .setColor(0x8A2BE2)
            .setTimestamp()
            .setFooter({ text: `Vote by reacting with the corresponding emoji.` });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('poll_result_manual')
                    .setLabel('End Poll Now')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🛑'),
            );

        let content = '';
        if (pingRole) {
            content = `${pingRole}`;
        }

        try {
            const pollMessage = await targetChannel.send({ content: content, embeds: [embed], components: [row] });
            for (let i = 0; i < options.length; i++) {
                await pollMessage.react(emojiList[i]).catch(console.error);
            }
            
            // Store poll data for timed closure and button permission check
            client.polls.set(pollMessage.id, {
                channelId: targetChannel.id,
                messageId: pollMessage.id,
                creatorId: interaction.user.id, // Store creator ID for button check
                multiChoice: multiChoice, // Store type
            });
            
            if (durationMs > 0) {
                setTimeout(() => endPoll(targetChannel, pollMessage.id, client), durationMs);
            }
            
            await interaction.editReply({ content: `✅ **Poll Created!** Sent to ${targetChannel}.` });
        } catch (error) {
            console.error('Error creating poll:', error);
            await interaction.editReply({ content: '❌ **Error:** Failed to create poll. Check my permissions (send messages, add reactions, embed links).' });
        }
    } else if (subcommand === 'result') {
        // Permission check is already in interactionCreate.js
        await interaction.deferReply({ ephemeral: true });
        const messageId = interaction.options.getString('message_id');
        
        const channel = interaction.channel; // Assume it's in the current channel

        // End poll is now a helper function
        await endPoll(channel, messageId, client, interaction, true);
        await interaction.editReply({ content: `✅ **Poll Ended!** Results posted.` });
    }
  },
};
