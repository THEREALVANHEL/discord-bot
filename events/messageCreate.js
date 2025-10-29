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
const GIF_LINKS = [
    'https://tenor.com/view/cat-typing-gif-12002364', 
    'https://tenor.com/view/hello-hi-hey-cat-gif-14197368', 
    'https://tenor.com/view/cat-thumbs-up-gif-10023772186851410147',
    'https://tenor.com/view/im-on-it-gif-18116520',
    'https://tenor.com/view/ok-sure-whatever-cat-yawn-gif-17255153'
];

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
                const errorBody = await response.json().catch(() => ({}));
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

// Enhanced user resolution with better fuzzy matching
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
        const tag = member.user.tag.toLowerCase();
        
        // Exact match
        if (username === searchKey || displayName === searchKey) {
            bestMatch = member;
            bestScore = 0;
            return;
        }
        
        // Starts with
        if (username.startsWith(searchKey) || displayName.startsWith(searchKey)) {
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

// Smart command parser - handles all commands locally without AI
function parseCommand(text, guild) {
    const lower = text.toLowerCase().trim();
    const words = lower.split(/\s+/);
    
    // === INFO QUERIES (when, how many, what, who, show, check) ===
    if (lower.match(/when\s+did|when\s+was|joined/i)) {
        const target = findTargetInText(words, guild);
        if (target) {
            return {
                type: 'INFO',
                action: 'joined',
                member: target
            };
        }
    }
    
    if (lower.match(/how\s+many\s+(coins?|cookies?|xp|level)/i)) {
        const target = findTargetInText(words, guild);
        const queryType = lower.includes('coin') ? 'coins' : 
                         lower.includes('cookie') ? 'cookies' :
                         lower.includes('xp') ? 'xp' : 'level';
        if (target) {
            return {
                type: 'INFO',
                action: 'query',
                member: target,
                query: queryType
            };
        }
    }
    
    // === SEND GIF ===
    if (lower.match(/send.*(gif|me.*gif)/i)) {
        return {
            type: 'ACTION',
            action: 'gif'
        };
    }
    
    // === SEND DM ===
    if (lower.match(/send\s+dm/i)) {
        const target = findTargetInText(words, guild);
        const contentMatch = text.match(/(?:saying|message|:)\s+(.+)/i);
        const content = contentMatch ? contentMatch[1].trim() : "Hi!";
        
        if (target) {
            return {
                type: 'COMMAND',
                action: 'DISCORD_ACTION',
                dmType: 'dm',
                targetId: target.id,
                content: content
            };
        }
    }
    
    // === WARN ===
    if (lower.includes('warn')) {
        const target = findTargetInText(words, guild);
        const reasonMatch = text.match(/(?:reason|for|because|:)\s+(.+)/i);
        const reason = reasonMatch ? reasonMatch[1].trim() : 'No reason provided';
        
        if (target) {
            return {
                type: 'COMMAND',
                action: 'COMMAND',
                command: 'warn',
                targetId: target.id,
                reason: reason
            };
        }
    }
    
    // === TIMEOUT ===
    if (lower.match(/timeout|mute/i)) {
        const target = findTargetInText(words, guild);
        const durationMatch = lower.match(/(\d+)\s*(m|min|minute|h|hour|d|day)/i);
        const duration = durationMatch ? `${durationMatch[1]}${durationMatch[2][0]}` : '10m';
        const reasonMatch = text.match(/(?:reason|for|because|:)\s+(.+)/i);
        const reason = reasonMatch ? reasonMatch[1].trim() : 'Timeout by admin';
        
        if (target) {
            return {
                type: 'COMMAND',
                action: 'COMMAND',
                command: 'timeout',
                targetId: target.id,
                duration: duration,
                reason: reason
            };
        }
    }
    
    // === ADD CURRENCY (add X coins/cookies/xp to/for USER) ===
    const addMatch = lower.match(/add\s+(?:a\s+)?(\d+)?\s*(coins?|cookies?|xp)/i);
    if (addMatch) {
        const target = findTargetInText(words, guild);
        const amount = addMatch[1] ? parseInt(addMatch[1]) : 1;
        const currency = addMatch[2].toLowerCase();
        const commandMap = { 
            coin: 'addcoins', coins: 'addcoins',
            cookie: 'addcookies', cookies: 'addcookies',
            xp: 'addxp'
        };
        
        if (target) {
            return {
                type: 'COMMAND',
                action: 'COMMAND',
                command: commandMap[currency],
                targetId: target.id,
                amount: amount
            };
        }
    }
    
    // === PROFILE/INFO ===
    if (lower.match(/profile|userinfo|info|stats|show.*info/i)) {
        const target = findTargetInText(words, guild);
        if (target) {
            return {
                type: 'COMMAND',
                action: 'COMMAND',
                command: 'profile',
                targetId: target.id
            };
        }
    }
    
    return null;
}

// Helper to find target user in text
function findTargetInText(words, guild) {
    const skipWords = ['warn', 'add', 'send', 'dm', 'how', 'many', 'does', 'have', 'show', 'check', 'when', 'did', 'to', 'for', 'me', 'a', 'the', 'coins', 'coin', 'cookies', 'cookie', 'xp', 'level', 'saying', 'message'];
    
    for (const word of words) {
        if (skipWords.includes(word) || word.length < 2 || word.match(/^\d+$/)) continue;
        const resolved = resolveUser(guild, word);
        if (resolved) return resolved;
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
            // Try local parsing first (fast path)
            const parsed = parseCommand(userQuery, message.guild);
            
            if (parsed) {
                // Handle INFO queries locally
                if (parsed.type === 'INFO') {
                    if (parsed.action === 'joined') {
                        const joinDate = `<t:${Math.floor(parsed.member.joinedTimestamp / 1000)}:F>`;
                        await message.reply(`${parsed.member.user.username} joined ${joinDate}`);
                        return;
                    }
                    
                    if (parsed.action === 'query') {
                        const userData = await User.findOne({ userId: parsed.member.id });
                        let value = 0;
                        
                        switch(parsed.query) {
                            case 'coins': value = userData?.coins || 0; break;
                            case 'cookies': value = userData?.cookies || 0; break;
                            case 'xp': value = userData?.xp || 0; break;
                            case 'level': value = userData?.level || 0; break;
                        }
                        
                        await message.reply(`${parsed.member.user.username} has ${value} ${parsed.query}`);
                        return;
                    }
                }
                
                // Handle GIF locally
                if (parsed.type === 'ACTION' && parsed.action === 'gif') {
                    const gif = GIF_LINKS[Math.floor(Math.random() * GIF_LINKS.length)];
                    await message.channel.send(gif);
                    return;
                }
                
                // Handle commands
                if (parsed.type === 'COMMAND') {
                    await executeCommand(parsed, message, client, settings);
                    return;
                }
            }
            
            // If local parsing fails, use AI for complex queries
            const members = Array.from(message.guild.members.cache.values())
                .slice(0, 30)
                .map(m => ({ id: m.id, name: m.user.username, display: m.displayName }));
            
            const systemPrompt = `You are Bleck Nephew. Be concise and direct.

MEMBERS: ${JSON.stringify(members)}

OUTPUT RULES:
1. For commands, output ONLY valid JSON (no text before/after)
2. For info/questions, answer in 1-2 sentences max
3. Never ask follow-up questions, just execute

COMMAND FORMATS:
{"action":"COMMAND","command":"warn","targetId":"ID","reason":"text"}
{"action":"COMMAND","command":"addcoins","targetId":"ID","amount":100}
{"action":"COMMAND","command":"profile","targetId":"ID"}
{"action":"DISCORD_ACTION","type":"dm","targetId":"ID","content":"message"}
{"action":"DISCORD_ACTION","type":"gif"}

Query: "${userQuery}"

If it's a command, output ONLY JSON. If info query, answer briefly. Never yap.`;

            const payload = {
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 512,
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
                // It's text response
                await message.reply(aiResponse);
                return;
            }

            // Execute command
            if (cmdData && (cmdData.action === 'COMMAND' || cmdData.action === 'DISCORD_ACTION')) {
                await executeCommand(cmdData, message, client, settings);
            } else {
                await message.reply(aiResponse);
            }
            
        } catch (error) {
            console.error('AI Error:', error);
            await message.reply(`Error: ${error.message.substring(0, 100)}`);
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

// Execute command helper
async function executeCommand(cmdData, message, client, settings) {
    const { action, command, type, targetId, amount, reason, content, duration, dmType } = cmdData;
    
    // Discord actions (DM, GIF)
    if (action === 'DISCORD_ACTION' || dmType === 'dm') {
        if (type === 'dm' || dmType === 'dm') {
            const target = await client.users.fetch(targetId).catch(() => null);
            if (target) {
                await target.send(content).catch(() => {});
                await message.reply(`✅ Sent to ${target.username}`);
            } else {
                await message.reply(`❌ User not found`);
            }
            return;
        }
        if (type === 'gif') {
            const gif = GIF_LINKS[Math.floor(Math.random() * GIF_LINKS.length)];
            await message.channel.send(gif);
            return;
        }
    }
    
    // Slash commands
    if (action === 'COMMAND') {
        const cmd = client.commands.get(command);
        if (!cmd) {
            await message.reply(`❌ Unknown command: ${command}`);
            return;
        }
        
        const targetUser = targetId ? await client.users.fetch(targetId).catch(() => null) : null;
        
        const mockInteraction = {
            options: {
                getUser: () => targetUser,
                getInteger: (n) => (n === 'amount' && amount) ? parseInt(amount) : null,
                getString: (n) => {
                    if (n === 'reason') return reason || 'Admin action';
                    if (n === 'duration') return duration || null;
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
            editReply: async (o) => message.reply(o).catch(console.error),
            reply: async (o) => message.reply(o).catch(console.error),
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
            await message.reply(`❌ Failed: ${e.message.substring(0, 80)}`);
        }
    }
}
