// commands/avatar.js (REPLACE - Fixed User ID fetching logic to prioritize ID and correctly return target's avatar)
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Get the avatar of a user')
    .addUserOption(option => 
      option.setName('target')
        .setDescription('User to get avatar of (@mention a member)')
        .setRequired(false))
    .addStringOption(option => // NEW: Option to fetch by ID
      option.setName('user_id')
        .setDescription('User ID to get avatar of (works for non-members)')
        .setRequired(false)),
  async execute(interaction) {
    const targetUserMention = interaction.options.getUser('target');
    const targetUserId = interaction.options.getString('user_id');
    let user;

    await interaction.deferReply();

    // FIX: Prioritize User ID lookup first
    if (targetUserId) {
        try {
            // Attempt to fetch the user object using the ID (works for any valid Discord user ID)
            user = await interaction.client.users.fetch(targetUserId);
        } catch (error) {
            // If fetching by ID fails, immediately inform the user and return
            return interaction.editReply({ content: '❌ **Error:** Could not find a user with that ID.', ephemeral: true });
        }
    } else if (targetUserMention) {
        user = targetUserMention; 
    } else {
        // Fallback to the command user if no options are provided
        user = interaction.user; 
    }

    // Since 'user' is now guaranteed to be the correct user object, display the result
    await interaction.editReply({ 
        content: `${user.username}'s avatar: ${user.displayAvatarURL({ dynamic: true, size: 512 })}`,
        ephemeral: false 
    });
  },
};
