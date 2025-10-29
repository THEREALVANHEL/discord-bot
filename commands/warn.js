// commands/warn.js (REPLACE - Refined for better public visibility + GUI Update + User Tagging + Added deferReply)
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js'); // Added Permissions
const User = require('../models/User');
const ms = require('ms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for warning')
        .setRequired(true))
    // Add default permissions
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers), // Users need Moderate Members to warn
  async execute(interaction, client, logModerationAction) {
    // ADDED: Defer reply (public)
    await interaction.deferReply();

    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');
    const member = interaction.guild.members.cache.get(target.id); // Fetch member for checks

    if (target.bot) {
      // Use editReply (ephemeral)
      return interaction.editReply({ content: '❌ **Error:** You cannot warn bots.', ephemeral: true });
    }
    if (target.id === interaction.user.id) {
       // Use editReply (ephemeral)
      await interaction.editReply({ content: '❌ **Error:** You cannot warn yourself.', ephemeral: true });
      return;
    }

     // Check hierarchy - cannot warn users with higher/equal roles unless server owner
     if (member && member.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
         return interaction.editReply({ content: '❌ **Error:** You cannot warn someone with an equal or higher role.', ephemeral: true });
     }
     // Optionally check if target is admin (though role hierarchy should cover this)
     // if (member && member.permissions.has(PermissionsBitField.Flags.Administrator)) { ... }


    let user = await User.findOne({ userId: target.id });
    if (!user) {
      user = new User({ userId: target.id });
    }

    const warningData = {
      reason,
      moderatorId: interaction.user.id,
      date: new Date(),
    };

    user.warnings.push(warningData);

    // Use try-catch for DB save
    try {
        await user.save();
    } catch (dbError) {
         console.error("Failed to save warning to DB:", dbError);
         return interaction.editReply({ content: '❌ **Database Error:** Could not save the warning.', ephemeral: true });
    }

    const newWarningCount = user.warnings.length;

    // DM user (private) - Best effort
    try {
      await target.send(`You have been warned in **${interaction.guild.name}** for: \`${reason}\`\nThis is warning **#${newWarningCount}**.`);
    } catch (dmError) {
        console.log(`Could not DM ${target.tag} about warning: ${dmError.message}`);
    }

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Warning Issued')
      .setDescription(`Moderator ${interaction.user} issued a warning.`)
      .addFields(
        { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Total Warnings', value: `**${newWarningCount}**`, inline: true }
      )
      .setColor(0xFFA500) // Orange
      .setTimestamp();

    // Public confirmation (visible to everyone) - Use editReply
    await interaction.editReply({ embeds: [embed] });

    // Log
    try {
        const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
        if (logModerationAction && settings) {
           await logModerationAction(interaction.guild, settings, 'Warn', target, interaction.user, reason, `Warning #${newWarningCount}`);
        }
    } catch (logError) {
        console.error("Error logging warning:", logError);
    }


    // Auto timeout after 5 warnings (configurable later)
    const AUTO_TIMEOUT_THRESHOLD = 5; // Example threshold
    const AUTO_TIMEOUT_DURATION = '1h'; // Example duration

    if (newWarningCount >= AUTO_TIMEOUT_THRESHOLD) {
      if (member) { // Ensure member object exists
        // Check bot permissions and hierarchy before attempting timeout
        const botMember = await interaction.guild.members.fetch(client.user.id);
        if (botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers) && member.roles.highest.position < botMember.roles.highest.position && !member.isCommunicationDisabled())
        {
            try {
              const timeoutDuration = ms(AUTO_TIMEOUT_DURATION);
              await member.timeout(timeoutDuration, `Auto timeout: ${AUTO_TIMEOUT_THRESHOLD} warnings reached`);

              const autoTimeoutEmbed = new EmbedBuilder()
                .setTitle('🚨 Automatic Action: Timeout')
                .setDescription(`${target} has reached **${newWarningCount} warnings** and was automatically timed out for **${AUTO_TIMEOUT_DURATION}** to prevent further issues.`)
                .setColor(0xDC143C) // Crimson
                .setTimestamp();

              // Public auto-action message - Use followUp as reply is already done
               await interaction.followUp({ embeds: [autoTimeoutEmbed], ephemeral: false }).catch(console.error);

               // Log Auto Timeout
               try {
                   const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
                   if (logModerationAction && settings) {
                       await logModerationAction(interaction.guild, settings, 'Auto Timeout', target, client.user, `${AUTO_TIMEOUT_THRESHOLD} warnings reached`, `Duration: ${AUTO_TIMEOUT_DURATION}`);
                   }
               } catch (logError) {
                    console.error("Error logging auto-timeout:", logError);
               }

              // DM user about auto-timeout - Best effort
              try {
                await target.send(`You have been automatically timed out in **${interaction.guild.name}** for **${AUTO_TIMEOUT_DURATION}** due to accumulating ${newWarningCount} warnings.`);
              } catch {} // Ignore DM errors

            } catch (timeoutError) {
                console.error(`Failed to auto-timeout ${target.tag}:`, timeoutError);
                // Optionally send a follow-up if timeout fails
                await interaction.followUp({ content: `⚠️ Failed to automatically timeout ${target.tag}. Check permissions and role hierarchy.`, ephemeral: true }).catch(console.error);
            }
        } else {
             console.log(`Skipping auto-timeout for ${target.tag}: Bot lacks permissions, hierarchy issue, or user already timed out.`);
              // Optionally inform mods ephemerally
              await interaction.followUp({ content: `⚠️ ${target.tag} reached ${newWarningCount} warnings, but I couldn't apply the automatic timeout. Please check permissions/hierarchy or apply manually if needed.`, ephemeral: true }).catch(console.error);
        }
      } else {
          console.log(`Could not find member ${target.tag} for auto-timeout check.`);
      }
    }
  },
};
