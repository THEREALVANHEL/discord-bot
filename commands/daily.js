// commands/daily.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const ms = require('ms'); // npm install ms

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coins and XP!'),
  async execute(interaction) {
    const cooldown = ms('24h'); // 24-hour cooldown
    let user = await User.findOne({ userId: interaction.user.id });

    if (!user) {
      user = new User({ userId: interaction.user.id });
    }

    if (user.lastDaily && cooldown - (Date.now() - user.lastDaily.getTime()) > 0) {
      const timeLeft = ms(cooldown - (Date.now() - user.lastDaily.getTime()), { long: true });
      return interaction.reply({ content: `You can claim your daily reward again in ${timeLeft}.`, ephemeral: true });
    }

    const coinsEarned = Math.floor(Math.random() * 50) + 50; // 50-100 coins
    const xpEarned = Math.floor(Math.random() * 20) + 10;   // 10-30 XP

    user.coins += coinsEarned;
    user.xp += xpEarned;
    user.lastDaily = new Date();

    // Check for level up (similar logic as messageCreate)
    const nextLevelXp = Math.floor(100 * Math.pow(user.level + 1, 1.5));
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;

      const member = interaction.guild.members.cache.get(interaction.user.id);
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
      await interaction.channel.send(`${interaction.user}, congratulations! You leveled up to level ${user.level}! 🎉`);
    }

    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('Daily Reward Claimed!')
      .setDescription(`You received **${coinsEarned} coins** 💰 and **${xpEarned} XP**!`)
      .setColor(0x32CD32) // Lime Green
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
