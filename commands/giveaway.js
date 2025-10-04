// commands/giveaway.js
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
    const durationStr = interaction.options.getString('duration');
    const prize = interaction.options.getString('prize');
    const winnersCount = interaction.options.getInteger('winners');

    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 10000) {
      return interaction.reply({ content: 'Please provide a valid duration of at least 10 seconds.', ephemeral: true });
    }
    if (winnersCount < 1 || winnersCount > 10) {
      return interaction.reply({ content: 'Number of winners must be between 1 and 10.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎉 Giveaway!')
      .setDescription(`Prize: **${prize}**\nReact with 🎉 to enter!\nEnds <t:${Math.floor((Date.now() + durationMs) / 1000)}:R>`)
      .setColor(0xFFD700)
      .setTimestamp();

    const giveawayMessage = await interaction.channel.send({ embeds: [embed] });
    await giveawayMessage.react('🎉');

    // Store giveaway info in client.giveaways Map
    client.giveaways.set(giveawayMessage.id, {
      channelId: interaction.channel.id,
      messageId: giveawayMessage.id,
      prize: prize,
      winnersCount: winnersCount,
      endTime: Date.now() + durationMs,
      participants: new Set(),
    });

    interaction.reply({ content: `Giveaway started for **${prize}**!`, ephemeral: true });

    // Set timeout to end giveaway
    setTimeout(async () => {
      const giveaway = client.giveaways.get(giveawayMessage.id);
      if (!giveaway) return;

      // Fetch the message again to get reactions
      const channel = await client.channels.fetch(giveaway.channelId);
      const message = await channel.messages.fetch(giveaway.messageId);
      const reaction = message.reactions.cache.get('🎉');

      if (!reaction) {
        return channel.send('No one participated in the giveaway.');
      }

      const users = await reaction.users.fetch();
      const participants = users.filter(user => !user.bot).map(user => user.id);

      if (participants.length === 0) {
        return channel.send('No valid participants for the giveaway.');
      }

      // Pick winners randomly
      const winners = [];
      while (winners.length < giveaway.winnersCount && participants.length > 0) {
        const winnerIndex = Math.floor(Math.random() * participants.length);
        winners.push(participants.splice(winnerIndex, 1)[0]);
      }

      const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

      const endEmbed = new EmbedBuilder()
        .setTitle('🎉 Giveaway Ended!')
        .setDescription(`Prize: **${giveaway.prize}**\nWinners: ${winnerMentions}`)
        .setColor(0x00FF00)
        .setTimestamp();

      await message.edit({ embeds: [endEmbed] });
      channel.send(`Congratulations to the winner(s): ${winnerMentions}`);

      client.giveaways.delete(giveawayMessage.id);
    }, durationMs);
  },
};
