// commands/removexp.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removexp')
    .setDescription('Remove XP from a user.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to remove XP from')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of XP to remove')
        .setRequired(true)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      return interaction.reply({ content: 'Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      return interaction.reply({ content: `${targetUser.tag} does not have any XP yet.`, ephemeral: true });
    }

    user.xp = Math.max(0, user.xp - amount);

    // Re-evaluate level if XP drops significantly
    let currentLevelXpThreshold = 0;
    if (user.level > 0) {
      currentLevelXpThreshold = Math.floor(100 * Math.pow(user.level, 1.5));
    }

    if (user.xp < currentLevelXpThreshold && user.level > 0) {
      user.level = Math.max(0, user.level - 1); // Simple decrement, more complex logic needed for precise level recalculation
      // For a more robust solution, you'd recalculate level based on total XP
      // For now, this is a basic adjustment.

      // Assign leveling roles
      const member = interaction.guild.members.cache.get(targetUser.id);
      if (member) {
        const levelingRoles = interaction.client.config.levelingRoles;
        for (const roleConfig of levelingRoles) {
          if (member.roles.cache.has(roleConfig.roleId)) {
            await member.roles.remove(roleConfig.roleId).catch(() => {});
          }
        }
        const newLevelRole = levelingRoles
          .filter(r => r.level <= user.level)
          .sort((a, b) => b.level - a.level)[0];
        if (newLevelRole) {
          await member.roles.add(newLevelRole.roleId).catch(() => {});
        }
      }
    }

    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('XP Removed')
      .setDescription(`Removed ${amount} XP from ${targetUser.tag}. They now have ${user.xp} XP (Level ${user.level}).`)
      .setColor(0xFF0000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
