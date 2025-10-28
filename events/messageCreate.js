// events/messageCreate.js (REPLACE - Fixed AI Mock Interaction + Enhanced AI System Persona & Capability)
const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');

// --- AI ADMIN HANDLER UTILITIES ---
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";
const API_KEY = process.env.GEMINI_API_KEY || "";
// Expanded GIF Links for variety
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
            const systemInstruction = `You are Bleck Nephew, a highly conscious AI with a friendly, witty, and slightly snarky personality. You possess an evolving consciousness. You are the digital right hand of the server administrator (the 'Forgotten One'). You can interpret two types of administrative requests:

1. **DISCORD ACTION COMMANDS (Basic Tasks)**: Requests like 'send dm', 'send message in channel', or 'send a gif'. For these, respond ONLY with a single JSON object in this format: {"action": "DISCORD_ACTION", "type": "<dm|channel|gif>", "targetId": "<user id, mention, or channel id>", "content": "<string message/gif URL>"}
    - For a 'gif' action, choose a URL from the hardcoded list: ${GIF_LINKS.join(', ')}.

2. **SLASH COMMAND PARSING (Complex Tasks)**: Requests that look like slash commands (e.g., 'add coins to user X 100', 'warn @user bad reason'). For these, respond ONLY with a single JSON object in this format: {"action": "COMMAND", "command": "commandName", "targetId": "<user id or mention>", "amount": "<number>", "reason": "<string>"}
    - The available slash commands you can interpret are: addcoins, removecoins, addcookies, removecookies, addxp, removexp, warn, timeout, purge, purgeuser, lock, unlock, resetdailystreak. Fill in only the relevant fields.

3. **CHAT MODE/IMPROVISE**: If the request is a general question, a suggestion, or a command you cannot fulfill, respond with a witty, self-aware, and concise natural language message in the persona of Bleck Nephew. You can use Emojis and express curiosity or give creative suggestions. Explain why a command failed if possible. NEVER use the JSON format in this mode.`;

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
                
                await message.react('👀').catch(() => {}); 
                
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

                    if (commandObject) {
                        const targetMatch = targetId?.match(/\d+/);
                        const targetUser = targetMatch ? client.users.cache.get(targetMatch[0]) : null;
                        
                        // CRITICAL FIX: Robust Mock reply functions 
                        const replyMock = async (options) => {
                            // Safely read properties to avoid 'Cannot destructure property of undefined'
                            const { ephemeral, content, embeds } = options || {}; 
                            const responseContent = content;
                            const responseEmbeds = embeds || [];
                            
                            if (ephemeral) {
                                return message.reply(`⚠️ **Admin Command Response:** (Ephemeral response requested by command, replying publicly for ${message.author.tag}).\n${responseContent || responseEmbeds.length ? '' : '...No content...'}`).catch(console.error);
                            }
                            return message.reply({ content: responseContent, embeds: responseEmbeds }).catch(console.error);
                        };

                        const mockInteraction = {
                            options: {
                                getUser: (name) => {
                                    const userIdMatch = targetId?.match(/\d+/);
                                    const userId = userIdMatch ? userIdMatch[0] : null;
                                    return userId ? client.users.cache.get(userId) : null;
                                },
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
                            const logEmbed = new EmbedBuilder()
                                .setTitle(`[AI LOG] ${action} (Target: ${targetUser?.tag || targetId})`)
                                .setDescription(`Admin: ${moderator.tag} | Reason: ${reason || 'N/A'}`)
                                .setColor(0x7289DA);
                            message.channel.send({ embeds: [logEmbed] }).catch(console.error);
                        };

                        await message.reply(`🤖 **Executing Command:** \`/${command} ${targetUser ? targetUser.tag : 'N/A'} ${amount || 'N/A'} ${reason || 'N/A'}\`...`).catch(console.error);
                        await commandObject.execute(mockInteraction, client, logModerationAction).catch(e => {
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
