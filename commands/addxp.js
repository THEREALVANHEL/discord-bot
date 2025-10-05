// commands/addxp.js (REPLACE - Premium GUI + Level Up Channel + Harder XP Formula + User Tagging)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');

// Function to calculate XP needed for the next level (Harder formula)
const getNextLevelXp = (level) => {
    return Math.floor(150 * Math.pow(level + 1, 1.8));
};

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
    await interaction.deferReply();

    if (amount <= 0) {
      return interaction.editReply({ content: '❌ **Error:** Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      user = new User({ userId: targetUser.id });
    }

    user.xp += amount;
    let leveledUpMsg = '';
    let oldLevel = user.level;

    // Check for level up
    const settings = await Settings.findOne({ guildId: interaction.guild.id });
    const levelUpChannel = settings?.levelUpChannelId ? 
      interaction.guild.channels.cache.get(settings.levelUpChannelId) : 
      interaction.channel;

    let nextLevelXp = getNextLevelXp(user.level);
    
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

      // Recalculate for display after level up
      nextLevelXp = getNextLevelXp(user.level);
      
      // Send level-up message to the configured channel or the current channel
      if (levelUpChannel) {
        const levelUpEmbed = new EmbedBuilder()
          .setTitle('🚀 Level UP!')
          .setDescription(`${targetUser}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .setColor(0xFFD700) // Gold
          .setTimestamp();
        
        // Check if the old level was different before sending the level up message
        if (user.level > oldLevel) {
            await levelUpChannel.send({ content: `${targetUser}`, embeds: [levelUpEmbed] });
        }
      }
    }

    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('✨ XP Granted')
      .setDescription(`Admin ${interaction.user} granted **${amount} XP** to ${targetUser}.${leveledUpMsg}`)
      .addFields(
        { name: 'Target User', value: `${targetUser}`, inline: true },
        { name: 'Amount Added', value: `**+${amount}** ✨`, inline: true },
        { name: 'Current Level', value: `**${user.level}**`, inline: true },
      )
      .setFooter({ text: `Current XP: ${user.xp} | Next Level: ${nextLevelXp} XP Needed` })
      .setColor(0x7289DA)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
