const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');

// --- LEVENSHTEIN DISTANCE ---
function levenshteinDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

// --- AI UTILITIES ---
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=";
const API_KEY = process.env.GEMINI_API_KEY || "";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, payload, maxRetries = 3) {
    let lastError = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const fullUrl = url + API_KEY;
            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                await delay(Math.pow(2, i) * 1000);
            }
        }
    }
    throw lastError;
}

// Search Giphy API for GIFs
async function searchGiphyGif(query) {
    const GIPHY_KEY = process.env.GIPHY_API_KEY || "YOUR_GIPHY_API_KEY_HERE";
    const searchUrl = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=25&rating=g`;
    
    try {
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const randomIndex = Math.floor(Math.random() * Math.min(data.data.length, 10));
            return data.data[randomIndex].url;
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

// IMPROVED user resolution - prioritizes exact matches
function resolveUser(guild, input, authorId) {
    if (!input || input.length < 2) return null;
    
    // Check for mention or ID first
    const match = input.match(/<@!?(\d+)>|(\d{17,19})/);
    if (match) {
        const id = match[1] || match[2];
        const member = guild.members.cache.get(id);
        if (id === authorId) return { self: true };
        return member;
    }

    const searchKey = input.toLowerCase().trim();
    
    // Priority 1: Exact username match
    let exactMatch = guild.members.cache.find(m => 
        m.id !== authorId && 
        (m.user.username.toLowerCase() === searchKey || m.displayName.toLowerCase() === searchKey)
    );
    if (exactMatch) return exactMatch;
    
    // Priority 2: Username starts with search
    let startsWithMatch = guild.members.cache.find(m =>
        m.id !== authorId &&
        (m.user.username.toLowerCase().startsWith(searchKey) || m.displayName.toLowerCase().startsWith(searchKey))
    );
    if (startsWithMatch) return startsWithMatch;
    
    // Priority 3: Username contains search
    let containsMatch = guild.members.cache.find(m =>
        m.id !== authorId &&
        (m.user.username.toLowerCase().includes(searchKey) || m.displayName.toLowerCase().includes(searchKey))
    );
    if (containsMatch) return containsMatch;
    
    // Priority 4: Fuzzy match
    let bestMatch = null;
    let bestScore = 999;

    guild.members.cache.forEach(member => {
        if (member.id === authorId) return;
        
        const username = member.user.username.toLowerCase();
        const displayName = member.displayName.toLowerCase();
        
        const distUser = levenshteinDistance(searchKey, username);
        const distDisplay = levenshteinDistance(searchKey, displayName);
        const minDist = Math.min(distUser, distDisplay);
        const maxAllowed = Math.max(1, Math.floor(searchKey.length / 4));
        
        if (minDist < bestScore && minDist <= maxAllowed) {
            bestScore = minDist;
            bestMatch = member;
        }
    });

    return bestMatch;
}

// COMPREHENSIVE command parser
function parseCommand(text, guild, authorId) {
    const lower = text.toLowerCase().trim();
    const words = lower.split(/\s+/);
    
    // Skip words for target detection
    const skipWords = ['blecky', 'warn', 'add', 'remove', 'send', 'dm', 'how', 'many', 'does', 'have', 'show', 'when', 'did', 'to', 'for', 'from', 'me', 'a', 'an', 'the', 'coins', 'coin', 'cookies', 'cookie', 'xp', 'level', 'saying', 'message', 'gif', 'give', 'reason', 'is', 'with', 'picture', 'avatar', 'profile', 'image', 'ping', 'warnlist', 'list', 'of', 'warning', 'one'];
    
    // Find target user - improved logic
    const findTarget = () => {
        // First try to find mentions
        const mentionMatch = text.match(/<@!?(\d+)>/);
        if (mentionMatch) {
            const id = mentionMatch[1];
            const member = guild.members.cache.get(id);
            if (id === authorId) return { self: true };
            return member;
        }
        
        // Then try word by word
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (skipWords.includes(word) || word.length < 2 || word.match(/^\d+$/)) continue;
            
            const resolved = resolveUser(guild, word, authorId);
            if (resolved?.self) return { self: true };
            if (resolved) return resolved;
        }
        return null;
    };
    
    // === REMOVE WARNING ===
    if (lower.match(/remove.*warning|remove.*warn|delete.*warn/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't remove your own warnings" };
        
        // Extract warning number
        const warnNumMatch = lower.match(/warning\s*(\d+)|warn\s*(\d+)|#?\s*(\d+)/i);
        const warnIndex = warnNumMatch ? parseInt(warnNumMatch[1] || warnNumMatch[2] || warnNumMatch[3]) : 1;
        
        if (target) {
            return {
                type: 'REMOVE_WARNING',
                targetId: target.id,
                warnIndex: warnIndex
            };
        }
    }
    
    // === REMOVE CURRENCY ===
    if (lower.match(/remove|take/i) && lower.match(/coin|cookie/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't remove from yourself" };
        
        const amountMatch = lower.match(/(\d+)/);
        const amount = amountMatch ? parseInt(amountMatch[1]) : 1;
        
        let command = 'removecoins';
        if (lower.includes('cookie')) command = 'removecookies';
        
        if (target) {
            return {
                type: 'REMOVE_CURRENCY',
                command: command,
                targetId: target.id,
                amount: amount
            };
        }
    }
    
    // === WARNLIST ===
    if (lower.match(/(?:show|get|view|check).*(?:warnlist|warnings)|warnlist.*(?:of|for)/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Check your own warnlist" };
        if (target) {
            return {
                type: 'WARNLIST',
                targetId: target.id
            };
        }
    }
    
    // === PING ===
    if (lower.match(/^ping\s+/i) && !lower.includes('saying') && !lower.includes('dm')) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't ping yourself" };
        if (target) {
            return {
                type: 'PING',
                targetId: target.id
            };
        }
    }
    
    // === PROFILE / AVATAR ===
    if (lower.match(/(?:send|show|get).*(?:profile|avatar|picture|pfp)/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't get your own avatar" };
        if (target) {
            return {
                type: 'AVATAR',
                targetId: target.id
            };
        }
    }
    
    // === ACCOUNT CREATED ===
    if (lower.match(/when.*(?:make|create|made).*(?:account|discord)/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Check your own profile" };
        if (target) {
            return {
                type: 'ACCOUNT_CREATED',
                targetId: target.id
            };
        }
    }
    
    // === GIF - Extract subject properly ===
    if (lower.match(/send.*gif|.*gif/i)) {
        // Remove all noise words and get the subject
        let gifQuery = text
            .replace(/blecky/gi, '')
            .replace(/send/gi, '')
            .replace(/me/gi, '')
            .replace(/a/gi, '')
            .replace(/an/gi, '')
            .replace(/the/gi, '')
            .replace(/gif/gi, '')
            .trim();
        
        // If nothing left, use random
        if (!gifQuery || gifQuery.length === 0) {
            gifQuery = 'random';
        }
        
        return {
            type: 'GIF',
            query: gifQuery
        };
    }
    
    // === DM ===
    if (lower.includes('dm')) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't DM yourself" };
        
        const contentMatch = text.match(/(?:saying|say|message|tell|:)\s+(.+)/i);
        const content = contentMatch ? contentMatch[1].trim() : "Hi!";
        
        if (target) {
            return {
                type: 'DM',
                targetId: target.id,
                content: content
            };
        }
    }
    
    // === WARN ===
    if (lower.includes('warn') && !lower.includes('warnlist') && !lower.includes('remove')) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't warn yourself" };
        
        const reasonMatch = text.match(/(?:reason|for|because|:)\s+(.+)/i);
        const reason = reasonMatch ? reasonMatch[1].trim() : 'Warned by admin';
        
        if (target) {
            return {
                type: 'WARN',
                targetId: target.id,
                reason: reason
            };
        }
    }
    
    // === ADD CURRENCY ===
    if (lower.match(/add|give/i) && lower.match(/coin|cookie|xp/i) && !lower.includes('remove')) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't add to yourself" };
        
        const amountMatch = lower.match(/(\d+)/);
        const amount = amountMatch ? parseInt(amountMatch[1]) : 1;
        
        let command = 'addcoins';
        if (lower.includes('cookie')) command = 'addcookies';
        if (lower.includes('xp')) command = 'addxp';
        
        if (target) {
            return {
                type: 'ADD_CURRENCY',
                command: command,
                targetId: target.id,
                amount: amount
            };
        }
    }
    
    // === INFO QUERIES ===
    if (lower.match(/how many|how much/i)) {
        const target = findTarget();
        let query = 'coins';
        if (lower.includes('cookie')) query = 'cookies';
        if (lower.includes('xp')) query = 'xp';
        if (lower.includes('level')) query = 'level';
        
        if (target?.self) return { type: 'ERROR', message: "Check your own stats" };
        if (target) {
            return {
                type: 'INFO',
                targetId: target.id,
                query: query
            };
        }
    }
    
    // === JOINED DATE ===
    if (lower.match(/when.*join/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Check your own join date" };
        if (target) {
            return {
                type: 'JOINED',
                targetId: target.id
            };
        }
    }
    
    return null;
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    
    // --- AI ADMIN HANDLER ---
    const botMention = message.mentions.users.has(client.user.id);
    const isBleckyCommand = message.content.toLowerCase().startsWith('blecky');
    const forgottenOneRole = client.config.roles.forgottenOne;
    const isForgottenOne = message.member?.roles.cache.has(forgottenOneRole);
    
    if ((botMention || isBleckyCommand) && isForgottenOne && API_KEY !== "") {
        let userQuery = message.content;
        if (botMention) {
            userQuery = userQuery.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        } else if (isBleckyCommand) {
            userQuery = userQuery.replace(/blecky\s?/i, '').trim();
        }
        
        if (userQuery.length === 0) {
            await message.reply("Yes? 🐱");
            return;
        }

        try {
            const parsed = parseCommand(userQuery, message.guild, message.author.id);
            
            if (parsed?.type === 'ERROR') {
                await message.reply(`❌ ${parsed.message}`);
                return;
            }
            
            if (parsed) {
                // PING
                if (parsed.type === 'PING') {
                    await message.channel.send(`<@${parsed.targetId}>`);
                    return;
                }
                
                // WARNLIST
                if (parsed.type === 'WARNLIST') {
                    const cmd = client.commands.get('warnlist');
                    if (cmd) {
                        await executeSlashCommand(cmd, parsed.targetId, message, client, settings, {});
                    }
                    return;
                }
                
                // REMOVE WARNING
                if (parsed.type === 'REMOVE_WARNING') {
                    const cmd = client.commands.get('removewarn');
                    if (cmd) {
                        await executeSlashCommand(cmd, parsed.targetId, message, client, settings, {
                            warnIndex: parsed.warnIndex
                        });
                    }
                    return;
                }
                
                // REMOVE CURRENCY
                if (parsed.type === 'REMOVE_CURRENCY') {
                    const cmd = client.commands.get(parsed.command);
                    if (cmd) {
                        await executeSlashCommand(cmd, parsed.targetId, message, client, settings, {
                            amount: parsed.amount
                        });
                    }
                    return;
                }
                
                // AVATAR
                if (parsed.type === 'AVATAR') {
                    const member = message.guild.members.cache.get(parsed.targetId);
                    if (member) {
                        const avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 1024 });
                        await message.channel.send(avatarUrl);
                    }
                    return;
                }
                
                // ACCOUNT_CREATED
                if (parsed.type === 'ACCOUNT_CREATED') {
                    const member = message.guild.members.cache.get(parsed.targetId);
                    if (member) {
                        const createdDate = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`;
                        await message.reply(`Account created ${createdDate}`);
                    }
                    return;
                }
                
                // GIF
                if (parsed.type === 'GIF') {
                    const gifUrl = await searchGiphyGif(parsed.query);
                    await message.channel.send(gifUrl);
                    return;
                }
                
                // DM
                if (parsed.type === 'DM') {
                    const target = await client.users.fetch(parsed.targetId).catch(() => null);
                    if (target) {
                        await target.send(parsed.content).catch(() => {});
                        await message.reply(`✅ Sent`);
                    }
                    return;
                }
                
                // WARN
                if (parsed.type === 'WARN') {
                    const cmd = client.commands.get('warn');
                    if (cmd) {
                        await executeSlashCommand(cmd, parsed.targetId, message, client, settings, {
                            reason: parsed.reason
                        });
                    }
                    return;
                }
                
                // ADD_CURRENCY
                if (parsed.type === 'ADD_CURRENCY') {
                    const cmd = client.commands.get(parsed.command);
                    if (cmd) {
                        await executeSlashCommand(cmd, parsed.targetId, message, client, settings, {
                            amount: parsed.amount
                        });
                    }
                    return;
                }
                
                // INFO
                if (parsed.type === 'INFO') {
                    const userData = await User.findOne({ userId: parsed.targetId });
                    let value = 0;
                    
                    switch(parsed.query) {
                        case 'coins': value = userData?.coins || 0; break;
                        case 'cookies': value = userData?.cookies || 0; break;
                        case 'xp': value = userData?.xp || 0; break;
                        case 'level': value = userData?.level || 0; break;
                    }
                    
                    await message.reply(`${value} ${parsed.query}`);
                    return;
                }
                
                // JOINED
                if (parsed.type === 'JOINED') {
                    const member = message.guild.members.cache.get(parsed.targetId);
                    if (member) {
                        const joinDate = `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`;
                        await message.reply(`Joined ${joinDate}`);
                    }
                    return;
                }
            }
            
            // AI fallback for complex queries
            await message.reply("I couldn't understand that command");
            
        } catch (error) {
            console.error('AI Error:', error);
            await message.reply(`❌ Error`);
        }
        return;
    }
    // --- END AI HANDLER ---

    if (settings && settings.noXpChannels.includes(message.channel.id)) return;

    // XP System
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

