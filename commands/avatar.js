// commands/avatar.js (REPLACE - Fixed Server vs. Global Avatar Distinction)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
// ... (omitted data)
  async execute(interaction) {
    const targetUserMention = interaction.options.getUser('target');
    const targetUserId = interaction.options.getString('user_id');
    const type = interaction.options.getString('type') || 'server'; 
    let user;

    await interaction.deferReply();

    // 1. Fetch User (Global Profile)
    // ... (omitted user fetching logic - assumed correct)

    // 2. Fetch Member (Server Profile) - Required for server-specific avatar logic
    const member = interaction.guild.members.cache.get(user.id) || await interaction.guild.members.fetch(user.id).catch(() => null);

    let avatarUrl;
    let avatarType;

    // 3. Logic to select the correct URL
    if (type === 'global' || !member) {
        // Case 1: Global explicitly requested, OR the user is not a member of the guild.
        // Use the user's primary global avatar.
        avatarUrl = user.displayAvatarURL({ dynamic: true, size: 512 });
        avatarType = 'Global/User';
    } else {
        // Case 2: Server requested AND member exists.
        // The displayAvatarURL() method on a GuildMember checks for a server avatar first.
        avatarUrl = member.displayAvatarURL({ dynamic: true, size: 512 });
        
        // Determine the actual type shown by comparing the URLs
        const customServerAvatarUrl = member.avatarURL({ dynamic: true, size: 512 });
        
        if (customServerAvatarUrl) {
            avatarType = 'Server/Guild';
        } else {
            // No custom server avatar set, so it's their global avatar displayed in the server.
            avatarType = 'Global/User (Server Default)';
        }
    }
    
    const embed = new EmbedBuilder()
// ... (omitted embed creation)
    
    await interaction.editReply({ 
        embeds: [embed],
        ephemeral: false 
    });
  },
};
