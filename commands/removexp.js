// commands/removexp.js (REPLACE - Premium GUI + Leveling + Harder XP Formula + User Tagging)
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
      return interaction.editReply({ content: `⚠️ **Warning:** ${targetUser} does not have any XP yet.`, ephemeral: true });
    }

    user.xp = Math.max(0, user.xp - amount);

    let oldLevel = user.level;
    let levelDownMsg = '';

    // Recalculate level
    if (user.level > 0) {
        // Drop level until XP is above the previous level's required total XP.
        let tempLevel = user.level;
        let leveledDown = false;
        while (tempLevel > 0 && user.xp < getNextLevelXp(tempLevel - 1)) {
            tempLevel--;
            leveledDown = true;
        }
        user.level = tempLevel;

        // Assign leveling roles if level changed
        if (leveledDown) {
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
            levelDownMsg = `\n\n**📉 Level DOWN!** ${targetUser} has dropped to **Level ${user.level}**!`;
        }
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
