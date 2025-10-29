// commands/softban.js (REPLACE - Success reply now visible to everyone + GUI Update + User Tagging + Added deferReply)
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js'); // Added PermissionsBitField

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Softban a user (kick user to purge messages, allows immediate rejoin).') // Clarified description
    .addUserOption(option => // FIX: Changed 'addUser Option' to 'addUserOption'
      option.setName('target')
        .setDescription('User to softban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for softban')
        .setRequired(true))
    // Add default permissions required
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers | PermissionsBitField.Flags.KickMembers),
  async execute(interaction, client, logModerationAction) {
    // ADDED: Defer reply (public, as the action result is public)
    await interaction.deferReply();

    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');

    const member = interaction.guild.members.cache.get(target.id);
    if (!member) {
      // Use editReply
      return interaction.editReply({ content: '❌ **Error:** User not found in this server.', ephemeral: true });
    }

    if (member.id === interaction.user.id) {
       // Use editReply (ephemeral recommended for self-action errors)
       await interaction.editReply({ content: '❌ **Error:** You cannot softban yourself.', ephemeral: true });
       return; // Make sure to return after replying
    }

    // Check hierarchy and permissions
     const botMember = await interaction.guild.members.fetch(client.user.id);
     if (!botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) {
         return interaction.editReply({ content: '❌ **Error:** I do not have permission to ban members.', ephemeral: true });
     }
     if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
         return interaction.editReply({ content: '❌ **Error:** You cannot softban someone with an equal or higher role.', ephemeral: true });
     }
      if (member.roles.highest.position >= botMember.roles.highest.position) {
         return interaction.editReply({ content: '❌ **Error:** I cannot softban someone with an equal or higher role than me.', ephemeral: true });
     }
     // Deprecated check, use hierarchy checks above
     // if (member.permissions.has('Administrator')) { ... }


    try {
      // DM the user *before* banning (private)
      try {
        await target.send(`You are being softbanned from **${interaction.guild.name}** for: \`${reason}\`. This kicks you but allows you to rejoin immediately. Consider this a warning.`);
      } catch (dmError) {
        console.log(`Could not DM ${target.tag} before softban: ${dmError.message}`);
      }

      // Ban to kick and delete messages (deleteMessageSeconds: 0 = Don't delete messages for a true softban/kick effect)
      // If you want message deletion, use a value like 60 * 60 * 24 * 1 (1 day worth of messages)
      await interaction.guild.members.ban(target.id, { deleteMessageSeconds: 0, reason: `Softban: ${reason}` }); // Changed days to seconds

      // Immediate unban
      await interaction.guild.members.unban(target.id, 'Softban automatic unban');


      const embed = new EmbedBuilder()
        .setTitle('🔨 Softban Executed')
        .setDescription(`Moderator ${interaction.user} issued a softban (kick). The user can rejoin.`) // Clarified description
        .addFields(
            { name: 'Target', value: `${target} (\`${target.tag}\`)`, inline: true },
            { name: 'Action', value: 'Kick (Softban)', inline: true }, // Clarified action
            { name: 'Messages Purged?', value: 'No', inline: true }, // Based on deleteMessageSeconds: 0
            { name: 'Reason', value: reason, inline: false }
        )
        .setColor(0xDC143C) // Crimson
        .setTimestamp();

      // Public confirmation (visible to everyone) - Use editReply
      await interaction.editReply({ embeds: [embed] });

      // Log the action (private modlog)
      try {
         const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
          if (logModerationAction && settings) {
             await logModerationAction(interaction.guild, settings, 'Softban', target, interaction.user, reason, 'No messages deleted');
          }
      } catch (logError) {
          console.error("Error logging softban:", logError);
      }

    } catch (error) {
      console.error('Softban error:', error);
       // Use editReply or followUp for error after defer
       try {
           await interaction.editReply({ content: '❌ **Error:** Failed to softban user. Ensure the bot has "Ban Members" permission and is above the target user\'s role.', ephemeral: true });
       } catch (replyError) {
           await interaction.followUp({ content: '❌ **Error:** Failed to softban user. Ensure the bot has "Ban Members" permission and is above the target user\'s role.', ephemeral: true }).catch(console.error);
       }
    }
  },
};
