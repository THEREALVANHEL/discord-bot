const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Get the avatar of a user')
    .addUser Option(option =>
      option.setName('target')
        .setDescription('User  to get avatar of')
        .setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser ('target') || interaction.user;
    await interaction.reply(`${user.username}'s avatar: ${user.displayAvatarURL({ dynamic: true, size: 512 })}`);
  },
};
