// commands/work.js (REPLACE - Premium GUI + Level Up Channel)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');
const ms = require('ms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work to earn coins and XP!'),
  cooldown: 3600, // 1 hour cooldown
  async execute(interaction, client) {
    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) {
      user = new User({ userId: interaction.user.id });
    }

    const cooldown = ms('1h');
    if (user.lastWork && (Date.now() - user.lastWork.getTime()) < cooldown) {
      const timeLeft = ms(cooldown - (Date.now() - user.lastWork.getTime()), { long: true });
      return interaction.reply({ content: `⏱️ You can work again in **${timeLeft}**.`, ephemeral: true });
    }

    // 80% success rate
    if (Math.random() > 0.8) {
      user.lastWork = new Date();
      await user.save();
      const failEmbed = new EmbedBuilder()
        .setTitle('😔 Work Failed')
        .setDescription('You tried to work but got distracted, ending up with no earnings. Try again in an hour!')
        .setColor(0xFF0000)
        .setTimestamp();
      return interaction.reply({ embeds: [failEmbed], ephemeral: true });
    }

    const workProgression = client.config.workProgression;
    const currentJob = workProgression.filter(job => job.level <= user.level).sort((a, b) => b.level - a.level)[0];

    if (!currentJob) {
      return interaction.reply({ content: '⚠️ You need to reach a certain level to start working!', ephemeral: true });
    }

    const coinsEarned = Math.floor(Math.random() * (currentJob.coinReward / 2)) + currentJob.coinReward;
    const xpEarned = Math.floor(Math.random() * (currentJob.xpReward / 2)) + currentJob.xpReward;

    user.coins += coinsEarned;
    user.xp += xpEarned;
    user.lastWork = new Date();

    // Level up check
    const settings = await Settings.findOne({ guildId: interaction.guild.id });
    const levelUpChannel = settings?.levelUpChannelId ? 
      interaction.guild.channels.cache.get(settings.levelUpChannelId) : 
      interaction.channel;

    const nextLevelXp = Math.floor(100 * Math.pow(user.level + 1, 1.5));
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;

      const member = interaction.guild.members.cache.get(interaction.user.id);
      if (member) {
        const levelingRoles = client.config.levelingRoles;
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
      
      // Send level-up message
      if (levelUpChannel) {
        const levelUpEmbed = new EmbedBuilder()
          .setTitle('🚀 Level UP!')
          .setDescription(`${interaction.user}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setColor(0xFFD700)
          .setTimestamp();
        
        await levelUpChannel.send({ content: `${interaction.user}`, embeds: [levelUpEmbed] });
      }
    }

    await user.save();

    const embed = new EmbedBuilder()
      .setTitle(`💼 ${currentJob.title} - Payday!`)
      .setDescription(`You successfully completed your task!`)
      .addFields(
        { name: 'Coins Earned', value: `${coinsEarned} 💰`, inline: true },
        { name: 'XP Earned', value: `${xpEarned} ✨`, inline: true },
        { name: 'Current Coins', value: `${user.coins} 💰`, inline: true },
        { name: 'Current Level', value: `${user.level} ✨`, inline: true }
      )
      .setColor(0x8B4513)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
