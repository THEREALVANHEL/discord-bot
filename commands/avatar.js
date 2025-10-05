// commands/avatar.js (REPLACE - Added option to choose between Server/Global Avatar)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Get the avatar of a user')
    .addUserOption(option => 
      option.setName('target')
        .setDescription('User to get avatar of (@mention a member)')
        .setRequired(false))
    .addStringOption(option => // Option to fetch by ID (works for non-members)
      option.setName('user_id')
        .setDescription('User ID to get avatar of (works for non-members)')
        .setRequired(false))
    .addStringOption(option => // NEW: Option to choose avatar type
        option.setName('type')
        .setDescription('Choose between the Server/Guild Avatar or the Global/User Avatar.')
        .setRequired(false)
        .addChoices(
            { name: 'Server/Guild Avatar', value: 'server' },
            { name: 'Global/User Avatar', value: 'global' }
        )),
  async execute(interaction) {
    const targetUserMention = interaction.options.getUser('target');
    const targetUserId = interaction.options.getString('user_id');
    const type = interaction.options.getString('type') || 'server'; // Default to server
    let user;

    await interaction.deferReply();

    // Prioritize User ID lookup
    if (targetUserId) {
        try {
            user = await interaction.client.users.fetch(targetUserId);
        } catch (error) {
            return interaction.editReply({ content: '❌ **Error:** Could not find a user with that ID.', ephemeral: true });
        }
    } else if (targetUserMention) {
        user = targetUserMention; 
    } else {
        user = interaction.user; 
    }
    
    let avatarUrl;
    let avatarType;

    if (type === 'global' && user.avatarURL()) {
        // Use user.avatarURL() for the global profile picture
        avatarUrl = user.avatarURL({ dynamic: true, size: 512 });
        avatarType = 'Global/User';
    } else {
        // Use user.displayAvatarURL() for the guild profile picture (which falls back to global if no guild avatar)
        avatarUrl = user.displayAvatarURL({ dynamic: true, size: 512 });
        avatarType = 'Server/Guild';
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`🖼️ ${user.username}'s ${avatarType} Avatar`)
        .setDescription(`[Click here to view the image directly](${avatarUrl})`)
        .setImage(avatarUrl)
        .setFooter({ text: `User ID: ${user.id}` })
        .setColor(0x0099FF);


    await interaction.editReply({ 
        embeds: [embed],
        ephemeral: false 
    });
  },
};
