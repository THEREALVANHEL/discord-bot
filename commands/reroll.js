// commands/reroll.js (REPLACE - Removed the secondary embed/table display)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reroll')
    .setDescription('Reroll a specific winner for a finished giveaway.')
    .addStringOption(option =>
      option.setName('message_id')
        .setDescription('The Message ID of the giveaway to reroll.')
        .setRequired(true))
    .addUserOption(option => // Option to specify the user who is being rerolled out
      option.setName('excluded_user')
        .setDescription('The ID or mention of the user being replaced.')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel the giveaway message is in (defaults to current).')
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true }); 
    
    const messageId = interaction.options.getString('message_id');
    const excludedUser = interaction.options.getUser('excluded_user'); 
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    let message;
    try {
      message = await channel.messages.fetch(messageId);
    } catch (e) {
      return interaction.editReply({ content: '❌ **Error:** Could not find a message with that ID in the specified channel.' });
    }
    
    const reaction = message.reactions.cache.get('🎁');
    if (!reaction) {
      return interaction.editReply({ content: '❌ **Error:** The specified message is not a valid giveaway (missing the 🎁 reaction).' });
    }

    let prize = 'Unknown Prize';
    
    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        
        // Prioritize the Prize field in the description, then fall back to stripping emojis from the title.
        const prizeMatch = embed.description ? embed.description.match(/Prize:\s\*\*(.*?)\*\*/i) : null;
        if (prizeMatch && prizeMatch[1]) {
            prize = prizeMatch[1]; 
        } else if (embed.title) {
            // Strip leading emoji(s) and any "Giveaway Ended:" text to get a cleaner prize string
            prize = embed.title.replace(/(\s*🎁\s*|\s*🎉\s*)?Giveaway Ended:\s*/i, '').trim();
            prize = prize || 'Unknown Prize'; // Final fallback
        }
    }
    
    const users = await reaction.users.fetch();
    
    // Filter participants: Exclude bots AND the user being replaced.
    const participants = users
        .filter(user => !user.bot && user.id !== excludedUser.id)
        .map(user => user.id);
        
    // const totalEntries = participants.length; // No longer needed
    
    if (participants.length === 0) {
      return interaction.editReply({ content: `⚠️ **Reroll Failed:** No valid participants to draw from, or all remaining participants were the excluded user(s).` });
    }

    const newWinners = [];
    const shuffled = participants.sort(() => Math.random() - 0.5);
    
    newWinners.push(shuffled.pop());

    const newWinnerMentions = newWinners.map(id => `<@${id}>`).join(', ');

    // Send a simple, short ephemeral message
    await interaction.editReply({ content: `✅ **Reroll Complete!** New winner announced publicly.` });
    
    // Announce the result publicly in a single, clean line of text
    channel.send(`🎉 **REROLL!** ${newWinnerMentions} has replaced ${excludedUser} as the new winner for **${prize}**!`);
  },
};
