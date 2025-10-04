// commands/gamelog.js (REPLACE - Fixed option order, Premium GUI)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamelog')
    .setDescription('Log details of a game session.')
    .addStringOption(option => // 1. REQUIRED
      option.setName('host')
        .setDescription('The host of the game')
        .setRequired(true))
    .addStringOption(option => // 2. REQUIRED (Moved up)
      option.setName('participants')
        .setDescription('List of participants (e.g., User1, User2, User3)')
        .setRequired(true))
    .addStringOption(option => // 3. REQUIRED (Moved up)
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
    // Defer reply immediately since this might take a moment and prevents the "Application didn't respond" error
    await interaction.deferReply({ ephemeral: false }); 

    const host = interaction.options.getString('host');
    const participants = interaction.options.getString('participants');
    const timeHosted = interaction.options.getString('time_hosted');
    const cohost = interaction.options.getString('cohost');
    const guide = interaction.options.getString('guide');
    const medic = interaction.options.getString('medic');
    const image = interaction.options.getAttachment('image');

    const embed = new EmbedBuilder()
      .setTitle('📢 Official Game Session Log')
      .setColor(0x3498DB)
      .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .addFields(
        { name: 'Host(s) 👑', value: `${host}` + (cohost ? ` & ${cohost}` : ''), inline: false },
        { name: 'Support Staff 🤝', value: `Guide: ${guide || 'N/A'}, Medic: ${medic || 'N/A'}`, inline: false },
        { name: 'Time Hosted 🕒', value: timeHosted, inline: false },
        { name: 'Participants 👥', value: participants },
      )
      .setTimestamp()
      .setFooter({ text: `Logged by ${interaction.user.tag}` });

    if (image) {
      embed.setImage(image.url);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
