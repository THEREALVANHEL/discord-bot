// commands/poll.js (REPLACE - Added duration/result subcommand, Premium GUI)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ms = require('ms');

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
            .setDescription('Manually end a poll and show results.')
            .addStringOption(option =>
                option.setName('message_id')
                    .setDescription('The message ID of the poll')
                    .setRequired(true))),
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const emojiList = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    
    // Helper function to handle the end of a poll
    async function endPoll(channel, messageId, client, interaction, isManual = false) {
        let message;
        try {
            message = await channel.messages.fetch(messageId);
        } catch {
            return interaction.reply({ content: '❌ **Error:** Poll message not found or I do not have permissions.', ephemeral: true });
        }

        const pollData = client.giveaways.get(messageId) || {};
        client.giveaways.delete(messageId); // Using client.giveaways map for temporary poll storage

        const reactions = message.reactions.cache.filter(reaction => emojiList.includes(reaction.emoji.name));

        const results = [];
        let totalVotes = 0;
        let winningOption = { count: -1, text: 'No Votes' };

        for (const reaction of reactions.values()) {
            const count = reaction.count - 1; // Exclude bot's own reaction
            const index = emojiList.indexOf(reaction.emoji.name);
            const optionText = message.embeds[0].description.split('\n')[index]?.substring(3).trim() || `Option ${index + 1}`;
            
            totalVotes += count;
            results.push({ emoji: reaction.emoji.name, text: optionText, count });

            if (count > winningOption.count) {
                winningOption = { count, text: optionText };
            } else if (count === winningOption.count) {
                winningOption.text += ` & ${optionText}`; // Handle ties
            }
        }
        
        // Final result embed
        const resultEmbed = new EmbedBuilder()
            .setTitle(`✅ Poll Ended: ${message.embeds[0].title.substring(2).trim()}`)
            .setDescription(results.map(r => 
                `**${r.emoji} ${r.text}:** ${r.count} votes (${((r.count / totalVotes) * 100).toFixed(1)}%)`
            ).join('\n') || 'No votes recorded.')
            .addFields(
                { name: 'Winner(s)', value: `**${winningOption.text}** with **${winningOption.count}** votes!` },
                { name: 'Total Votes', value: `${totalVotes}`, inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp()
            .setFooter({ text: `Poll ended by ${isManual ? interaction.user.tag : 'Duration Expired'}` });

        await message.edit({ embeds: [resultEmbed], components: [] });
        channel.send(`📊 **Results for Poll:** ${message.url}`);
    }

    if (subcommand === 'create') {
        const title = interaction.options.getString('title');
        const optionsString = interaction.options.getString('options');
        const durationStr = interaction.options.getString('duration');
        const pingRole = interaction.options.getRole('ping_role');
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        const options = optionsString.split(',').map(opt => opt.trim()).filter(Boolean);
        if (options.length < 2 || options.length > 10) {
            return interaction.reply({ content: '❌ **Error:** Please provide between 2 and 10 options for the poll, separated by commas.', ephemeral: true });
        }
        
        let durationMs = 0;
        if (durationStr) {
            durationMs = ms(durationStr);
            if (!durationMs || durationMs < 60000) {
                return interaction.reply({ content: '❌ **Error:** Invalid duration. Must be at least 1 minute (e.g., 1m, 1h).', ephemeral: true });
            }
        }

        const pollOptions = options.map((opt, index) => `${emojiList[index]} **${opt}**`).join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`🗳️ Poll: ${title}`)
            .setDescription(pollOptions)
            .addFields(
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
            
            // Store poll data for timed closure (using client.giveaways as generic timed storage)
            if (durationMs > 0) {
                client.giveaways.set(pollMessage.id, {
                    channelId: targetChannel.id,
                    messageId: pollMessage.id,
                });
                setTimeout(() => endPoll(targetChannel, pollMessage.id, client, interaction), durationMs);
            }
            
            await interaction.reply({ content: `✅ **Poll Created!** Sent to ${targetChannel}.`, ephemeral: true });
        } catch (error) {
            console.error('Error creating poll:', error);
            await interaction.reply({ content: '❌ **Error:** Failed to create poll. Check my permissions (send messages, add reactions, embed links).', ephemeral: true });
        }
    } else if (subcommand === 'result') {
        await interaction.deferReply({ ephemeral: true });
        const messageId = interaction.options.getString('message_id');
        
        let channel;
        try {
            // Find the message in the current channel first
            channel = interaction.channel;
            await endPoll(channel, messageId, client, interaction, true);
            await interaction.editReply({ content: `✅ **Poll Ended!** Results posted.` });
        } catch (error) {
            console.error('Manual poll end failed:', error);
            await interaction.editReply({ content: '❌ **Error:** Failed to end poll. Make sure the message ID is correct and I have access to the channel.' });
        }
    }
  },
};
