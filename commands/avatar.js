// commands/avatar.js (REPLACE - Added User ID fetching for non-members)
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
    let user = targetUserMention || interaction.user;

    await interaction.deferReply();

    if (targetUserId) {
        try {
            // Fetch the user object using the ID (works for any valid Discord user ID)
            user = await interaction.client.users.fetch(targetUserId);
        } catch (error) {
            return interaction.editReply({ content: '❌ **Error:** Could not find a user with that ID.', ephemeral: true });
        }
    } else if (targetUserMention) {
        user = targetUserMention;
    } else {
        user = interaction.user;
    }

    await interaction.editReply({ 
        content: `${user.username}'s avatar: ${user.displayAvatarURL({ dynamic: true, size: 512 })}`,
        ephemeral: false 
    });
  },
};
