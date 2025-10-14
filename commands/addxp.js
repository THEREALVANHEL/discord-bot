// commands/addxp.js (REPLACE - Fixed infinite role add/remove loop + MODERATE XP Formula)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');

// Function to calculate XP needed for the next level (MODERATE formula)
const getNextLevelXp = (level) => {
    // New Moderate: 100 * Math.pow(level + 1, 1.5)
    return Math.floor(100 * Math.pow(level + 1, 1.5));
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
        
        // FIX: Find the single highest eligible role
        const targetLevelRole = levelingRoles
            .filter(r => r.level <= user.level)
            .sort((a, b) => b.level - a.level)[0];

        const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;

        for (const roleConfig of levelingRoles) {
            const roleId = roleConfig.roleId;
            const hasRole = member.roles.cache.has(roleId);
            
            if (roleId === targetLevelRoleId) {
                // If this is the correct role but the user doesn't have it, add it.
                if (!hasRole) {
                    await member.roles.add(roleId).catch(() => {});
                }
            } else {
                // If the user has a different leveling role, remove it.
                if (hasRole) {
                    await member.roles.remove(roleId).catch(() => {});
                }
            }
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
