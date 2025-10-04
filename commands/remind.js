// commands/remind.js (REPLACE - Saves to DB)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const ms = require('ms');

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
  async execute(interaction, client) {
    const timeString = interaction.options.getString('time');
    const message = interaction.options.getString('message');

    const timeInMs = ms(timeString);

    if (!timeInMs || timeInMs < 10000) {
      return interaction.reply({ content: '❌ **Error:** Please provide a valid time (e.g., 10s, 5m, 1h, 2d). Minimum 10 seconds.', ephemeral: true });
    }

    const reminderTime = new Date(Date.now() + timeInMs);

    // Save reminder to database
    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) user = new User({ userId: interaction.user.id });
    
    // Create an object structure that matches the schema, but without _id yet
    const newReminder = {
        message: message,
        remindAt: reminderTime,
        channelId: interaction.channel.id,
    };

    // Mongoose will automatically assign an _id when pushing to the array
    user.reminders.push(newReminder);
    await user.save();
    
    // Fetch the saved reminder to get the _id assigned by MongoDB
    const savedReminder = user.reminders[user.reminders.length - 1];

    const embed = new EmbedBuilder()
      .setTitle('⏰ Reminder Set!')
      .setDescription(`I will remind you about: **${message}**\n\n**Reminding You:** <t:${Math.floor(reminderTime.getTime() / 1000)}:R>`)
      .addFields({ name: 'Reminder ID', value: `\`${savedReminder._id}\``, inline: true }) // Added ID for reference
      .setColor(0x1E90FF)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

    // Set timeout to trigger the reminder
    const timeout = setTimeout(async () => {
      try {
        const reminderEmbed = new EmbedBuilder()
          .setTitle('🔔 Personal Reminder!')
          .setDescription(`You asked me to remind you about: **${message}**`)
          .setColor(0xFF4500)
          .setTimestamp();
        
        // Try DM first
        await interaction.user.send({ embeds: [reminderEmbed] });
        
      } catch (error) {
        console.error(`Could not send reminder to ${interaction.user.tag}:`, error);
        // Fallback to channel if DM fails
        await interaction.channel.send({ content: `${interaction.user}, ⚠️ I tried to DM you about your reminder, but couldn't. Here it is: **${message}**` });
      } finally {
          // Remove from client map after sending
          client.reminders.delete(savedReminder._id.toString());
          // Remove from DB (in case it wasn't removed on load or by /remind remove)
          let finalUser = await User.findOne({ userId: interaction.user.id });
          if (finalUser) {
              finalUser.reminders = finalUser.reminders.filter(r => r._id.toString() !== savedReminder._id.toString());
              await finalUser.save();
          }
      }
    }, timeInMs);
    
    // Store timeout ID for cancellation
    client.reminders.set(savedReminder._id.toString(), timeout);
  },
};
