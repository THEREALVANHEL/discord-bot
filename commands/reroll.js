// commands/reroll.js (NEW - Giveaway Reroll Command)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reroll')
    .setDescription('Reroll the winner(s) for a finished giveaway.')
    .addStringOption(option =>
      option.setName('message_id')
        .setDescription('The Message ID of the giveaway to reroll.')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel the giveaway message is in (defaults to current).')
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const messageId = interaction.options.getString('message_id');
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

    let winnersCount = 1;
    let prize = 'Unknown Prize';
    
    // Try to extract prize and winner count from the original embed
    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        // The giveaway embed stores winners count in a field
        const winnersField = embed.fields.find(f => f.name === 'Winners');
        if (winnersField && !isNaN(parseInt(winnersField.value))) {
            winnersCount = parseInt(winnersField.value);
        }
        
        // Try to get prize from description
        const prizeMatch = embed.description ? embed.description.match(/Prize:\s\*\*(.*?)\*\*/i) : null;
        if (prizeMatch && prizeMatch[1]) {
            prize = prizeMatch[1];
        } else if (embed.title) {
            prize = embed.title.replace('🎁 Official Giveaway!', 'Prize');
        }
    }
    
    // Fetch all users who reacted
    const users = await reaction.users.fetch();
    const participants = users.filter(user => !user.bot).map(user => user.id);
    const totalEntries = participants.length;

    if (participants.length === 0) {
      return interaction.editReply({ content: '⚠️ **Reroll Failed:** No valid participants to draw from.' });
    }

    // Pick winners randomly
    const winners = [];
    const shuffled = participants.sort(() => Math.random() - 0.5);
    while (winners.length < winnersCount && shuffled.length > 0) {
      winners.push(shuffled.pop());
    }

    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

    const endEmbed = new EmbedBuilder()
      .setTitle('✨ Giveaway Reroll!')
      .setDescription(`**Prize:** ${prize}\n\n**New Winner(s):** ${winnerMentions}`)
      .addFields(
          { name: 'Total Entries', value: `${totalEntries}`, inline: true },
          { name: 'Rerolled By', value: `${interaction.user.tag}`, inline: true }
      )
      .setColor(0x00BFFF) // Deep Sky Blue
      .setTimestamp();
      
    await interaction.editReply({ embeds: [endEmbed] });
    
    // Announce the new winner to the original channel
    channel.send(`🎉 **NEW WINNER!** ${winnerMentions} won **${prize}** via manual reroll!`);
  },
};
