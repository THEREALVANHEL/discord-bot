// commands/reroll.js (REPLACE - Giveaway Reroll Command with exclusion and fixed title)
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
    await interaction.deferReply({ ephemeral: true }); // Ensure this is ephemeral
    
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

    let winnersCount = 1;
    let prize = 'Unknown Prize';
    
    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        const winnersField = embed.fields.find(f => f.name === 'Winners');
        if (winnersField && !isNaN(parseInt(winnersField.value))) {
            winnersCount = parseInt(winnersField.value); 
        }
        
        // Extract prize from description or title, matching giveaway.js structure
        const prizeMatch = embed.description ? embed.description.match(/Prize:\s\*\*(.*?)\*\*/i) : null;
        if (prizeMatch && prizeMatch[1]) {
            prize = prizeMatch[1];
        } else if (embed.title) {
            // Remove the starting emoji and text to get the prize description
            prize = embed.title.replace('🎁 Official Giveaway!', 'Prize');
        }
    }
    
    const users = await reaction.users.fetch();
    
    // Filter participants: Exclude bots AND the user being replaced.
    const participants = users
        .filter(user => !user.bot && user.id !== excludedUser.id)
        .map(user => user.id);
        
    const totalEntries = participants.length;

    if (participants.length === 0) {
      return interaction.editReply({ content: `⚠️ **Reroll Failed:** No valid participants to draw from, or all remaining participants were the excluded user(s).` });
    }

    const newWinners = [];
    const shuffled = participants.sort(() => Math.random() - 0.5);
    
    newWinners.push(shuffled.pop());

    const newWinnerMentions = newWinners.map(id => `<@${id}>`).join(', ');

    const endEmbed = new EmbedBuilder()
      // FIX: Use the prize for the title
      .setTitle(`✨ Giveaway Reroll: ${prize}`)
      .setDescription(`**Prize:** ${prize}\n\n**Excluded Winner:** ${excludedUser}\n**New Winner:** ${newWinnerMentions}`)
      .addFields(
          { name: 'Original Winners Count', value: `${winnersCount}`, inline: true },
          { name: 'Total Eligible Entries', value: `${totalEntries}`, inline: true },
          { name: 'Rerolled By', value: `${interaction.user.tag}`, inline: true }
      )
      .setColor(0x00BFFF)
      .setTimestamp();
      
    // Change to send a simple, short ephemeral message
    await interaction.editReply({ content: `✅ **Reroll Complete!** Announcing new winner publicly.` });
    
    // Announce the full embed publicly
    channel.send({ content: `🎉 **REROLL!** ${newWinnerMentions} has replaced ${excludedUser} as a winner for **${prize}**!`, embeds: [endEmbed] });
  },
};
