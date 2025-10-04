// commands/profile.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your or another user\'s profile.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user whose profile you want to view')
        .setRequired(false)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target') || interaction.user;
    const member = interaction.guild.members.cache.get(targetUser.id);

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      user = new User({ userId: targetUser.id }); // Create a new user if not found
      await user.save();
    }

    const nextLevelXp = Math.floor(100 * Math.pow(user.level + 1, 1.5));
    const xpProgress = user.xp;
    const xpNeeded = nextLevelXp;

    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.username}'s Profile`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setColor(member?.displayColor || 0x00AE86) // Use member's role color or green
      .addFields(
        { name: 'Level', value: `${user.level}`, inline: true },
        { name: 'XP', value: `${xpProgress}/${xpNeeded}`, inline: true },
        { name: 'Cookies 🍪', value: `${user.cookies}`, inline: true },
        { name: 'Coins 💰', value: `${user.coins}`, inline: true },
        { name: 'Joined Discord', value: `<t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:D>`, inline: true },
        { name: 'Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : 'N/A', inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
