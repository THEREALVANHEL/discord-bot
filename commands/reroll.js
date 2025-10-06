// commands/reroll.js (NEW - Giveaway Reroll Command with exclusion)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reroll')
    .setDescription('Reroll a specific winner for a finished giveaway.')
    .addStringOption(option =>
      option.setName('message_id')
        .setDescription('The Message ID of the giveaway to reroll.')
        .setRequired(true))
    .addUserOption(option => // NEW: Option to specify the user who is being rerolled out
      option.setName('excluded_user')
        .setDescription('The ID or mention of the user being replaced.')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel the giveaway message is in (defaults to current).')
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const messageId = interaction.options.getString('message_id');
    // We expect a Discord User object here, which allows using .id
    const excludedUser = interaction.options.getUser('excluded_user'); 
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    let message;
    try {
      message = await channel.messages.fetch(messageId);
    } catch (e) {
      return interaction.editReply({ content: '❌ **Error:** Could not find a message with that ID in the specified channel.' });
    }
    
    // Check if the message has the giveaway reaction (🎁)
    const reaction = message.reactions.cache.get('🎁');
    if (!reaction) {
      return interaction.editReply({ content: '❌ **Error:** The specified message is not a valid giveaway (missing the 🎁 reaction).' });
    }

    // Attempt to extract prize and original winners count
    let winnersCount = 1;
    let prize = 'Unknown Prize';
    
    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        const winnersField = embed.fields.find(f => f.name === 'Winners');
        if (winnersField && !isNaN(parseInt(winnersField.value))) {
            // Note: We use the original winner count to display in the embed, but we only reroll ONE slot
            winnersCount = parseInt(winnersField.value); 
        }
        
        const prizeMatch = embed.description ? embed.description.match(/Prize:\s\*\*(.*?)\*\*/i) : null;
        if (prizeMatch && prizeMatch[1]) {
            prize = prizeMatch[1];
        } else if (embed.title) {
            prize = embed.title.replace('🎁 Official Giveaway!', 'Prize');
        }
    }
    
    // Fetch all users who reacted
    const users = await reaction.users.fetch();
    
    // Filter participants: Exclude bots AND the user being replaced.
    const participants = users
        .filter(user => !user.bot && user.id !== excludedUser.id)
        .map(user => user.id);
        
    const totalEntries = participants.length;

    if (participants.length === 0) {
      return interaction.editReply({ content: `⚠️ **Reroll Failed:** No valid participants to draw from, or all remaining participants were the excluded user(s).` });
    }

    // Pick exactly ONE new winner to replace the excluded user.
    const newWinners = [];
    const shuffled = participants.sort(() => Math.random() - 0.5);
    
    // Pick 1 new winner
    newWinners.push(shuffled.pop());

    const newWinnerMentions = newWinners.map(id => `<@${id}>`).join(', ');

    const endEmbed = new EmbedBuilder()
      .setTitle('✨ Giveaway Reroll!')
      .setDescription(`**Prize:** ${prize}\n\n**Excluded Winner:** ${excludedUser}\n**New Winner:** ${newWinnerMentions}`)
      .addFields(
          { name: 'Original Winners Count', value: `${winnersCount}`, inline: true },
          { name: 'Total Eligible Entries', value: `${totalEntries}`, inline: true }, // Eligible entries excludes the rerolled user
          { name: 'Rerolled By', value: `${interaction.user.tag}`, inline: true }
      )
      .setColor(0x00BFFF) // Deep Sky Blue
      .setTimestamp();
      
    await interaction.editReply({ embeds: [endEmbed] });
    
    // Announce the new winner to the original channel
    channel.send(`🎉 **REROLL!** ${newWinnerMentions} has replaced ${excludedUser} as a winner for **${prize}**!`);
  },
};
