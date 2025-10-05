// commands/giveaway.js (REPLACE - Fixed winner pings + Added Total Entries)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms');

module.exports = {
// ... (data and execute setup)
    // Set timeout to end giveaway
    setTimeout(async () => {
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
            { name: 'Total Entries', value: `${totalEntries}`, inline: true } // ADDED
        )
        .setColor(0x00FF00)
        .setTimestamp()
        .setFooter({ text: 'Congratulations!' });

      await message.edit({ embeds: [endEmbed] });
      // Send winner pings in the content field to ensure they are properly notified
      channel.send(`**CONGRATULATIONS!** ${winnerMentions} won **${giveaway.prize}**! Please contact the host to claim your prize.`);

    }, durationMs);
  },
};
