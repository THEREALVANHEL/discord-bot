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

// Search Tenor API for GIFs
async function searchTenorGif(query) {
    const TENOR_KEY = process.env.TENOR_API_KEY || "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ"; // Default key
    const searchUrl = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=10`;
    
    try {
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const randomIndex = Math.floor(Math.random() * data.results.length);
            return data.results[randomIndex].url;
        }
    } catch (error) {
        console.error('Tenor API error:', error);
    }
    
    // Fallback gifs
    const fallbackGifs = [
        'https://tenor.com/view/cat-typing-gif-12002364',
        'https://tenor.com/view/hello-hi-hey-cat-gif-14197368',
        'https://tenor.com/view/cat-thumbs-up-gif-10023772186851410147'
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
function resolveUser(guild, input) {
    if (!input || input.length < 2) return null;
    
    // Check for mention or ID
    const match = input.match(/<@!?(\d+)>|(\d{17,19})/);
    if (match) {
        const id = match[1] || match[2];
        return guild.members.cache.get(id);
    }

    const searchKey = input.toLowerCase().trim();
    let bestMatch = null;
    let bestScore = 999;

    guild.members.cache.forEach(member => {
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
function parseCommand(text, guild) {
    const lower = text.toLowerCase().trim();
    const words = lower.split(/\s+/);
    
    // Find target user in text
    const findTarget = () => {
        const skipWords = ['warn', 'add', 'send', 'dm', 'how', 'many', 'does', 'have', 'show', 'when', 'did', 'to', 'for', 'me', 'a', 'the', 'coins', 'coin', 'cookies', 'cookie', 'xp', 'level', 'saying', 'message', 'gif', 'give', 'remove', 'reason', 'is'];
        
        for (const word of words) {
            if (skipWords.includes(word) || word.length < 2 || word.match(/^\d+$/)) continue;
            const resolved = resolveUser(guild, word);
            if (resolved) return resolved;
        }
        return null;
    };
    
    // GIF request
    if (lower.match(/send.*(gif|image)|gif/i)) {
        const gifQuery = text.replace(/blecky|send|me|a|an|gif|image/gi, '').trim() || 'random';
        return {
            type: 'GIF',
            query: gifQuery
        };
    }
    
    // DM
    if (lower.includes('dm')) {
        const target = findTarget();
        const contentMatch = text.match(/(?:saying|message|say|tell|:)\s+(.+)/i);
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
    if (lower.includes('warn')) {
        const target = findTarget();
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
        
        if (target) {
            return {
                type: 'INFO',
                targetId: target.id,
                targetTag: target.user.tag,
                query: query
            };
        }
    }
    
    if (lower.match(/when.*join/i)) {
        const target = findTarget();
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
            const parsed = parseCommand(userQuery, message.guild);
            
            if (parsed) {
                // Handle GIF
                if (parsed.type === 'GIF') {
                    const gifUrl = await searchTenorGif(parsed.query);
                    await message.channel.send(gifUrl);
                    return;
                }
                
                // Handle DM
                if (parsed.type === 'DM') {
                    const target = await client.users.fetch(parsed.targetId).catch(() => null);
                    if (target) {
                        await target.send(parsed.content).catch(() => {});
                        await message.reply(`✅ DM sent`);
                    } else {
                        await message.reply(`❌ User not found`);
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
            
            // Use AI for complex queries
            const members = Array.from(message.guild.members.cache.values())
                .slice(0, 40)
                .map(m => ({ id: m.id, username: m.user.username, display: m.displayName }));
            
            const systemPrompt = `You are Bleck Nephew. Give direct 1-sentence answers only. No yapping.

MEMBERS: ${JSON.stringify(members)}

For commands, output ONLY this JSON format (nothing else):
{"cmd":"warn","target":"USER_ID","reason":"text"}
{"cmd":"addcoins","target":"USER_ID","amount":100}
{"cmd":"dm","target":"USER_ID","message":"text"}
{"cmd":"gif","query":"search term"}

For info, answer in 5 words or less.

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

            // Try parse as JSON
            let cmdData = null;
            try {
                const cleaned = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                cmdData = JSON.parse(cleaned);
            } catch {
                // Text response - keep it short
                const shortResponse = aiResponse.split('.')[0]; // First sentence only
                await message.reply(shortResponse);
                return;
            }

            // Execute AI command
            if (cmdData) {
                if (cmdData.cmd === 'gif') {
                    const gifUrl = await searchTenorGif(cmdData.query || 'random');
                    await message.channel.send(gifUrl);
                    return;
                }
                
                if (cmdData.cmd === 'dm') {
                    const target = await client.users.fetch(cmdData.target).catch(() => null);
                    if (target) {
                        await target.send(cmdData.message).catch(() => {});
                        await message.reply(`✅`);
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
            await message.reply(`Error: ${error.message.substring(0, 80)}`);
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

// Execute slash command helper
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
        deferReply: async () => { await message.channel.sendTyping(); },
        editReply: async (o) => {
            const content = o.content || '';
            const shortMsg = content.split('\n')[0].substring(0, 100); // First line only
            return message.reply({ content: shortMsg || '✅', embeds: o.embeds }).catch(console.error);
        },
        reply: async (o) => {
            const content = o.content || '';
            const shortMsg = content.split('\n')[0].substring(0, 100);
            return message.reply({ content: shortMsg || '✅', embeds: o.embeds }).catch(console.error);
        },
        followUp: async (o) => message.channel.send(o).catch(console.error),
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
        await message.reply(`❌ Failed`);
    }
}
