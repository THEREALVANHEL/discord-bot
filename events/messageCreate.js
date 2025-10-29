const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');

// --- GIPHY API ---
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function searchGiphyGif(query) {
    const GIPHY_KEY = process.env.GIPHY_API_KEY || "";
    if (!GIPHY_KEY) {
        const fallbackGifs = [
            'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
            'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
            'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif'
        ];
        return fallbackGifs[Math.floor(Math.random() * fallbackGifs.length)];
    }
    
    const searchUrl = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=25&rating=g`;
    
    try {
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const randomIndex = Math.floor(Math.random() * Math.min(data.data.length, 10));
            return data.data[randomIndex].images.original.url;
        }
    } catch (error) {
        console.error('Giphy API error:', error);
    }
    
    const fallbackGifs = [
        'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
        'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
        'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif'
    ];
    return fallbackGifs[Math.floor(Math.random() * fallbackGifs.length)];
}

// --- GEMINI AI ---
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=";
const API_KEY = process.env.GEMINI_API_KEY || "";

async function callGeminiAI(prompt) {
    if (!API_KEY) {
        throw new Error("Gemini API key not configured");
    }
    
    try {
        const response = await fetch(GEMINI_API_URL + API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });
        
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Gemini AI error:', error);
        throw error;
    }
}

// --- CORE UTILITIES ---
const xpCooldowns = new Map();
const XP_COOLDOWN_MS = 5000;

const getNextLevelXp = (level) => Math.floor(100 * Math.pow(level + 1, 1.5));

async function manageTieredRoles(member, userValue, roleConfigs, property) {
    if (!roleConfigs || roleConfigs.length === 0) return;
    
    const targetRoleConfig = roleConfigs
      .filter(r => r[property] <= userValue)
      .sort((a, b) => b.level - a.level)[0];
    
    const targetRoleId = targetRoleConfig ? targetRoleConfig.roleId : null;

    for (const roleConfig of roleConfigs) {
        const roleId = roleConfig.roleId;
        const hasRole = member.roles.cache.has(roleId);
        
        if (roleId === targetRoleId) {
            if (!hasRole) await member.roles.add(roleId).catch(() => {});
        } else {
            if (hasRole) await member.roles.remove(roleId).catch(() => {});
        }
    }
}

// SMART USER FINDER - searches all name variations
function findUserInGuild(guild, searchTerm, authorId) {
    if (!searchTerm || searchTerm.length < 2) return null;
    
    // Check for mention or ID
    const match = searchTerm.match(/<@!?(\d+)>|(\d{17,19})/);
    if (match) {
        const id = match[1] || match[2];
        const member = guild.members.cache.get(id);
        if (id === authorId) return { self: true };
        return member;
    }

    const search = searchTerm.toLowerCase().trim();
    
    // Search through all members
    let bestMatch = null;
    let bestScore = 0;
    
    guild.members.cache.forEach(member => {
        if (member.id === authorId) return;
        
        const username = member.user.username.toLowerCase();
        const displayName = member.displayName.toLowerCase();
        const tag = member.user.tag.toLowerCase();
        
        // Exact match
        if (username === search || displayName === search || tag === search) {
            bestMatch = member;
            bestScore = 100;
            return;
        }
        
        // Contains match
        if (username.includes(search) || displayName.includes(search)) {
            if (bestScore < 80) {
                bestMatch = member;
                bestScore = 80;
            }
        }
        
        // Starts with
        if (username.startsWith(search) || displayName.startsWith(search)) {
            if (bestScore < 90) {
                bestMatch = member;
                bestScore = 90;
            }
        }
    });
    
    return bestMatch;
}

// AI-POWERED COMMAND PARSER
async function parseWithAI(userQuery, guildMembers, authorId) {
    const membersList = guildMembers.map(m => ({
        username: m.user.username,
        displayName: m.displayName,
        tag: m.user.tag,
        id: m.id
    }));
    
    const prompt = `You are a Discord bot command parser. Parse this command and return ONLY valid JSON (no markdown, no explanations).

Available members: ${JSON.stringify(membersList.slice(0, 50))}

User command: "${userQuery}"

Return JSON with this structure:
{
  "action": "ping|warn|warnlist|remove_warning|add_coins|add_cookies|add_xp|remove_coins|remove_cookies|dm|gif|avatar|account_created|joined|info|log|unknown",
  "targetUsername": "username or null",
  "targetId": "user_id or null", 
  "amount": number or null,
  "reason": "text or null",
  "gifQuery": "full search query or null",
  "dmContent": "message or null",
  "infoType": "coins|cookies|xp|level or null",
  "logCount": number or null
}

Rules:
- For GIFs, extract the FULL query (e.g., "ban hammer" not just "ban")
- Match usernames flexibly (e.g., "alien" could match "unknownalien74700")
- For warnings, extract the reason after "reason:" or ":"
- For currency, extract the amount and type (coins/cookies/xp)
- Return valid JSON only, no markdown or extra text`;

    try {
        const response = await callGeminiAI(prompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return { action: 'unknown' };
    } catch (error) {
        console.error('AI parsing error:', error);
        return { action: 'unknown' };
    }
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    
    const botMention = message.mentions.users.has(client.user.id);
    const isBleckyCommand = message.content.toLowerCase().startsWith('blecky');
    const forgottenOneRole = client.config.roles.forgottenOne;
    const isForgottenOne = message.member?.roles.cache.has(forgottenOneRole);
    
    if ((botMention || isBleckyCommand) && isForgottenOne && API_KEY) {
        let userQuery = message.content;
        if (botMention) {
            userQuery = userQuery.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        } else if (isBleckyCommand) {
            userQuery = userQuery.replace(/^blecky\s*/i, '').trim();
        }
        
        if (userQuery.length === 0) {
            await message.reply("Yes? 🐱");
            return;
        }

        try {
            const guildMembers = Array.from(message.guild.members.cache.values());
            const parsed = await parseWithAI(userQuery, guildMembers, message.author.id);
            
            console.log('AI Parsed:', parsed);
            
            // Find target user if needed
            let targetMember = null;
            if (parsed.targetUsername) {
                targetMember = findUserInGuild(message.guild, parsed.targetUsername, message.author.id);
                if (!targetMember && parsed.targetId) {
                    targetMember = message.guild.members.cache.get(parsed.targetId);
                }
            }
            
            // PING
            if (parsed.action === 'ping') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                await message.channel.send(`<@${targetMember.id}>`);
                return;
            }
            
            // LOG
            if (parsed.action === 'log') {
                const count = parsed.logCount || 10;
                const messages = await message.channel.messages.fetch({ limit: Math.min(count + 1, 50) });
                const messageList = Array.from(messages.values()).filter(m => m.id !== message.id).slice(0, count).reverse();
                
                const embed = new EmbedBuilder()
                    .setTitle(`📜 Last ${messageList.length} Messages`)
                    .setColor(0x7289DA)
                    .setTimestamp();
                
                messageList.forEach((msg, index) => {
                    const content = msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content;
                    embed.addFields({ name: `${index + 1}. ${msg.author.tag}`, value: content || '*[No content]*', inline: false });
                });
                
                await message.reply({ embeds: [embed] });
                return;
            }
            
            // WARNLIST
            if (parsed.action === 'warnlist') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                
                const targetUser = await User.findOne({ userId: targetMember.id });
                
                if (!targetUser || !targetUser.warnings || targetUser.warnings.length === 0) {
                    await message.reply(`✅ **${targetMember.user.tag}** has no warnings.`);
                    return;
                }
                
                const embed = new EmbedBuilder()
                    .setTitle(`⚠️ Warnings for ${targetMember.user.tag}`)
                    .setColor(0xFFA500)
                    .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
                    .setDescription(`Total Warnings: **${targetUser.warnings.length}**`)
                    .setTimestamp();
                
                targetUser.warnings.forEach((warn, index) => {
                    const moderator = message.guild.members.cache.get(warn.moderatorId);
                    embed.addFields({
                        name: `Warning #${index + 1}`,
                        value: `**Reason:** ${warn.reason}\n**Moderator:** ${moderator?.user.tag || 'Unknown'}\n**Date:** <t:${Math.floor(warn.date.getTime() / 1000)}:F>`,
                        inline: false
                    });
                });
                
                await message.channel.send({ embeds: [embed] });
                return;
            }
            
            // WARN
            if (parsed.action === 'warn') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                
                let targetUser = await User.findOne({ userId: targetMember.id });
                if (!targetUser) targetUser = new User({ userId: targetMember.id });
                
                const reason = parsed.reason || 'Warned by admin';
                targetUser.warnings.push({
                    reason: reason,
                    moderatorId: message.author.id,
                    date: new Date()
                });
                await targetUser.save();
                
                await message.reply(`✅ Warned **${targetMember.user.tag}**\n**Reason:** ${reason}\n**Total warnings:** ${targetUser.warnings.length}`);
                
                if (targetUser.warnings.length >= 5) {
                    try {
                        await targetMember.timeout(5 * 60 * 1000, '5 warnings reached');
                        await message.channel.send(`⏰ **${targetMember.user.tag}** timed out for 5 minutes`);
                    } catch {}
                }
                
                if (settings?.modlogChannelId) {
                    const logChannel = message.guild.channels.cache.get(settings.modlogChannelId);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('⚠️ Warning Issued')
                            .setColor(0xFFA500)
                            .addFields(
                                { name: 'Target', value: `${targetMember.user.tag} (${targetMember.id})` },
                                { name: 'Admin', value: `${message.author.tag}` },
                                { name: 'Reason', value: reason },
                                { name: 'Total', value: `${targetUser.warnings.length}` }
                            )
                            .setTimestamp();
                        logChannel.send({ embeds: [logEmbed] });
                    }
                }
                return;
            }
            
            // REMOVE WARNING
            if (parsed.action === 'remove_warning') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                
                const targetUser = await User.findOne({ userId: targetMember.id });
                
                if (!targetUser || !targetUser.warnings || targetUser.warnings.length === 0) {
                    await message.reply(`❌ **${targetMember.user.tag}** has no warnings.`);
                    return;
                }
                
                const warnIndex = parsed.amount || 1;
                
                if (warnIndex < 1 || warnIndex > targetUser.warnings.length) {
                    await message.reply(`❌ Invalid warning number. **${targetMember.user.tag}** has ${targetUser.warnings.length} warning(s).`);
                    return;
                }
                
                const removedWarn = targetUser.warnings[warnIndex - 1];
                targetUser.warnings.splice(warnIndex - 1, 1);
                await targetUser.save();
                
                await message.reply(`✅ Removed warning #${warnIndex} from **${targetMember.user.tag}**\n**Reason was:** ${removedWarn.reason}`);
                return;
            }
            
            // ADD CURRENCY
            if (parsed.action === 'add_coins' || parsed.action === 'add_cookies' || parsed.action === 'add_xp') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                
                let targetUser = await User.findOne({ userId: targetMember.id });
                if (!targetUser) targetUser = new User({ userId: targetMember.id });
                
                const amount = parsed.amount || 1;
                const currencyType = parsed.action === 'add_coins' ? 'coins' : parsed.action === 'add_cookies' ? 'cookies' : 'xp';
                
                targetUser[currencyType] += amount;
                await targetUser.save();
                
                if (currencyType === 'cookies') {
                    await manageTieredRoles(targetMember, targetUser.cookies, client.config.cookieRoles, 'cookies');
                }
                
                await message.reply(`✅ Added **${amount}** ${currencyType} to **${targetMember.user.tag}**\nThey now have **${targetUser[currencyType]}** ${currencyType}`);
                return;
            }
            
            // REMOVE CURRENCY
            if (parsed.action === 'remove_coins' || parsed.action === 'remove_cookies') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                
                const targetUser = await User.findOne({ userId: targetMember.id });
                if (!targetUser) {
                    await message.reply("❌ User not found in database.");
                    return;
                }
                
                const amount = parsed.amount || 1;
                const currencyType = parsed.action === 'remove_coins' ? 'coins' : 'cookies';
                
                if (targetUser[currencyType] < amount) {
                    await message.reply(`❌ **${targetMember.user.tag}** only has ${targetUser[currencyType]} ${currencyType}.`);
                    return;
                }
                
                targetUser[currencyType] -= amount;
                await targetUser.save();
                
                if (currencyType === 'cookies') {
                    await manageTieredRoles(targetMember, targetUser.cookies, client.config.cookieRoles, 'cookies');
                }
                
                await message.reply(`✅ Removed **${amount}** ${currencyType} from **${targetMember.user.tag}**\nThey now have **${targetUser[currencyType]}** ${currencyType}`);
                return;
            }
            
            // GIF
            if (parsed.action === 'gif') {
                const query = parsed.gifQuery || 'random';
                const gifUrl = await searchGiphyGif(query);
                await message.channel.send(gifUrl);
                return;
            }
            
            // DM
            if (parsed.action === 'dm') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                
                const content = parsed.dmContent || "Hi! 👋";
                try {
                    await targetMember.user.send(content);
                    await message.reply(`✅ Sent DM to **${targetMember.user.tag}**: "${content}"`);
                } catch {
                    await message.reply(`❌ Couldn't DM **${targetMember.user.tag}** (DMs closed)`);
                }
                return;
            }
            
            // AVATAR
            if (parsed.action === 'avatar') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                
                const avatarUrl = targetMember.user.displayAvatarURL({ dynamic: true, size: 1024 });
                const embed = new EmbedBuilder()
                    .setTitle(`${targetMember.user.tag}'s Avatar`)
                    .setImage(avatarUrl)
                    .setColor(0x7289DA);
                await message.channel.send({ embeds: [embed] });
                return;
            }
            
            // ACCOUNT CREATED
            if (parsed.action === 'account_created') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                
                const createdDate = `<t:${Math.floor(targetMember.user.createdTimestamp / 1000)}:F>`;
                await message.reply(`**${targetMember.user.tag}** created their account on ${createdDate}`);
                return;
            }
            
            // JOINED
            if (parsed.action === 'joined') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                
                const joinDate = `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:F>`;
                await message.reply(`**${targetMember.user.tag}** joined the server on ${joinDate}`);
                return;
            }
            
            // INFO
            if (parsed.action === 'info') {
                if (!targetMember) {
                    await message.reply("❌ User not found");
                    return;
                }
                
                const targetUser = await User.findOne({ userId: targetMember.id });
                const infoType = parsed.infoType || 'coins';
                let value = 0;
                
                switch(infoType) {
                    case 'coins': value = targetUser?.coins || 0; break;
                    case 'cookies': value = targetUser?.cookies || 0; break;
                    case 'xp': value = targetUser?.xp || 0; break;
                    case 'level': value = targetUser?.level || 0; break;
                }
                
                await message.reply(`**${targetMember.user.tag}** has **${value}** ${infoType}`);
                return;
            }
            
            // UNKNOWN
            await message.reply("❓ I couldn't understand that. What would you like me to do?");
            
        } catch (error) {
            console.error('AI Command Error:', error);
            await message.reply(`❌ Error: ${error.message}`);
        }
        return;
    }

    if (settings && settings.noXpChannels.includes(message.channel.id)) return;

    const cooldownKey = `${message.author.id}-${message.channel.id}`;
    const lastXpTime = xpCooldowns.get(cooldownKey);
    if (lastXpTime && (Date.now() - lastXpTime < XP_COOLDOWN_MS)) return;
    xpCooldowns.set(cooldownKey, Date.now());

    let user = await User.findOne({ userId: message.author.id });
    if (!user) user = new User({ userId: message.author.id });

    const xpGain = Math.floor(Math.random() * 3) + 3;
    user.xp += xpGain;

    const nextLevelXp = getNextLevelXp(user.level);
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;

      const member = message.member;
      if (member) {
          await manageTieredRoles(member, user.level, client.config.levelingRoles, 'level');
      }
      const levelUpChannel = settings?.levelUpChannelId ? 
        message.guild.channels.cache.get(settings.levelUpChannelId) : message.channel;
      if (levelUpChannel) {
        const levelUpEmbed = new EmbedBuilder()
          .setTitle('🚀 Level UP!')
          .setDescription(`${message.author}, you're now **Level ${user.level}**!`)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setColor(0xFFD700)
          .setTimestamp();
        await levelUpChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] });
      }
    }

    const member = message.member;
    if (member) {
        await manageTieredRoles(member, user.cookies, client.config.cookieRoles, 'cookies');
    }
    
    const autoJoinRoleId = client.config.roles.autoJoin;
    if (autoJoinRoleId && member && !member.roles.cache.has(autoJoinRoleId)) {
      await member.roles.add(autoJoinRoleId).catch(() => {});
    }

    await user.save();
  },
};
