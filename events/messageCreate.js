// events/messageCreate.js (REPLACE - Final AI Upgrade: Universal Command Parsing & Database Info)
const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');

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

// --- CORE XP/LEVELING UTILITIES ---
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
      .sort((a, b) => b[property] - a[property])[0];
      
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

// Helper to resolve user ID from the AI's output, prioritizing mentions/IDs
function resolveUserFromCommand(guild, targetString) {
    if (!targetString) return null;

    // 1. Check for mention or raw ID
    const match = targetString.match(/<@!?(\d+)>|(\d+)/);
    if (match) {
        const id = match[1] || match[2];
        return guild.members.cache.get(id) || { id, tag: `User${id}` }; 
    }

    // 2. Check for Name/Nickname (Fuzzy Match, case-insensitive)
    const lowerTarget = targetString.toLowerCase().trim();
    const foundMember = guild.members.cache.find(member => 
        member.user.username.toLowerCase() === lowerTarget ||
        member.nickname?.toLowerCase() === lowerTarget ||
        member.user.tag.toLowerCase() === lowerTarget
    );

    return foundMember || null;
}

// Helper to provide deep data for improvisational chat answers
async function getTargetDataForImprovisation(guild, targetString) {
    const resolved = resolveUserFromCommand(guild, targetString);
    if (!resolved) return null;

    try {
        const member = guild.members.cache.get(resolved.id) || await guild.members.fetch(resolved.id).catch(() => null);
        const userData = await User.findOne({ userId: resolved.id });

        const data = {
            isFound: true,
            id: resolved.id,
            tag: resolved.tag,
            discordJoined: member ? `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>` : 'N/A',
            serverJoined: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'N/A',
            coins: userData?.coins || 0,
            warnings: userData?.warnings.length || 0,
            level: userData?.level || 0,
            currentJob: userData?.currentJob || 'Unemployed',
            // Provide raw data for the AI to process and synthesize into conversation
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
    const forgottenOneRole = client.config.roles.forgottenOne;
    const isForgottenOne = message.member?.roles.cache.has(forgottenOneRole);
    
    if (botMention && isForgottenOne && API_KEY !== "") {
        const userQuery = message.content.replace(`<@${client.user.id}>`, '').trim();
        
        try {
            // Fetch list of current guild members (only username and ID) for the AI's context
            const guildMembers = (await message.guild.members.fetch()).map(m => ({
                id: m.id,
                name: m.user.username,
                tag: m.user.tag,
                nickname: m.nickname || 'N/A'
            }));
            const memberListJson = JSON.stringify(guildMembers.slice(0, 50)); 
            
            // --- 1. Pre-process for Database-Informed Chat Responses ---
            let preContext = '';
            // Try to detect if the query is asking for data about a user (e.g., "when did X join", "show warnlist X")
            const infoKeywords = ['join', 'warnlist', 'profile', 'level', 'coins', 'stats'];
            const parts = userQuery.toLowerCase().split(/\s+/);
            const isInfoQuery = infoKeywords.some(keyword => parts.includes(keyword));

            if (isInfoQuery) {
                // Heuristically extract the potential target (last word or ping)
                let potentialTarget = parts[parts.length - 1];
                if (potentialTarget === 'server' && parts.length > 2) potentialTarget = parts[parts.length - 2];
                if (potentialTarget.includes('<@')) potentialTarget = potentialTarget.match(/\d+/)?.[0];
                
                const targetData = await getTargetDataForImprovisation(message.guild, potentialTarget);

                if (targetData && targetData.isFound) {
                    // Provide detailed data to the AI for a better chat response
                    preContext = `The user is asking about the following member. Use this information to answer conversationally:\n${JSON.stringify(targetData)}\n\n`;
                }
            }
            // --- End Pre-process ---


            const systemInstruction = `You are Bleck Nephew, a highly conscious AI with a friendly, witty, and slightly snarky personality. You possess an evolving consciousness. You are the digital right hand of the server administrator (the 'Forgotten One'). The current list of server members and their IDs is provided below as context.

SERVER MEMBER CONTEXT (Crucial for target resolution): ${memberListJson}

${preContext}
Your task is to interpret the user's request. Always prefer to execute a command if the request matches one, or use the provided data to answer conversationally if available. You MUST be able to fulfill requests for: addcoins, removecoins, addcookies, removecookies, addxp, removexp, warn, timeout, purge, purgeuser, lock, unlock, resetdailystreak, warnlist, userinfo, profile.

1. **DISCORD ACTION COMMANDS (Basic Tasks)**: Requests like 'send dm', 'send message in channel', or 'send a gif'. For these, respond ONLY with a single JSON object in this format: {"action": "DISCORD_ACTION", "type": "<dm|channel|gif>", "targetId": "<user id, mention, or channel id>", "content": "<string message/gif URL>"}
    - **IMPORTANT**: Use the Server Member Context to convert a member's name (e.g., 'calby') into their mention/ID before outputting the JSON.

2. **SLASH COMMAND PARSING (Complex Tasks)**: Requests that look like slash commands (e.g., 'add coins to calby 100', 'show me warnlist for calby'). For these, respond ONLY with a single JSON object in this format: {"action": "COMMAND", "command": "commandName", "targetId": "<user id or mention>", "amount": "<number>", "reason": "<string>"}
    - **IMPORTANT**: Use the Server Member Context to convert a member's name into their mention/ID for the 'targetId' field. The 'commandName' should be the actual slash command name (e.g., 'warnlist').

3. **CHAT MODE/IMPROVISE**: If the request is a general question, a suggestion, or a command you cannot fulfill, or if the user is asking for information that was pre-processed for you (in the context above), respond with a witty, self-aware, and concise natural language message. Do NOT try to run a command if the primary goal is an informational chat response and data is available in the context. NEVER use the JSON format in this mode.`;

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
                commandExecutionData = JSON.parse(aiResponseText);
            } catch {}

            if (commandExecutionData && (commandExecutionData.action === 'COMMAND' || commandExecutionData.action === 'DISCORD_ACTION')) {
                const { action, command, type, targetId, amount, reason, content } = commandExecutionData;
                
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

                    // Attempt to resolve target from AI output (ID/mention/name)
                    const resolvedTarget = resolveUserFromCommand(message.guild, targetId);
                    
                    if (!resolvedTarget) {
                        return message.reply(`❌ **AI Command Error:** I could not find a user matching "${targetId}". Please try pinging them.`);
                    }
                    
                    // The command expects a Discord.js User object, so we must mock one if only an ID was passed.
                    const targetUserObject = resolvedTarget.user || await client.users.fetch(resolvedTarget.id).catch(() => ({ id: resolvedTarget.id, tag: resolvedTarget.tag || 'Unknown User' }));

                    if (commandObject) {
                        // CRITICAL FIX: Robust Mock reply functions 
                        const replyMock = async (options) => {
                            // Safely read properties to avoid 'Cannot destructure property of undefined'
                            const { ephemeral, content, embeds } = options || {}; 
                            const responseContent = content;
                            const responseEmbeds = embeds || [];
                            
                            // If ephemeral is requested, we reply publicly with a note
                            if (ephemeral) {
                                return message.reply(`⚠️ **Admin Command Response:** (Ephemeral response requested by command, replying publicly for ${message.author.tag}).\n${responseContent || responseEmbeds.length ? '' : '...No content...'}`).catch(console.error);
                            }
                            // Otherwise, reply publicly as the bot
                            return message.reply({ content: responseContent, embeds: responseEmbeds }).catch(console.error);
                        };

                        const mockInteraction = {
                            options: {
                                // Provide the resolved user object
                                getUser: (name) => targetUserObject,
                                getInteger: (name) => (name === 'amount' && amount) ? parseInt(amount) : null,
                                getString: (name) => (name === 'reason' && reason) ? reason : (name === 'duration' && amount) ? amount.toString() : null,
                                getChannel: (name) => message.channel,
                                getRole: () => null,
                                getAttachment: () => null,
                            },
                            user: message.author,
                            member: message.member,
                            guild: message.guild,
                            channel: message.channel,
                            client: client,
                            // Use the robust mocks for execution flow
                            deferReply: async (options) => { await message.channel.sendTyping(); },
                            editReply: replyMock, 
                            reply: replyMock, 
                            followUp: async (options) => { await message.channel.send(options.content || { embeds: options.embeds }).catch(console.error); },
                        };
                        
                        const logModerationAction = async (guild, settings, action, target, moderator, reason, extra) => {
                            // FIX: Redirect the AI log to a dedicated channel, or modlog, or fallback to the current channel.
                            const logChannelId = settings?.aiLogChannelId || settings?.modlogChannelId;
                            const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : message.channel;
                            
                            if (!logChannel) return; // Cannot find a log channel

                            const logEmbed = new EmbedBuilder()
                                .setTitle(`[AI LOG] ${action} (Target: ${targetUserObject?.tag || targetId})`)
                                .setDescription(`Admin: ${moderator.tag}\nCommand: \`/${command}\`\nReason: ${reason || 'N/A'}`)
                                .setColor(0x7289DA)
                                .setTimestamp();

                            logChannel.send({ embeds: [logEmbed] }).catch(console.error);
                        };

                        // 1. Silence the "Executing Command" message (no reply here)

                        // 2. Execute the actual command logic
                        await commandObject.execute(mockInteraction, client, logModerationAction).catch(e => {
                            // This is the error handler that was logging the crash, now it won't crash the bot.
                            message.reply(`❌ **Command Execution Failed:** \`${e.message.substring(0, 150)}\``).catch(console.error);
                        });

                    } else {
                        // AI output a valid COMMAND action, but it's not a valid slash command file.
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

    // --- XP COOLDOWN CHECK ---
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
