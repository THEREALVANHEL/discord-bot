// commands/removewarn.js (REPLACE - Added modlog for single and all removals + Fixed Syntax)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removewarn')
    .setDescription('Remove a warning from a user by index or remove all.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User to remove warning from')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('index')
        .setDescription('Warning number to remove (1-based)')
        .setRequired(false)) // Changed to false to allow 'all'
    .addStringOption(option =>
      option.setName('all_warns')
        .setDescription('Type "all" to remove all warnings.')
        .setRequired(false)),
  execute: async (interaction, client, logModerationAction) => { // FIX: Added logModerationAction + Fixed Syntax
    const target = interaction.options.getUser('target');
    const index = interaction.options.getInteger('index');
    const allWarns = interaction.options.getString('all_warns')?.toLowerCase();
    
    // Defer reply as we will need to fetch settings for logging
    await interaction.deferReply({ ephemeral: true });

    let user = await User.findOne({ userId: target.id });
    if (!user || !user.warnings.length) {
      return interaction.editReply({ 
        content: `${target} has **no warnings** on record. ✅`, 
        ephemeral: true // Keep ephemeral since it's informational/admin-only confirmation
      });
    }

    if (allWarns === 'all') {
      const removedCount = user.warnings.length;
      user.warnings = [];
      await user.save();
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Warning Log Cleared')
        .setDescription(`Moderator ${interaction.user} cleared all warnings for ${target}.`)
        .addFields(
            { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
            { name: 'Warnings Cleared', value: `**${removedCount}**`, inline: true }
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
        return interaction.editReply({ content: `❌ **Error:** Invalid warning number (1-${user.warnings.length}).`, ephemeral: true });
      }

      const removedWarn = user.warnings.splice(index - 1, 1)[0];
      await user.save();

      const embed = new EmbedBuilder()
        .setTitle('✅ Warning Removed')
        .setDescription(`Moderator ${interaction.user} removed a single warning from ${target}.`)
        .addFields(
            { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
            { name: 'Warning ID', value: `**#${index}**`, inline: true },
            { name: 'Remaining Warnings', value: `**${user.warnings.length}**`, inline: true },
            { name: 'Reason Removed', value: removedWarn.reason, inline: false }
        )
        .setColor(0x32CD32) // Lime Green
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