// Execute slash command
async function executeSlashCommand(cmd, targetId, message, client, settings, options = {}) {
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    
    const mockInteraction = {
        options: {
            getUser: () => targetUser,
            getInteger: (n) => {
                if (n === 'amount' && options.amount) return parseInt(options.amount);
                if (n === 'index' && options.warnIndex) return parseInt(options.warnIndex);
                return null;
            },
            getString: (n) => {
                if (n === 'reason') return options.reason || 'Admin action';
                if (n === 'duration') return options.duration || null;
                return null;
            },
            getChannel: () => message.channel,
        },
        user: message.author,
        member: message.member,
        guild: message.guild,
        channel: message.channel,
        client: client,
        deferReply: async () => {},
        editReply: async (o) => {
            if (o.embeds && o.embeds.length > 0) {
                return message.channel.send({ embeds: o.embeds }).catch(console.error);
            }
            return Promise.resolve();
        },
        reply: async (o) => {
            if (o.embeds && o.embeds.length > 0) {
                return message.channel.send({ embeds: o.embeds }).catch(console.error);
            }
            return Promise.resolve();
        },
        followUp: async (o) => {
            if (o.embeds && o.embeds.length > 0) {
                return message.channel.send({ embeds: o.embeds }).catch(console.error);
            }
            return Promise.resolve();
        },
    };
    
    const logAction = async (guild, settings, action, target, mod, reason) => {
        const logId = settings?.aiLogChannelId || settings?.modlogChannelId;
        if (!logId) return;
        const logCh = guild.channels.cache.get(logId);
        if (!logCh) return;
        
        const embed = new EmbedBuilder()
            .setTitle(`[AI] ${action}`)
            .setDescription(`Target: ${target?.tag}\nAdmin: ${mod.tag}\nReason: ${reason}`)
            .setColor(0x7289DA)
            .setTimestamp();
        
        logCh.send({ embeds: [embed] }).catch(console.error);
    };
    
    try {
        await cmd.execute(mockInteraction, client, logAction);
    } catch (e) {
        console.error('Cmd error:', e);
    }
}
