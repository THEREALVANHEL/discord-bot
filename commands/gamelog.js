// commands/gamelog.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamelog')
    .setDescription('Log details of a game session.')
    .addStringOption(option => // 1. Required
      option.setName('host')
        .setDescription('The host of the game')
        .setRequired(true))
    .addStringOption(option => // 2. Required (Moved up)
      option.setName('participants')
        .setDescription('List of participants (e.g., User1, User2, User3)')
        .setRequired(true))
    .addStringOption(option => // 3. Required (Moved up)
      option.setName('time_hosted')
        .setDescription('When the game was hosted (e.g., 2023-10-27 19:00 UTC)')
        .setRequired(true))
    .addStringOption(option => // 4. Optional
      option.setName('cohost')
        .setDescription('The co-host of the game')
        .setRequired(false))
    .addStringOption(option => // 5. Optional
      option.setName('guide')
        .setDescription('The guide for the game')
        .setRequired(false))
    .addStringOption(option => // 6. Optional
      option.setName('medic')
        .setDescription('The medic for the game')
        .setRequired(false))
    .addAttachmentOption(option => // 7. Optional
      option.setName('image')
        .setDescription('An image related to the game session')
        .setRequired(false)),
  async execute(interaction) {
    const host = interaction.options.getString('host');
    // Ensure you update the order of options being fetched in execute if needed
    // (In this case, it relies on option names, so only deployment is affected)
    const cohost = interaction.options.getString('cohost');
    const guide = interaction.options.getString('guide');
    const medic = interaction.options.getString('medic');
    const participants = interaction.options.getString('participants');
    const timeHosted = interaction.options.getString('time_hosted');
    const image = interaction.options.getAttachment('image');
    
    // ... rest of the command logic
  },
};
