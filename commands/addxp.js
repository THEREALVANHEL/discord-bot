// commands/addxp.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addxp')
    .setDescription('Add XP to a user.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('The user to add XP to')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of XP to add')
        .setRequired(true)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      return interaction.reply({ content: 'Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      user = new User({ userId: targetUser.id });
    }

    user.xp += amount;

    // Check for level up
    const nextLevelXp = Math.floor(100 * Math.pow(user.level + 1, 1.5));
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp; // Carry over excess XP

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
      await interaction.channel.send(`${targetUser}, congratulations! You leveled up to level ${user.level}! 🎉`);
    }

    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('XP Added')
      .setDescription(`Added ${amount} XP to ${targetUser.tag}. They now have ${user.xp} XP (Level ${user.level}).`)
      .setColor(0x00FF00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
