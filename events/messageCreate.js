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

// Enhanced user resolution
function resolveUser(guild, input, authorId) {
    if (!input || input.length < 2) return null;
    
    // Check for mention or ID
    const match = input.match(/<@!?(\d+)>|(\d{17,19})/);
    if (match) {
        const id = match[1] || match[2];
        const member = guild.members.cache.get(id);
        if (id === authorId) return { self: true };
        return member;
    }

    const searchKey = input.toLowerCase().trim();
    let bestMatch = null;
    let bestScore = 999;

    guild.members.cache.forEach(member => {
        if (member.id === authorId) return;
        
        const username = member.user.username.toLowerCase();
        const displayName = member.displayName.toLowerCase();
        
        // Exact match
        if (username === searchKey || displayName === searchKey) {
            bestMatch = member;
            bestScore = 0;
            return;
        }
        
        // Contains search term
        if (username.includes(searchKey) || displayName.includes(searchKey)) {
            const score = Math.abs(username.length - searchKey.length);
            if (score < bestScore) {
                bestScore = score;
                bestMatch = member;
            }
            return;
        }
        
        // Fuzzy match
        const distUser = levenshteinDistance(searchKey, username);
        const distDisplay = levenshteinDistance(searchKey, displayName);
        const minDist = Math.min(distUser, distDisplay);
        const maxAllowed = Math.max(2, Math.floor(searchKey.length / 3));
        
        if (minDist < bestScore && minDist <= maxAllowed) {
            bestScore = minDist;
            bestMatch = member;
        }
    });

    return bestMatch;
}

