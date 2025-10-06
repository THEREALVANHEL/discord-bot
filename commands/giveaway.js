// commands/giveaway.js (REPLACE - Fixed Syntax for setTimeout to avoid deploy error + Added Total Entries)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway.')
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
    // FIX: Defer reply immediately for stability against Discord timeouts
    await interaction.deferReply({ ephemeral: true }); 

    const durationStr = interaction.options.getString('duration');
    const prize = interaction.options.getString('prize');
    const winnersCount = interaction.options.getInteger('winners');

    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 10000) {
      // Use editReply since we deferred
      return interaction.editReply({ content: '❌ **Error:** Please provide a valid duration of at least 10 seconds.' });
    }
    if (winnersCount < 1 || winnersCount > 10) {
      // Use editReply since we deferred
      return interaction.editReply({ content: '❌ **Error:** Number of winners must be between 1 and 10.' });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎁 Official Giveaway!')
      .setDescription(`**Prize:** ${prize}\n\n**To Enter:** React with 🎁\n**Ends:** <t:${Math.floor((Date.now() + durationMs) / 1000)}:R>`)
      .addFields(
        { name: 'Winners', value: `${winnersCount}` }
      )
      .setColor(0xFFD700)
      .setTimestamp()
      .setFooter({ text: `Hosted by ${interaction.user.tag}` });

    // Send the public message
    const giveawayMessage = await interaction.channel.send({ embeds: [embed] });
    await giveawayMessage.react('🎁'); 

    // Store giveaway info in client.giveaways Map
    client.giveaways.set(giveawayMessage.id, {
      channelId: interaction.channel.id,
      messageId: giveawayMessage.id,
      prize: prize,
      winnersCount: winnersCount,
      endTime: Date.now() + durationMs,
    });

    // FIX: Use editReply to confirm the ephemeral deferral
    interaction.editReply({ content: `✅ **Giveaway Started!** For **${prize}**!`, ephemeral: true });

    // Set timeout to end giveaway
    setTimeout(() => { // FIX: Use standard function wrapper
      (async () => { // FIX: Use async IIFE for inner async logic
          const giveaway = client.giveaways.get(giveawayMessage.id);
          if (!giveaway) return;

          client.giveaways.delete(giveawayMessage.id);
          
          const channel = await client.channels.fetch(giveaway.channelId);
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
          const totalEntries = participants.length; // Get total entries

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
          
          const endEmbed = new EmbedBuilder()
            .setTitle('🎉 Giveaway Concluded!')
            .setDescription(`**Prize:** ${giveaway.prize}\n\n**Winner(s):** ${winnerMentions}`)
            .addFields(
                { name: 'Total Entries', value: `${totalEntries}`, inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp()
            .setFooter({ text: 'Congratulations!' });

          await message.edit({ embeds: [endEmbed], components: [] }); // Remove components on end
          // Send winner pings in the content field to ensure they are properly notified
          channel.send(`**CONGRATULATIONS!** ${winnerMentions} won **${giveaway.prize}**! Please contact the host to claim your prize.`);
      })();
    }, durationMs);
  },
};
