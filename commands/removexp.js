// commands/removexp.js (REPLACE - Premium GUI + Leveling + Harder XP Formula)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

// Function to calculate XP needed for the next level (Harder formula)
const getNextLevelXp = (level) => {
    // New (Harder): 150 * Math.pow(level + 1, 1.8)
    return Math.floor(150 * Math.pow(level + 1, 1.8));
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
      return interaction.editReply({ content: `⚠️ ${targetUser.tag} does not have any XP yet.`, ephemeral: true });
    }

    user.xp = Math.max(0, user.xp - amount);

    let oldLevel = user.level;

    // Recalculate level
    if (user.level > 0) {
        const previousLevelXpThreshold = user.level > 1 ? getNextLevelXp(user.level - 1) : 0;
        
        // Drop level until XP is above the previous level's required total XP.
        // Simplified check: if current XP is less than what was needed for the previous level, decrement level.
        // A more robust way is calculating total XP, but here we stick to the current system structure.
        let tempLevel = user.level;
        while (tempLevel > 0 && user.xp < getNextLevelXp(tempLevel - 1)) {
            tempLevel--;
        }
        user.level = tempLevel;

        // Assign leveling roles if level changed
        if (oldLevel > user.level) {
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
    }

    await user.save();
    const nextLevelXp = getNextLevelXp(user.level);

    const embed = new EmbedBuilder()
      .setTitle('🔻 XP Deducted')
      .setDescription(`Successfully removed **${amount} XP** from ${targetUser}.`)
      .addFields(
        { name: 'Current XP', value: `${user.xp}`, inline: true },
        { name: 'Current Level', value: `${user.level}`, inline: true },
      )
      .setFooter({ text: `Next Level: ${nextLevelXp} XP Needed` })
      .setColor(0xFF0000)
      .setTimestamp();

    if (oldLevel > user.level) {
        embed.setDescription(embed.data.description + `\n\n**📉 Level DOWN!** ${targetUser} has dropped to **Level ${user.level}**!`);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