// Parse command locally
function parseCommand(text, guild, authorId) {
    const lower = text.toLowerCase().trim();
    const words = lower.split(/\s+/);
    
    // Find target user in text
    const findTarget = () => {
        const skipWords = ['warn', 'add', 'send', 'dm', 'how', 'many', 'does', 'have', 'show', 'when', 'did', 'to', 'for', 'me', 'a', 'the', 'coins', 'coin', 'cookies', 'cookie', 'xp', 'level', 'saying', 'message', 'gif', 'give', 'remove', 'reason', 'is', 'with', 'picture', 'avatar', 'profile', 'image', 'ping', 'warnlist', 'list', 'of'];
        
        for (const word of words) {
            if (skipWords.includes(word) || word.length < 2 || word.match(/^\d+$/)) continue;
            const resolved = resolveUser(guild, word, authorId);
            if (resolved?.self) return { self: true };
            if (resolved) return resolved;
        }
        return null;
    };
    
    // Warnlist command
    if (lower.match(/(?:show|get|view).*warnlist|warnlist.*(?:of|for)/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Check your own warnlist" };
        if (target) {
            return {
                type: 'WARNLIST',
                targetId: target.id,
                targetTag: target.user.tag
            };
        }
    }
    
    // Ping command
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
    
    // Profile picture / avatar request
    if (lower.match(/(?:send|show|get).*(?:profile|avatar|picture|pfp)/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't get your own avatar via command" };
        if (target) {
            return {
                type: 'AVATAR',
                targetId: target.id,
                targetTag: target.user.tag
            };
        }
    }
    
    // Account creation date
    if (lower.match(/when.*(?:make|create|made|join).*(?:account|discord)/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Check your own profile" };
        if (target) {
            return {
                type: 'ACCOUNT_CREATED',
                targetId: target.id,
                targetTag: target.user.tag
            };
        }
    }
    
    // GIF request - extract the subject properly
    if (lower.match(/send.*gif|gif/i)) {
        // Extract what type of gif (e.g., "alien" from "send a alien gif")
        let gifQuery = 'random';
        
        // Remove common words
        const cleanedText = text.replace(/blecky|send|me|a|an|the|gif|image/gi, '').trim();
        
        // If there's something left, use it as the query
        if (cleanedText && cleanedText.length > 0) {
            gifQuery = cleanedText.split(/\s+/)[0]; // Take first meaningful word
        }
        
        return {
            type: 'GIF',
            query: gifQuery
        };
    }
    
    // DM
    if (lower.includes('dm')) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't DM yourself" };
        
        const contentMatch = text.match(/(?:saying|say|message|tell|with.*saying|:)\s+(.+)/i);
        const content = contentMatch ? contentMatch[1].trim() : "Hi!";
        
        if (target) {
            return {
                type: 'DM',
                targetId: target.id,
                targetTag: target.user.tag,
                content: content
            };
        }
    }
    
    // Warn
    if (lower.includes('warn') && !lower.includes('warnlist')) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't warn yourself" };
        
        const reasonMatch = text.match(/(?:reason|for|because|:)\s+(.+)/i);
        const reason = reasonMatch ? reasonMatch[1].trim() : 'Warned by admin';
        
        if (target) {
            return {
                type: 'WARN',
                targetId: target.id,
                targetTag: target.user.tag,
                reason: reason
            };
        }
    }
    
    // Add currency
    if (lower.match(/add|give/i) && lower.match(/coin|cookie|xp/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Can't add currency to yourself" };
        
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
                targetTag: target.user.tag,
                amount: amount
            };
        }
    }
    
    // Info queries
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
                targetTag: target.user.tag,
                query: query
            };
        }
    }
    
    // Server join date
    if (lower.match(/when.*join/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "Check your own join date" };
        if (target) {
            return {
                type: 'JOINED',
                targetId: target.id,
                targetTag: target.user.tag
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
            // Parse command locally
            const parsed = parseCommand(userQuery, message.guild, message.author.id);
            
            // Handle errors
            if (parsed?.type === 'ERROR') {
                await message.reply(`❌ ${parsed.message}`);
                return;
            }
            
            if (parsed) {
                // Handle PING
                if (parsed.type === 'PING') {
                    await message.channel.send(`<@${parsed.targetId}>`);
                    return;
                }
                
                // Handle WARNLIST
                if (parsed.type === 'WARNLIST') {
                    const cmd = client.commands.get('warnlist');
                    if (cmd) {
                        await executeSlashCommand(cmd, parsed.targetId, message, client, settings, {});
                    }
                    return;
                }
                
                // Handle AVATAR
                if (parsed.type === 'AVATAR') {
                    const member = message.guild.members.cache.get(parsed.targetId);
                    if (member) {
                        const avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 1024 });
                        await message.channel.send(avatarUrl);
                    } else {
                        await message.reply("❌ User not found");
                    }
                    return;
                }
                
                // Handle ACCOUNT_CREATED
                if (parsed.type === 'ACCOUNT_CREATED') {
                    const member = message.guild.members.cache.get(parsed.targetId);
                    if (member) {
                        const createdDate = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`;
                        await message.reply(`Account created ${createdDate}`);
                    }
                    return;
                }
                
                // Handle GIF
                if (parsed.type === 'GIF') {
                    const gifUrl = await searchGiphyGif(parsed.query);
                    await message.channel.send(gifUrl);
                    return;
                }
                
                // Handle DM
                if (parsed.type === 'DM') {
                    const target = await client.users.fetch(parsed.targetId).catch(() => null);
                    if (target) {
                        await target.send(parsed.content).catch(() => {});
                        await message.reply(`✅ Sent`);
                    } else {
                        await message.reply(`❌ Not found`);
                    }
                    return;
                }
                
                // Handle WARN
                if (parsed.type === 'WARN') {
                    const cmd = client.commands.get('warn');
                    if (cmd) {
                        await executeSlashCommand(cmd, parsed.targetId, message, client, settings, {
                            reason: parsed.reason
                        });
                    }
                    return;
                }
                
                // Handle ADD_CURRENCY
                if (parsed.type === 'ADD_CURRENCY') {
                    const cmd = client.commands.get(parsed.command);
                    if (cmd) {
                        await executeSlashCommand(cmd, parsed.targetId, message, client, settings, {
                            amount: parsed.amount
                        });
                    }
                    return;
                }
                
                // Handle INFO
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
                
                // Handle JOINED
                if (parsed.type === 'JOINED') {
                    const member = message.guild.members.cache.get(parsed.targetId);
                    if (member) {
                        const joinDate = `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`;
                        await message.reply(`Joined ${joinDate}`);
                    }
                    return;
                }
            }
            
            // Fallback to AI for very complex queries
            const members = Array.from(message.guild.members.cache.values())
                .filter(m => m.id !== message.author.id)
                .slice(0, 40)
                .map(m => ({ id: m.id, username: m.user.username, display: m.displayName }));
            
            const systemPrompt = `You are Bleck Nephew. Answer in 5 words max.

MEMBERS: ${JSON.stringify(members)}

For commands, output ONLY JSON:
{"cmd":"warn","target":"USER_ID","reason":"text"}
{"cmd":"warnlist","target":"USER_ID"}
{"cmd":"ping","target":"USER_ID"}
{"cmd":"addcoins","target":"USER_ID","amount":100}
{"cmd":"gif","query":"exact subject like alien, dog, cat"}
{"cmd":"avatar","target":"USER_ID"}

Query: "${userQuery}"`;

            const payload = {
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 256,
                }
            };
            
            await message.channel.sendTyping();
            const result = await fetchWithRetry(GEMINI_API_URL, payload);
            const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            
            if (!aiResponse) {
                await message.reply("No response");
                return;
            }

            let cmdData = null;
            try {
                const cleaned = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                cmdData = JSON.parse(cleaned);
            } catch {
                const shortResponse = aiResponse.split('.')[0];
                await message.reply(shortResponse);
                return;
            }

            if (cmdData) {
                if (cmdData.target === message.author.id) {
                    await message.reply("❌ Can't target yourself");
                    return;
                }
                
                if (cmdData.cmd === 'ping') {
                    await message.channel.send(`<@${cmdData.target}>`);
                    return;
                }
                
                if (cmdData.cmd === 'avatar') {
                    const member = message.guild.members.cache.get(cmdData.target);
                    if (member) {
                        const avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 1024 });
                        await message.channel.send(avatarUrl);
                    }
                    return;
                }
                
                if (cmdData.cmd === 'gif') {
                    const gifUrl = await searchGiphyGif(cmdData.query || 'random');
                    await message.channel.send(gifUrl);
                    return;
                }
                
                if (cmdData.cmd === 'dm') {
                    const target = await client.users.fetch(cmdData.target).catch(() => null);
                    if (target) {
                        await target.send(cmdData.message).catch(() => {});
                        await message.reply(`✅ Sent`);
                    }
                    return;
                }
                
                const slashCmd = client.commands.get(cmdData.cmd);
                if (slashCmd) {
                    await executeSlashCommand(slashCmd, cmdData.target, message, client, settings, {
                        amount: cmdData.amount,
                        reason: cmdData.reason
                    });
                }
            }
            
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

// Execute slash command helper (NO REPLY, JUST EXECUTE)
async function executeSlashCommand(cmd, targetId, message, client, settings, options = {}) {
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    
    const mockInteraction = {
        options: {
            getUser: () => targetUser,
            getInteger: (n) => (n === 'amount' && options.amount) ? parseInt(options.amount) : null,
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
            // Only send embed, no extra text
            if (o.embeds && o.embeds.length > 0) {
                return message.channel.send({ embeds: o.embeds }).catch(console.error);
            }
            return Promise.resolve();
        },
        reply: async (o) => {
            // Only send embed, no extra text
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
