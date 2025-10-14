// commands/removexp.js (REPLACE - Fixed infinite role add/remove loop + MODERATE XP Formula + ROBUST LEVEL DOWN LOGIC)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

// Function to calculate XP needed for the next level (MODERATE formula)
const getNextLevelXp = (level) => {
    // New Moderate: 100 * Math.pow(level + 1, 1.5)
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

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
    await interaction.deferReply();

    if (amount <= 0) {
      return interaction.editReply({ content: '❌ **Error:** Amount must be a positive number.', ephemeral: true });
    }

    let user = await User.findOne({ userId: targetUser.id });
    if (!user) {
      return interaction.editReply({ content: `⚠️ **Warning:** ${targetUser} does not have any XP yet.`, ephemeral: true });
    }

    // --- ROBUST LEVEL DOWN LOGIC START (Fixes Cascading Demotion Bug) ---

    // 1. Calculate Total XP Accumulated by the user before removal.
    let totalXP = user.xp;
    for (let i = 0; i < user.level; i++) {
        // Add the XP needed to complete each previous level (i.e., go from i to i+1)
        totalXP += getNextLevelXp(i);
    }
    
    const newTotalXP = Math.max(0, totalXP - amount);

    let newLevel = 0;
    let xpInNewLevel = newTotalXP;
    let levelDownMsg = '';

    // 2. Determine the new level by reversing the accumulation.
    for (let levelCheck = 0; levelCheck < 1000; levelCheck++) { // Iterate through possible levels
        const xpNeededToCompleteLevel = getNextLevelXp(levelCheck);
        
        if (xpInNewLevel < xpNeededToCompleteLevel) {
            newLevel = levelCheck;
            break; // Found the correct level
        }
        
        // This is not the correct level, so subtract the XP needed for this level and continue up.
        xpInNewLevel -= xpNeededToCompleteLevel;
    }
    
    const oldLevel = user.level;
    const leveledDown = newLevel < oldLevel;

    user.level = newLevel;
    user.xp = xpInNewLevel; // This is the remaining XP within the new level tier

    // --- ROBUST LEVEL DOWN LOGIC END ---


    // Assign leveling roles if level changed (FIXED logic)
    if (leveledDown) {
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
        levelDownMsg = `\n\n**📉 Level DOWN!** ${targetUser} has dropped to **Level ${user.level}**! (Was Level ${oldLevel})`;
    }


    await user.save();
    const nextLevelXp = getNextLevelXp(user.level);

    const embed = new EmbedBuilder()
      .setTitle('🔻 XP Deducted')
      .setDescription(`Admin ${interaction.user} deducted **${amount} XP** from ${targetUser}.${levelDownMsg}`)
      .addFields(
        { name: 'Target User', value: `${targetUser}`, inline: true },
        { name: 'Amount Removed', value: `**-${amount}** ✨`, inline: true },
        { name: 'Current Level', value: `**${user.level}**`, inline: true }
      )
      .setFooter({ text: `Current XP: ${user.xp} | Next Level: ${nextLevelXp} XP Needed` })
      .setColor(0xFF0000)
      .setTimestamp();


    await interaction.editReply({ embeds: [embed] });
  },
};
