// commands/spinawheel.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spinawheel')
    .setDescription('Spin a wheel with up to 10 options to pick a winner.')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('The title of the wheel spin')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('options')
        .setDescription('Options for the wheel, separated by commas (e.g., Option A, Option B)')
        .setRequired(true)),
  async execute(interaction) {
    const title = interaction.options.getString('title');
    const optionsString = interaction.options.getString('options');
    const options = optionsString.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);

    if (options.length < 2 || options.length > 10) {
      return interaction.reply({ content: 'Please provide between 2 and 10 options for the wheel.', ephemeral: true });
    }

    await interaction.deferReply(); // Defer reply as we'll "spin"

    // Simulate spinning
    const spinningMessages = [
      'Spinning the wheel...',
      'And the wheel goes round and round...',
      'Almost there...',
      'The tension is building!',
    ];

    for (let i = 0; i < spinningMessages.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      await interaction.editReply({ content: spinningMessages[i] });
    }

    const winner = options[Math.floor(Math.random() * options.length)];

    const embed = new EmbedBuilder()
      .setTitle(`🎡 ${title} - Winner!`)
      .setDescription(`The wheel landed on... **${winner}**! Congratulations!`)
      .setColor(0xFFD700) // Gold color
      .addFields(
        { name: 'All Options', value: options.join(', ') },
      )
      .setTimestamp();

    await interaction.editReply({ content: ' ', embeds: [embed] });
  },
};
