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
    // Default to 'server' to show the most relevant avatar first
    const type = interaction.options.getString('type') || 'server'; 
    let user;
    let member;

    await interaction.deferReply();

    // Prioritize User ID lookup, then mention
    if (targetUserId) {
        try {
            user = await interaction.client.users.fetch(targetUserId);
            member = interaction.guild.members.cache.get(user.id) || await interaction.guild.members.fetch(user.id).catch(() => null);
        } catch (error) {
            return interaction.editReply({ content: '❌ **Error:** Could not find a user with that ID.', ephemeral: true });
        }
    } else if (targetUserMention) {
        user = targetUserMention; 
        member = interaction.guild.members.cache.get(user.id) || await interaction.guild.members.fetch(user.id).catch(() => null);
    } else {
        user = interaction.user; 
        member = interaction.member;
    }
    
    let avatarUrl;
    let avatarType;

    // Logic to select the correct URL
    if (type === 'global' || !member || !member.avatarURL()) {
        // 1. If 'global' is explicitly requested
        // 2. If the user is not a member of the current guild (no member object)
        // 3. If the user has no custom guild avatar set
        avatarUrl = user.displayAvatarURL({ dynamic: true, size: 512 });
        avatarType = 'Global/User';
    } else {
        // If 'server' is requested AND the member exists AND has a custom guild avatar
        // Note: member.displayAvatarURL() falls back to the guild avatar, but member.avatarURL()
        // specifically returns the guild avatar URL or null if none is set. 
        // We use member.displayAvatarURL() which is the most reliable source for the server-context avatar.
        avatarUrl = member.displayAvatarURL({ dynamic: true, size: 512 });
        
        // This checks if the guild avatar is DIFFERENT from the global one
        if (member.avatarURL() && member.avatarURL() !== user.avatarURL()) {
             avatarType = 'Server/Guild (Custom)';
        } else {
             avatarType = 'Global/User (As Server)';
        }
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
