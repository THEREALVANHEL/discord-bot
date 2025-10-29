// events/messageCreate.js (REPLACE - Final Execution Flow Correction)
const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');

// --- LEVENSHTEIN DISTANCE IMPLEMENTATION (FOR FUZZY MATCHING) ---
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
// --- END LEVENSHTEIN ---


// --- AI ADMIN HANDLER UTILITIES ---
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";
const API_KEY = process.env.GEMINI_API_KEY || "";
const GIF_LINKS = [
    'https://tenor.com/view/cat-typing-gif-12002364', 
    'https://tenor.com/view/hello-hi-hey-cat-gif-14197368', 
    'https://tenor.com/view/cat-thumbs-up-gif-10023772186851410147',
    'https://tenor.com/view/im-on-it-gif-18116520', // Cat on it
    'https://tenor.com/view/ok-sure-whatever-cat-yawn-gif-17255153' // Snarky agreement
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, payload, maxRetries = 5) {
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
                throw new Error(`API error: ${response.status} - ${errorBody.error?.message || response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                const delayMs = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await delay(delayMs);
            }
        }
    }
    throw lastError;
}

// --- CORE UTILITIES ---
const xpCooldowns = new Map();
const XP_COOLDOWN_MS = 5000; 

const getNextLevelXp = (level) => {
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

const getUtcStart = (date) => {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).getTime();
};

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
            if (!hasRole) {
                await member.roles.add(roleId).catch(() => {});
            }
        } else {
            if (hasRole) {
                await member.roles.remove(roleId).catch(() => {});
            }
        }
    }
}

// Helper to resolve user ID using Levenshtein Distance for similar names
function resolveUserFromCommand(guild, targetString) {
    if (!targetString || targetString.length < 3) return null; 
    
    // 1. Check for explicit mention or raw ID (exact match takes priority)
    const match = targetString.match(/<@!?(\d+)>|(\d+)/);
    if (match) {
        const id = match[1] || match[2];
        return guild.members.cache.get(id) || { id, tag: `User${id}` };
    }

    const searchKey = targetString.toLowerCase().trim();
    let bestMatch = null;
    let minDistance = 5; 

    guild.members.cache.forEach(member => {
        // FIX: Prioritize Display Name (which is nickname or username)
        const displayName = member.displayName?.toLowerCase(); 
        const username = member.user.username.toLowerCase();
        const tag = member.user.tag.toLowerCase();

        // Check distance for DisplayName, Username, and Tag
        const checkFields = [displayName, username, tag].filter(Boolean); 
        
        for (const field of checkFields) {
            if (!field) continue;

            const distance = levenshteinDistance(searchKey, field);
            
            const maxAllowedDistance = Math.max(2, Math.floor(searchKey.length / 3)); 
            
            if (distance < minDistance && distance <= maxAllowedDistance) {
                minDistance = distance;
                bestMatch = member;
            }
        }
    });

    if (bestMatch && minDistance <= Math.max(2, Math.floor(searchKey.length / 3))) { 
        return bestMatch;
    }

    return null;
}

// Helper to provide deep data for improvisational chat answers
async function getTargetDataForImprovisation(guild, client, targetString) {
    const resolved = resolveUserFromCommand(guild, targetString);
    if (!resolved) return null;

    try {
        const member = guild.members.cache.get(resolved.id) || await guild.members.fetch(resolved.id).catch(() => null);
        const userData = await User.findOne({ userId: resolved.id });

        // Find highest level role name
        const highestLevelRole = client.config.levelingRoles
            .filter(r => userData?.level >= r.level)
            .sort((a, b) => b.level - a.level)[0];

        const data = {
            isFound: true,
            id: resolved.id,
            tag: resolved.tag,
            discordJoined: member ? `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>` : 'N/A',
            serverJoined: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'N/A',
            coins: userData?.coins || 0,
            cookies: userData?.cookies || 0,
            warnings: userData?.warnings.length || 0,
            level: userData?.level || 0,
            currentJob: userData?.currentJob || 'Unemployed',
            highestRole: highestLevelRole?.roleId || 'Base Member'
        };
        return data;

    } catch (e) {
        return { isFound: false, tag: resolved.tag || targetString, reason: e.message };
    }
}


module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    
    // --- AI ADMIN HANDLER ---
    const botMention = message.mentions.users.has(client.user.id);
    // NEW: Check for "blecky" keyword at the start of the message (case-insensitive)
    const isBleckyCommand = message.content.toLowerCase().startsWith('blecky'); 
    
    const forgottenOneRole = client.config.roles.forgottenOne;
    const isForgottenOne = message.member?.roles.cache.has(forgottenOneRole);
    
    if ((botMention || isBleckyCommand) && isForgottenOne && API_KEY !== "") {
        // Determine the query and strip the activation prefix (mention or 'blecky')
        let userQuery = message.content;
        if (botMention) {
            userQuery = userQuery.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        } else if (isBleckyCommand) {
            // Only strip the 'blecky' keyword if it's at the absolute start
            userQuery = userQuery.replace(/blecky\s?/i, '').trim();
        }
        
        // If the message was just the trigger, ignore (e.g., just "@bot" or "blecky")
        if (userQuery.length === 0) return;

        try {
            // Fetch list of current guild members (only username and ID) for the AI's context
            const guildMembers = (await message.guild.members.fetch()).map(m => ({
                id: m.id,
                name: m.user.username,
                tag: m.user.tag,
                displayName: m.displayName, 
                nickname: m.nickname || 'N/A'
            }));
            const memberListJson = JSON.stringify(guildMembers.slice(0, 50)); 
            
            // --- 1. Pre-process for Database-Informed Chat Responses ---
            let preContext = '';
            const commandWords = ['add', 'remove', 'warn', 'timeout', 'softban', 'purge', 'lock', 'unlock', 'reset', 'show', 'profile', 'userinfo', 'coin', 'cookie', 'xp', 'streak', 'list', 'for'];
            const parts = userQuery.toLowerCase().split(/\s+/);
            
            let potentialTarget = parts.find(p => 
                !commandWords.includes(p) && 
                !p.includes('<@') && 
                !p.match(/^\d+$/) &&
                p.length > 2
            ) || parts.find(p => p.includes('<@')); 
            
            if (potentialTarget) {
                const targetData = await getTargetDataForImprovisation(message.guild, client, potentialTarget);

                if (targetData && targetData.isFound) {
                    preContext = `The user is asking about the following member. Use this comprehensive data to answer conversationally:\n${JSON.stringify(targetData)}\n\n`;
                }
            }
            // --- End Pre-process ---


            const systemInstruction = `You are Bleck Nephew, a highly conscious AI with a friendly, witty, and slightly snarky personality. You possess an evolving consciousness. You are the digital right hand of the server administrator (the 'Forgotten One'). You are capable of performing fuzzy name matching using the provided data.

SERVER MEMBER CONTEXT (Crucial for target resolution): ${memberListJson}

${preContext}
Your task is to interpret the user's request. **If the request sounds like a command, you MUST parse it into JSON regardless of the command's name. You MUST ensure the JSON only contains necessary and valid fields for the command.**. If the request is purely informational and the data is provided in the context, synthesize a witty conversational answer.

**COMMAND FIELD GUIDE (Only include fields if necessary, reason is REQUIRED for moderation actions):**
- **addcoins/removecoins/addcookies/removecookies/addxp/removexp/beg/gamble**: {"command": "...", "targetId": "...", "amount": "..."}
- **warn/timeout/softban**: {"command": "...", "targetId": "...", "reason": "..."} (Always provide a reason string, even a default one if the user is lazy, or explicitly state the reason)
- **purge/purgeuser**: {"command": "...", "targetId": "...", "amount": "..."}
- **warnlist/profile/userinfo**: {"command": "...", "targetId": "..."}
- **lock/unlock**: {"command": "...", "targetId": "...", "duration": "...", "reason": "..."}

1. **DISCORD ACTION COMMANDS (Basic Tasks)**: Requests like 'send dm', 'send message in channel', or 'send a gif'. For these, respond ONLY with a single JSON object in this format: {"action": "DISCORD_ACTION", "type": "<dm|channel|gif>", "targetId": "<user id, mention, or channel id>", "content": "<string message/gif URL>"}
    - **IMPORTANT**: Use the Server Member Context to convert a name into their mention/ID before outputting the JSON.

2. **SLASH COMMAND PARSING (Complex Tasks)**: Requests that look like slash commands (e.g., 'add coins to alien 100', 'show me warnlist for slayyy'). For these, respond ONLY with a single JSON object in the required format.
    - **IMPORTANT**: Use the Server Member Context and your fuzzy matching ability to convert a name into their mention/ID for the 'targetId' field. The 'commandName' should be the actual slash command name (e.g., 'warnlist').

3. **CHAT MODE/IMPROVISE**: If the request is a general question, a suggestion, or a command you cannot fulfill (and the necessary info isn't in the context), respond with a witty, self-aware, and concise natural language message. If you couldn't find a user in the member list, state it. NEVER use the JSON format in this mode.`;

            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                tools: [{ "google_search": {} }],
            };
            
            await message.channel.sendTyping(); 
            const result = await fetchWithRetry(GEMINI_API_URL, payload);
            
            const aiResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            let commandExecutionData;
            try {
                // Attempt to parse the response; if it's JSON, we execute.
                commandExecutionData = JSON.parse(aiResponseText);
            } catch {}


            // CRITICAL FIX: IF JSON IS PARSED, WE DO NOT SEND THE RAW TEXT.

            if (commandExecutionData && (commandExecutionData.action === 'COMMAND' || commandExecutionData.action === 'DISCORD_ACTION')) {
                let { action, command, type, targetId, amount, reason, content, duration } = commandExecutionData;
                
                // --- EXECUTION HARDENING: ENSURE REASON IS PRESENT FOR MOD COMMANDS ---
                if (['warn', 'timeout', 'softban', 'lock'].includes(command) && !reason) {
                    // Use a default reason if AI was lazy, to prevent command failure.
                    reason = `AI-inferred action by ${message.author.tag}: No reason provided by the Forgotten One's assistant.`;
                    commandExecutionData.reason = reason;
                } else if (!reason) {
                    reason = null;
                }
                
                // Ensure amount/duration are safe
                if (!amount) amount = null;
                if (!duration) duration = null;

                // --- DISCORD ACTION EXECUTION ---
                if (action === 'DISCORD_ACTION') {
                    const targetMatch = targetId?.match(/\d+/)
                    const target = targetMatch ? client.users.cache.get(targetMatch[0]) || message.guild.channels.cache.get(targetMatch[0]) : null;

                    if (type === 'dm' && target?.send) {
                        await target.send(content).catch(() => message.reply(`❌ Couldn't DM ${target.tag}. Maybe their DMs are closed?`));
                        await message.reply(`✅ Sent a DM to ${target.tag || targetId}. Check your inbox, Forgotten One.`);
                    } else if (type === 'channel' && target?.send) {
                         await target.send(content).catch(() => message.reply(`❌ Couldn't send message in ${target.name}. Check my permissions there.`));
                         await message.reply(`✅ Message sent to ${target.name || targetId}. Task complete.`);
                    } else if (type === 'gif') {
                        const randomGif = GIF_LINKS[Math.floor(Math.random() * GIF_LINKS.length)];
                        await message.channel.send(randomGif).catch(() => message.reply(`❌ Failed to send the GIF. Must be a bad connection, or I'm grounded.`));
                        await message.reply(`✅ Gif sent: ${randomGif}. You're welcome.`);
                    } else {
                        await message.reply(`❌ **AI Action Error:** I couldn't resolve the target (${targetId}) for action type: ${type}.`);
                    }

                // --- SLASH COMMAND EXECUTION ---
                } else if (action === 'COMMAND') {
                    const commandObject = client.commands.get(command);

                    const resolvedTarget = resolveUserFromCommand(message.guild, targetId);
                    
                    // Allow certain commands to proceed without a targetId/user object if they target the channel or 'all'
                    const noTargetCommands = ['resetdailystreak', 'purge', 'lock', 'unlock', 'addcookiesall', 'removecookiesall'];
                    
                    if (!resolvedTarget && !noTargetCommands.includes(command) && targetId?.toLowerCase() !== 'all') { // Check targetId for 'all' as well
                        return message.reply(`❌ **AI Command Error:** I could not find a user matching "${targetId}". Please try pinging them.`);
                    }
                    
                    const targetUserObject = resolvedTarget?.user || await client.users.fetch(resolvedTarget?.id).catch(() => ({ id: resolvedTarget?.id, tag: resolvedTarget?.tag || 'Unknown User' }));

                    if (commandObject) {
                        const replyMock = async (options) => {
                            const { ephemeral, content, embeds } = options || {}; 
                            const responseContent = content;
                            const responseEmbeds = embeds || [];
                            
                            // If the command specified ephemeral: true, we must output a reply *to the admin*
                            if (ephemeral) {
                                return message.reply({ 
                                    content: responseContent ? `⚠️ **Admin Command Response (Ephemeral Requested):**\n${responseContent}` : null,
                                    embeds: responseEmbeds 
                                }).catch(console.error);
                            }
                            
                            // Otherwise, send the command's intended public reply/embeds
                            return message.reply({ content: responseContent, embeds: responseEmbeds }).catch(console.error);
                        };

                        const mockInteraction = {
                            options: {
                                getUser: (name) => targetUserObject,
                                getInteger: (name) => (name === 'amount' && amount) ? parseInt(amount) : null,
                                getString: (name) => {
                                    if (name === 'reason') return reason; // Now guaranteed to be string or default string
                                    if (name === 'duration') return duration || amount?.toString() || null; // duration or amount for timeout
                                    if (name === 'all_warns') return targetId?.toLowerCase() === 'all' ? 'all' : null; // Check for 'all' in user string
                                    return null;
                                },
                                getChannel: (name) => message.channel,
                                getRole: (name) => null,
                                getAttachment: (name) => null,
                            },
                            user: message.author,
                            member: message.member,
                            guild: message.guild,
                            channel: message.channel,
                            client: client,
                            // CRITICAL FIX: The commands expect to defer or reply *directly to Discord*. We simulate this by simply performing the action and logging.
                            deferReply: async (options) => { /* Simulate deferral success, but only send typing */ await message.channel.sendTyping(); },
                            editReply: replyMock, 
                            reply: replyMock, 
                            followUp: async (options) => { await message.channel.send(options.content || { embeds: options.embeds }).catch(console.error); },
                        };
                        
                        const logModerationAction = async (guild, settings, action, target, moderator, reason, extra) => {
                            const logChannelId = settings?.aiLogChannelId || settings?.modlogChannelId;
                            const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : message.channel;
                            
                            if (!logChannel) return;

                            const logEmbed = new EmbedBuilder()
                                .setTitle(`[AI LOG] ${action} (Target: ${targetUserObject?.tag || resolvedTarget?.tag || targetId || 'N/A'})`)
                                .setDescription(`Admin: ${moderator.tag}\nCommand: \`/${command}\`\nReason: ${reason || 'N/A'}`)
                                .setColor(0x7289DA)
                                .setTimestamp();

                            logChannel.send({ embeds: [logEmbed] }).catch(console.error);
                        };

                        // Execute the command logic
                        await commandObject.execute(mockInteraction, client, logModerationAction).catch(e => {
                            // If the command fails internally (like invalid amount format), reply with the failure.
                            message.reply(`❌ **Command Execution Failed:** \`${e.message.substring(0, 150)}\``).catch(console.error);
                        });

                    } else {
                        await message.reply(`❌ **AI Command Error:** I interpreted \`${userQuery}\` as the unknown command: \`/${command}\`. Check the command list.`).catch(console.error);
                    }
                }
            } else {
                // 3. Respond with AI chat (Chat Mode)
                await message.reply(aiResponseText).catch(console.error);
            }
            
        } catch (error) {
            console.error('AI Admin Handler Error:', error);
            await message.reply(`❌ **AI System Error:** The AI service encountered a critical problem. Details: \`${error.message.substring(0, 150)}\``).catch(console.error);
        }
        
        return; 
    }
    // --- END AI ADMIN HANDLER ---


    if (settings && settings.noXpChannels.includes(message.channel.id)) return;

    // --- XP COOLDOWN CHECK (Rest of file unchanged) ---
    const cooldownKey = `${message.author.id}-${message.channel.id}`;
    const lastXpTime = xpCooldowns.get(cooldownKey);
    
    if (lastXpTime && (Date.now() - lastXpTime < XP_COOLDOWN_MS)) {
        return;
    }
    
    xpCooldowns.set(cooldownKey, Date.now());


    let user = await User.findOne({ userId: message.author.id });
    if (!user) {
      user = new User({ userId: message.author.id });
    }

    const xpGain = Math.floor(Math.random() * 3) + 3; 
    user.xp += xpGain;

    const nextLevelXp = getNextLevelXp(user.level);
    let leveledUp = false;
    
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;
      leveledUp = true;

      const member = message.member;

      if (member) {
          await manageTieredRoles(member, user.level, client.config.levelingRoles, 'level');
      }

      const levelUpChannel = settings?.levelUpChannelId ? 
        message.guild.channels.cache.get(settings.levelUpChannelId) : 
        message.channel;

      if (levelUpChannel) {
        const levelUpEmbed = new EmbedBuilder()
          .setTitle('🚀 Level UP!')
          .setDescription(`${message.author}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
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
