// commands/poll.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll with multiple options.')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('The title of the poll')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('options')
        .setDescription('Poll options, separated by commas (e.g., Option A, Option B, Option C)')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('ping_role')
        .setDescription('The role to ping with the poll')
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send the poll to (defaults to current channel)')
        .setRequired(false)),
  async execute(interaction) {
    const title = interaction.options.getString('title');
    const optionsString = interaction.options.getString('options');
    const pingRole = interaction.options.getRole('ping_role');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    const options = optionsString.split(',').map(opt => opt.trim());
    if (options.length < 2 || options.length > 10) {
      return interaction.reply({ content: 'Please provide between 2 and 10 options for the poll.', ephemeral: true });
    }

    const emojiList = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const pollOptions = options.map((opt, index) => `${emojiList[index]} ${opt}`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${title}`)
      .setDescription(pollOptions)
      .setColor(0x8A2BE2) // Purple color
      .setTimestamp()
      .setFooter({ text: `Poll by ${interaction.user.tag}` });

    let content = '';
    if (pingRole) {
      content = `${pingRole}`;
    }

    try {
      const pollMessage = await targetChannel.send({ content: content, embeds: [embed] });
      for (let i = 0; i < options.length; i++) {
        await pollMessage.react(emojiList[i]);
      }
      await interaction.reply({ content: 'Poll created successfully!', ephemeral: true });
    } catch (error) {
      console.error('Error creating poll:', error);
      await interaction.reply({ content: 'Failed to create poll. Do I have permissions to send messages and add reactions in that channel?', ephemeral: true });
    }
  },
};
