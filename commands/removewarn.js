// commands/removewarn.js (REPLACE - Added modlog for single and all removals + Fixed Syntax + Made Public)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  // FIX: Complete data block for /removewarn
  data: new SlashCommandBuilder()
    .setName('removewarn')
    .setDescription('Remove a specific warning or all warnings from a user.')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to remove warnings from')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('index')
        .setDescription('The number of the specific warning to remove (e.g., 1)')
        .setRequired(false))
    .addStringOption(option =>
        option.setName('all_warns')
          .setDescription('Type "all" to clear all warnings for the user.')
          .setRequired(false)),
          
  execute: async (interaction, client, logModerationAction) => {
    const target = interaction.options.getUser('target');
    const index = interaction.options.getInteger('index');
    const allWarns = interaction.options.getString('all_warns')?.toLowerCase();
    
    // Defer reply as we will need to fetch settings for logging
    await interaction.deferReply({ ephemeral: true });

    let user = await User.findOne({ userId: target.id });
    if (!user || !user.warnings.length) {
      return interaction.editReply({ 
        content: `${target} has **no warnings** on record. ✅`, 
        ephemeral: true 
      });
    }

    if (allWarns === 'all') {
      const removedCount = user.warnings.length;
      user.warnings = [];
      await user.save();
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Warnings Cleared')
        .setDescription(`Moderator ${interaction.user} cleared all **${removedCount}** warnings for ${target}.`)
        .addFields(
            { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
            { name: 'Removed Warnings', value: `**${removedCount}**`, inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();

      // Log the moderation action: Clear All Warnings
      const Settings = require('../models/Settings');
      const settings = await Settings.findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Warnings Cleared', target, interaction.user, 'All warnings removed', `Count: ${removedCount}`);

      // Public confirmation (visible to everyone)
      await interaction.editReply({ embeds: [embed], ephemeral: false });

    } else if (index !== null) {
        if (index < 1 || index > user.warnings.length) {
            return interaction.editReply({ content: `❌ **Error:** Invalid warning index. Must be between 1 and ${user.warnings.length}.`, ephemeral: true });
        }
        
        const removedWarn = user.warnings.splice(index - 1, 1)[0];
        await user.save();

        const embed = new EmbedBuilder()
          .setTitle('✅ Warning Removed')
          .setDescription(`Moderator ${interaction.user} removed warning #${index} for ${target}.`)
          .addFields(
              { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
              { name: 'Remaining Warnings', value: `**${user.warnings.length}**`, inline: true },
              { name: 'Reason', value: removedWarn.reason, inline: false }
          )
          .setColor(0x00FF00)
          .setTimestamp();
        
      // Log the moderation action: Single Warning Removed
      const Settings = require('../models/Settings');
      const settings = await Settings.findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Warning Removed', target, interaction.user, removedWarn.reason, `Warning Index: #${index}`);

      // Public confirmation (visible to everyone)
      await interaction.editReply({ embeds: [embed], ephemeral: false });

    } else {
         return interaction.editReply({ content: `❌ **Error:** Please specify a warning \`index\` (e.g., 1) or type \`all\` for the \`all_warns\` option.`, ephemeral: true });
    }
  },
};
