// commands/addxp.js (REPLACE - Premium GUI + Level Up Channel)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addxp')
    .setDescription('Add XP to a user.')
    .addUserOption(option =>
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
      return interaction.reply({ content: '❌ **Error:** Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      user = new User({ userId: targetUser.id });
    }

    user.xp += amount;
    let leveledUpMsg = '';

    // Check for level up
    const settings = await Settings.findOne({ guildId: interaction.guild.id });
    const levelUpChannel = settings?.levelUpChannelId ? 
      interaction.guild.channels.cache.get(settings.levelUpChannelId) : 
      interaction.channel;

    const nextLevelXp = Math.floor(100 * Math.pow(user.level + 1, 1.5));
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp; // Carry over excess XP
      
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
      
      leveledUpMsg = `\n\n**🚀 Level UP!** ${targetUser} has leveled up to **Level ${user.level}**!`;

      // Send level-up message to the configured channel or the current channel
      if (levelUpChannel) {
        const levelUpEmbed = new EmbedBuilder()
          .setTitle('🚀 Level UP!')
          .setDescription(`${targetUser}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .setColor(0xFFD700) // Gold
          .setTimestamp();
        
        await levelUpChannel.send({ content: `${targetUser}`, embeds: [levelUpEmbed] });
      }
    }

    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('✨ XP Granted')
      .setDescription(`Successfully added **${amount} XP** to ${targetUser}.\n\nNew Status:`)
      .addFields(
        { name: 'Current XP', value: `${user.xp}`, inline: true },
        { name: 'Current Level', value: `${user.level}`, inline: true },
      )
      .setFooter({ text: `Next Level: ${nextLevelXp} XP Needed` })
      .setColor(0x7289DA)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
