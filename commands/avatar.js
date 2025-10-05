// commands/avatar.js (REPLACE - Final Server vs. Global Avatar Distinction)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
// ... (omitted data)
  execute: async (interaction) => {
    const targetUserMention = interaction.options.getUser('target');
    const targetUserId = interaction.options.getString('user_id');
    const type = interaction.options.getString('type') || 'server'; 
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

    // 3. Logic to select the correct URL
    if (type === 'global' || !member) {
        // Case 1: Global explicitly requested, OR the user is not a member of the guild.
        avatarUrl = user.displayAvatarURL({ dynamic: true, size: 512 });
        avatarType = 'Global/User';
    } else {
        // Case 2: Server requested AND member exists.
        // The displayAvatarURL() method on a GuildMember returns the server avatar if set, 
        // or the global avatar as a fallback (which is the correct behavior for what's 'displayed in server').
        avatarUrl = member.displayAvatarURL({ dynamic: true, size: 512 });
        
        // Determine the actual type shown by checking for a *custom* server avatar.
        // We use member.avatarURL() which returns null if no *custom* server avatar exists.
        const customServerAvatarUrl = member.avatarURL({ dynamic: true, size: 512 });
        
        if (customServerAvatarUrl) {
            // User has a custom server avatar set.
            avatarType = 'Server/Guild';
        } else {
            // User has no custom server avatar set, so the image is their global avatar.
            avatarType = 'Global/User (Server Default)';
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
