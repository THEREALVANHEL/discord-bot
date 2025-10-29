// commands/timeout.js (REPLACE - Success reply now visible to everyone + GUI Update + User Tagging + Added deferReply)
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js'); // Added Permissions
const ms = require('ms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user for a specified duration.')
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User to timeout')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 10m, 1h, 1d - Max 28d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for timeout')
        .setRequired(true))
    // Add default permissions
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  async execute(interaction, client, logModerationAction) {
    // ADDED: Defer reply (public)
    await interaction.deferReply();

    const target = interaction.options.getUser('target');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');

    const member = interaction.guild.members.cache.get(target.id);
    if (!member) {
      // Use editReply (ephemeral)
      return interaction.editReply({ content: '❌ **Error:** User not found in this server.', ephemeral: true });
    }

    if (member.id === interaction.user.id) {
       // Use editReply (ephemeral)
       await interaction.editReply({ content: '❌ **Error:** You cannot timeout yourself.', ephemeral: true });
       return;
    }

     // Check hierarchy and permissions
     const botMember = await interaction.guild.members.fetch(client.user.id);
     if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
         return interaction.editReply({ content: '❌ **Error:** I do not have permission to timeout members.', ephemeral: true });
     }
     if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
         return interaction.editReply({ content: '❌ **Error:** You cannot timeout someone with an equal or higher role.', ephemeral: true });
     }
     if (member.roles.highest.position >= botMember.roles.highest.position) {
         return interaction.editReply({ content: '❌ **Error:** I cannot timeout someone with an equal or higher role than me.', ephemeral: true });
     }
     if (member.isCommunicationDisabled()) {
          return interaction.editReply({ content: `❌ **Error:** ${target.tag} is already timed out.`, ephemeral: true });
     }


    const durationMs = ms(durationStr);
    // Discord limits timeouts to 28 days
    const maxDurationMs = ms('28d');
    if (!durationMs || durationMs < 5000 || durationMs > maxDurationMs) { // Min 5 seconds
       // Use editReply (ephemeral)
      return interaction.editReply({ content: '❌ **Error:** Invalid duration. Must be between 5 seconds (5s) and 28 days (28d). Example: 10m, 1h.', ephemeral: true });
    }

    try {
      await member.timeout(durationMs, reason);

      // DM the user (private) - Best effort
      try {
        const timeoutEndTimestamp = Math.floor((Date.now() + durationMs) / 1000);
        await target.send(`You have been timed out in **${interaction.guild.name}** for **${durationStr}** for the reason: \`${reason}\`. You can communicate again <t:${timeoutEndTimestamp}:R> (at <t:${timeoutEndTimestamp}:F>).`);
      } catch (dmError) {
        console.log(`Could not DM ${target.tag} about timeout: ${dmError.message}`);
      }

      const timeoutEnd = Math.floor((Date.now() + durationMs) / 1000);

      const embed = new EmbedBuilder()
        .setTitle('⏰ User Timed Out')
        .setDescription(`Moderator ${interaction.user} has restricted messaging for a member.`)
        .addFields(
            { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
            { name: 'Duration', value: `**${durationStr}**`, inline: true },
            { name: 'Timeout Ends', value: `<t:${timeoutEnd}:R>`, inline: true }, // Relative time
            { name: 'Reason', value: reason, inline: false }
        )
        .setColor(0xFFA500) // Orange
        .setTimestamp();

      // Public confirmation (visible to everyone) - Use editReply
      await interaction.editReply({ embeds: [embed] });

      // Log
      try {
          const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
          if (logModerationAction && settings) {
             await logModerationAction(interaction.guild, settings, 'Timeout', target, interaction.user, reason, `Duration: ${durationStr}`);
          }
      } catch (logError) {
          console.error("Error logging timeout:", logError);
      }

    } catch (error) {
      console.error("Timeout error:", error);
       // Use editReply or followUp for error after defer
       try {
           await interaction.editReply({ content: '❌ **Error:** Failed to timeout user. Check my permissions (Moderate Members) and role hierarchy.', ephemeral: true });
       } catch (replyError) {
           await interaction.followUp({ content: '❌ **Error:** Failed to timeout user. Check my permissions (Moderate Members) and role hierarchy.', ephemeral: true }).catch(console.error);
       }
    }
  },
};
