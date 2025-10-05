\// commands/removewarn.js (REPLACE - Added modlog for single and all removals + Fixed Syntax + Made Public)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
// ... (data block)
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
        ephemeral: true 
      });
    }

    if (allWarns === 'all') {
      const removedCount = user.warnings.length;
      user.warnings = [];
      await user.save();
      
      const embed = new EmbedBuilder()
// ... (embed creation code)

      // Log the moderation action: Clear All Warnings
      const Settings = require('../models/Settings');
      const settings = await Settings.findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Warnings Cleared', target, interaction.user, 'All warnings removed', `Count: ${removedCount}`);

      // FIX: Public confirmation (visible to everyone)
      await interaction.editReply({ embeds: [embed], ephemeral: false });

    } else if (index !== null) {
// ... (validation code)

      const removedWarn = user.warnings.splice(index - 1, 1)[0];
      await user.save();

      const embed = new EmbedBuilder()
// ... (embed creation code)
        
      // Log the moderation action: Single Warning Removed
      const Settings = require('../models/Settings');
      const settings = await Settings.findOne({ guildId: interaction.guild.id });
      await logModerationAction(interaction.guild, settings, 'Warning Removed', target, interaction.user, removedWarn.reason, `Warning Index: #${index}`);

      // FIX: Public confirmation (visible to everyone)
      await interaction.editReply({ embeds: [embed], ephemeral: false });

    } else {
         return interaction.editReply({ content: `❌ **Error:** Please specify a warning \`index\` (e.g., 1) or type \`all\` for the \`all_warns\` option.`, ephemeral: true });
    }
  },
};
