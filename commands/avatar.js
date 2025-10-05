// commands/avatar.js (REPLACE - Removed 'type' option, always shows server-preferred avatar)
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
        .setRequired(false)),
  
  execute: async (interaction) => {
    const targetUserMention = interaction.options.getUser('target');
    const targetUserId = interaction.options.getString('user_id');
    let user;

    await interaction.deferReply();

    // 1. Fetch User (Global Profile)
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
    
    // 2. Fetch Member (Server Profile) - Required for server-specific avatar logic
    const member = interaction.guild.members.cache.get(user.id) || await interaction.guild.members.fetch(user.id).catch(() => null);

    let avatarUrl;
    let avatarType;

    // Logic: Always show the server-preferred avatar, using global as fallback for non-members.
    if (member) {
        // Use member.displayAvatarURL(), which gives the custom server avatar if set, 
        // or the global avatar as the server default fallback.
        avatarUrl = member.displayAvatarURL({ dynamic: true, size: 512 });
        
        // Determine the text description: is the current avatar a custom server avatar?
        // member.avatarURL() returns the custom server avatar URL or null.
        const customServerAvatarUrl = member.avatarURL({ dynamic: true, size: 512 });
        
        if (customServerAvatarUrl) {
            avatarType = 'Server/Guild';
        } else {
            // No custom server avatar set, so the image is their global avatar.
            avatarType = 'Server Profile (Global Default)';
        }
    } else {
        // Not a member, fallback to global user avatar
        avatarUrl = user.displayAvatarURL({ dynamic: true, size: 512 });
        avatarType = 'Global/User';
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
