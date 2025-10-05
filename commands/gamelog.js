// commands/gamelog.js (REPLACE - Updated options and improved GUI)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamelog')
    .setDescription('Log details of a game session.')
    .addStringOption(option => // 1. REQUIRED: host
      option.setName('host')
        .setDescription('The main host of the game')
        .setRequired(true))
    .addStringOption(option => // 2. REQUIRED: initial_members - MOVED UP
      option.setName('initial_members')
        .setDescription('Number or list of members at the start')
        .setRequired(true))
    .addStringOption(option => // 3. REQUIRED: final_members - MOVED UP
      option.setName('final_members')
        .setDescription('Number or list of members at the end')
        .setRequired(true))
    .addStringOption(option => // 4. Optional: cohost - MOVED DOWN
        option.setName('cohost')
          .setDescription('The co-host of the game (optional)')
          .setRequired(false))
    .addStringOption(option => // 5. Optional: guide
      option.setName('guide')
        .setDescription('The guide for the game')
        .setRequired(false))
    .addStringOption(option => // 6. Optional: medic
      option.setName('medic')
        .setDescription('The medic for the game')
        .setRequired(false))
    .addAttachmentOption(option => // 7. Optional: image
      option.setName('image')
        .setDescription('An image related to the game session')
        .setRequired(false)),
  async execute(interaction) {
    // Defer reply immediately since this might take a moment and prevents the "Application didn't respond" error
    await interaction.deferReply({ ephemeral: false }); 

    const host = interaction.options.getString('host');
    const cohost = interaction.options.getString('cohost');
    const initialMembers = interaction.options.getString('initial_members');
    const finalMembers = interaction.options.getString('final_members');
    const guide = interaction.options.getString('guide');
    const medic = interaction.options.getString('medic');
    const image = interaction.options.getAttachment('image');

    const embed = new EmbedBuilder()
      .setTitle('👑 Official Game Session Log')
      .setColor(0xFFD700) // Gold
      .setAuthor({ name: `Game Hosted by ${host}`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setDescription(`A summary of the recent game session has been logged by ${interaction.user}.`)
      .addFields(
        { name: 'Host(s) 🧑‍💻', value: `Main Host: **${host}**\nCo-Host: **${cohost || 'N/A'}**`, inline: false },
        { name: 'Attendance 📈', value: `Initial: **${initialMembers}**\nFinal: **${finalMembers}**`, inline: true },
        { name: 'Support Staff 🤝', value: `Guide: **${guide || 'N/A'}**\nMedic: **${medic || 'N/A'}**`, inline: true },
        // Removed: { name: 'Time Hosted 🕒', value: timeHosted, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Logged by ${interaction.user.tag} | Game Log System` });

    if (image) {
      embed.setImage(image.url);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
