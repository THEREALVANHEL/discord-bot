// commands/prefix/whois.js (NEW FILE)
const { EmbedBuilder } = require('discord.js');
const User = require('../../models/User'); // Adjust path up two levels
const { findUserInGuild } = require('../../utils/findUserInGuild'); // Adjust path

// Helper function from profile.js
const getNextLevelXp = (level) => {
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

// Helper function from profile.js
const createProgressBar = (current, needed, length = 15) => {
    const percent = Math.min(1, current / needed);
    const filledLength = Math.round(length * percent); 
    const emptyLength = length - filledLength; 
    const filled = '█'.repeat(filledLength);
    const empty = '░'.repeat(emptyLength);
    const progress = (current / needed * 100).toFixed(1);
    return `\`[${filled}${empty}]\` **${progress}%**`;
};

module.exports = {
    name: 'whois',
    description: 'Displays all information about a user.',
    aliases: ['userinfo', 'profile'], // Responds to ?userinfo and ?profile
    async execute(message, args, client) {
        let targetMember;
        
        if (args.length > 0) {
            const targetIdentifier = args.join(' ');
            targetMember = await findUserInGuild(message.guild, targetIdentifier);
            if (!targetMember) {
                return message.reply(`❌ Could not find user: "${targetIdentifier}".`);
            }
        } else {
            targetMember = message.member; // Default to command author
        }

        const targetUser = targetMember.user;

        // --- From profile.js ---
        let userDB = await User.findOne({ userId: targetUser.id });
        if (!userDB) {
            userDB = new User({ userId: targetUser.id });
            // Don't save a new user just for checking
        }

        const nextLevelXp = getNextLevelXp(userDB.level);
        const progressBar = createProgressBar(userDB.xp, nextLevelXp);
        const color = targetMember.displayColor === 0 ? 0x7289DA : targetMember.displayColor;

        // --- From userinfo.js ---
        const roles = targetMember.roles.cache
            .filter(r => r.id !== message.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(r => r.toString()); // Use mentions
            
        let rolesValue = roles.length > 0 ? roles.join(', ') : 'No roles';
        if (rolesValue.length > 1000) { 
            rolesValue = rolesValue.substring(0, 1000) + '...';
        }

        // --- Merge Embeds ---
        const embed = new EmbedBuilder()
            .setTitle(`⭐ ${targetUser.username}'s Profile Card`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .setColor(color)
            .addFields(
                // Profile Info
                { name: `Level ${userDB.level} Progress:`, 
                  value: `${progressBar}\n(XP: **${userDB.xp} / ${nextLevelXp}** for Level ${userDB.level + 1})`, 
                  inline: false 
                },
                { name: 'Coins 💰', value: `\`${userDB.coins.toLocaleString()}\``, inline: true },
                { name: 'Cookies 🍪', value: `\`${userDB.cookies.toLocaleString()}\``, inline: true },
                { name: 'Daily Streak 🔥', value: `\`${userDB.dailyStreak || 0} days\``, inline: true },
                
                // UserInfo Info
                { name: 'Nickname', value: `${targetMember.nickname || 'None'}`, inline: true },
                { name: 'Status', value: `${targetMember.presence?.status || 'Offline'}`, inline: true },
                { name: 'Boosting?', value: targetMember.premiumSince ? 'Yes' : 'No', inline: true },
                { name: 'Joined Discord', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>`, inline: false },
                { name: 'Joined Server', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:F>`, inline: false },
                { name: `Roles (${roles.length})`, value: rolesValue, inline: false }
            )
            .setFooter({ text: `User ID: ${targetUser.id}` })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
    },
};
