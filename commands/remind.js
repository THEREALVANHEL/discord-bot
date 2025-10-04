// commands/remind.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ms = require('ms'); // npm install ms

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder for yourself.')
    .addStringOption(option =>
      option.setName('time')
        .setDescription('How long until I remind you? (e.g., 10m, 1h, 3d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('What do you want to be reminded about?')
        .setRequired(true)),
  async execute(interaction) {
    const timeString = interaction.options.getString('time');
    const message = interaction.options.getString('message');

    const timeInMs = ms(timeString);

    if (!timeInMs || timeInMs < 10000) { // Minimum 10 seconds
      return interaction.reply({ content: 'Please provide a valid time (e.g., 10s, 5m, 1h, 2d). Minimum 10 seconds.', ephemeral: true });
    }

    const reminderTime = new Date(Date.now() + timeInMs);

    const embed = new EmbedBuilder()
      .setTitle('Reminder Set!')
      .setDescription(`I will remind you about "${message}" on <t:${Math.floor(reminderTime.getTime() / 1000)}:F>.`)
      .setColor(0x1E90FF) // Dodger Blue
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

    setTimeout(async () => {
      try {
        const reminderEmbed = new EmbedBuilder()
          .setTitle('🔔 Reminder!')
          .setDescription(`You asked me to remind you about: **${message}**`)
          .setColor(0xFF4500) // Orange Red
          .setTimestamp();

        await interaction.user.send({ embeds: [reminderEmbed] });
      } catch (error) {
        console.error(`Could not send reminder to ${interaction.user.tag}:`, error);
        // Fallback to channel if DM fails
        await interaction.channel.send({ content: `${interaction.user}, I tried to DM you about your reminder, but couldn't. Here it is: **${message}**` });
      }
    }, timeInMs);
  },
};
