// commands/giveaway.js (REPLACE - Finalizing Title Strings)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms');

// Helper function to handle the end of a giveaway (external to execute)
async function endGiveaway(client, giveaway) {
    client.giveaways.delete(giveaway.messageId);

    // Fetch the channel; if it fails, the giveaway simply ends without logging
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) return;

    let message;
    try {
        message = await channel.messages.fetch(giveaway.messageId);
    } catch {
        return channel.send(`❌ **Error:** Giveaway message not found for prize: **${giveaway.prize}**.`);
    }

    const reaction = message.reactions.cache.get('🎁');
    if (!reaction) {
        return channel.send(`⚠️ **Giveaway Ended:** No one participated in the giveaway for **${giveaway.prize}**.`);
    }

    const users = await reaction.users.fetch();
    const participants = users.filter(user => !user.bot).map(user => user.id);
    const totalEntries = participants.length;

    if (participants.length === 0) {
        return channel.send(`⚠️ **Giveaway Ended:** No valid participants for **${giveaway.prize}**.`);
    }

    // Pick winners randomly
    const winners = [];
    const shuffled = participants.sort(() => Math.random() - 0.5);
    while (winners.length < giveaway.winnersCount && shuffled.length > 0) {
        winners.push(shuffled.pop());
    }

    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

    const giveawayTitle = giveaway.title || giveaway.prize; // Use the stored title, fallback to prize if missing

    const endEmbed = new EmbedBuilder()
        // FIX: Title is now descriptive for the end result
        .setTitle(`🎉 Giveaway Ended: ${giveawayTitle}`) 
        .setDescription(`**Prize:** ${giveaway.prize}\n\n**Winner(s):** ${winnerMentions}`)
        .addFields(
            // The final embed shows the true, filtered count
            { name: 'Total Entries', value: `${totalEntries}`, inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp()
        .setFooter({ text: 'Congratulations!' });

    await message.edit({ embeds: [endEmbed], components: [] });
    channel.send(`**CONGRATULATIONS!** ${winnerMentions} won **${giveaway.prize}**! Please contact the host to claim your prize.`);
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway.')
    .addStringOption(option => // NEW: Title option
      option.setName('title')
        .setDescription('A custom title for the giveaway (e.g., Summer Event, Milestone)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 1h, 30m)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('prize')
        .setDescription('Prize description')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('winners')
        .setDescription('Number of winners')
        .setRequired(true)),
  async execute(interaction, client) {
    // FIX 1: Defer reply immediately for stability against Discord timeouts
    await interaction.deferReply({ ephemeral: true }); 

    // Get the new title option
    const title = interaction.options.getString('title'); 
    const durationStr = interaction.options.getString('duration');
    const prize = interaction.options.getString('prize');
    const winnersCount = interaction.options.getInteger('winners');

    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 10000) {
      return interaction.editReply({ content: '❌ **Error:** Please provide a valid duration of at least 10 seconds.' });
    }
    if (winnersCount < 1 || winnersCount > 10) {
      return interaction.editReply({ content: '❌ **Error:** Number of winners must be between 1 and 10.' });
    }
    
    // Initial Embed: Set Total Entries to 0 to avoid unstable fetch/update logic
    const initialEmbed = new EmbedBuilder()
      // FIX: Use a descriptive title for the live giveaway, incorporating the new title
      .setTitle(`🎁 ${title}: ${prize}`) 
      .setDescription(`**Prize:** ${prize}\n\n**To Enter:** React with 🎁\n**Ends:** <t:${Math.floor((Date.now() + durationMs) / 1000)}:R>`)
      .addFields(
        { name: 'Winners', value: `${winnersCount}`, inline: true },
        // Display 0 non-bot entries until the end result is calculated
        { name: 'Total Entries', value: '0 (Non-bot Participants)', inline: true } 
      )
      .setColor(0xFFD700)
      .setTimestamp()
      .setFooter({ text: `Hosted by ${interaction.user.tag}` });

    // Send the public message
    const giveawayMessage = await interaction.channel.send({ embeds: [initialEmbed] });
    await giveawayMessage.react('🎁'); 

    // Create giveaway object for client map and eventual timeout
    const giveawayData = {
        channelId: interaction.channel.id,
        messageId: giveawayMessage.id,
        prize: prize, 
        title: title, // NEW: Store the custom title
        winnersCount: winnersCount,
        endTime: Date.now() + durationMs,
    };
    
    // Store giveaway info in client.giveaways Map
    client.giveaways.set(giveawayMessage.id, giveawayData);

    // Use editReply to confirm the ephemeral deferral
    await interaction.editReply({ content: `✅ **Giveaway Started!** For **${prize}**!`, ephemeral: true });

    // FIX 2: Set timeout using the robust helper function pattern
    setTimeout(endGiveaway, durationMs, client, giveawayData);
  },
};
