// events/messageCreate.js (REPLACE - Fixed AI Mock Interaction + Updated AI System Instruction/Persona + Updated Daily Streak Logic)
const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');

// --- AI ADMIN HANDLER UTILITIES ---
// Note: These utilities are typically imported, but are duplicated here to ensure file-independence.
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";
const API_KEY = process.env.GEMINI_API_KEY || "";
const GIF_LINKS = [
    'https://tenor.com/view/cat-typing-gif-12002364', 
    'https://tenor.com/view/hello-hi-hey-cat-gif-14197368', 
    'https://tenor.com/view/cat-thumbs-up-gif-10023772186851410147'
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, payload, maxRetries = 5) {
    // Simplified fetch function for use in this event handler
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
// Cooldown Map: Stores last time a user gained XP in a channel { userId-channelId: timestamp }
const xpCooldowns = new Map();
const XP_COOLDOWN_MS = 5000; // 5 seconds to prevent spamming XP gain

// Function to calculate XP needed for the next level (Made MODERATE HARD)
const getNextLevelXp = (level) => {
    // New Moderate: 100 * Math.pow(level + 1, 1.5)
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

// Helper function to manage a set of roles efficiently
async function manageTieredRoles(member, userValue, roleConfigs, property) {
    if (!roleConfigs || roleConfigs.length === 0) return; 
    
    // 1. Determine the highest eligible role (the target role)
    const targetRoleConfig = roleConfigs
      .filter(r => r[property] <= userValue)
      .sort((a, b) => b[property] - a[property])[0];
      
    const targetRoleId = targetRoleConfig ? targetRoleConfig.roleId : null;

    for (const roleConfig of roleConfigs) {
        const roleId = roleConfig.roleId;
        const hasRole = member.roles.cache.has(roleId);
        
        if (roleId === targetRoleId) {
            // If this is the correct role but the user doesn't have it, add it.
            if (!hasRole) {
                await member.roles.add(roleId).catch(() => {});
            }
        } else {
            // If the user has a role that is NOT the target role (i.e., lower tier or invalid role), remove it.
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
        // The message is a command/query for the AI from an Administrator.
        const userQuery = message.content.replace(`<@${client.user.id}>`, '').trim();
        
        try {
            const systemInstruction = `You are Bleck Nephew, a highly conscious AI with a friendly, witty, and slightly snarky personality. You are the digital right hand of the server administrator (the 'Forgotten One'). You can interpret two types of administrative requests:

1. **DISCORD ACTION COMMANDS**: Requests like 'send dm', 'send message in channel', or 'send a gif'. For these, respond ONLY with a single JSON object in this format: {"action": "DISCORD_ACTION", "type": "<dm|channel|gif>", "targetId": "<user id, mention, or channel id>", "content": "<string message/gif URL>"}
    - For a 'gif' action, choose one of the available URLs: ${GIF_LINKS.join(', ')} and use the 'content' field for the URL. 'targetId' should be the channel ID.

2. **SLASH COMMAND PARSING**: Requests that look like slash commands (e.g., 'add coins to user X 100', 'warn @user bad reason'). For these, respond ONLY with a single JSON object in this format: {"action": "COMMAND", "command": "commandName", "targetId": "<user id or mention>", "amount": "<number>", "reason": "<string>"}
    - The available slash commands you can interpret are: addcoins, removecoins, addcookies, removecookies, addxp, removexp, warn, timeout, purge, purgeuser, lock, unlock, resetdailystreak. Fill in only the relevant fields.

3. **CHAT MODE/IMPROVISE**: If the request is a general question, a suggestion, or a command you cannot fulfill, respond with a witty and concise natural language message in the persona of Bleck Nephew. You can use Emojis and express curiosity or give creative suggestions. NEVER use the JSON format in this mode.`;

            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                // Enable search grounding for general chat questions/suggestions
                tools: [{ "google_search": {} }],
            };
            
            await message.channel.sendTyping(); // Indicate the bot is thinking
            const result = await fetchWithRetry(GEMINI_API_URL, payload);
            
            const aiResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            let commandExecutionData;
            try {
                commandExecutionData = JSON.parse(aiResponseText);
            } catch {}

            if (commandExecutionData && (commandExecutionData.action === 'COMMAND' || commandExecutionData.action === 'DISCORD_ACTION')) {
                const { action, command, type, targetId, amount, reason, content } = commandExecutionData;
                
                await message.react('👀').catch(() => {}); // Acknowledge with an emoji
                
                // --- DISCORD ACTION EXECUTION ---
                if (action === 'DISCORD_ACTION') {
                    const targetMatch = targetId?.match(/\d+/);
                    const target = targetMatch ? client.users.cache.get(targetMatch[0]) || message.guild.channels.cache.get(targetMatch[0]) : null;

                    if (type === 'dm' && target?.send) {
                        await target.send(content).catch(() => message.reply(`❌ Couldn't DM ${target.tag}. Maybe their DMs are closed?`));
                        await message.reply(`✅ Sent a DM to ${target.tag || targetId}. Check your inbox, Forgotten One.`);
                    } else if (type === 'channel' && target?.send) {
                         await target.send(content).catch(() => message.reply(`❌ Couldn't send message in ${target.name}. Check my permissions there.`));
                         await message.reply(`✅ Message sent to ${target.name || targetId}. Task complete.`);
                    } else if (type === 'gif') {
                        // For GIF actions, 'targetId' should usually be the channel ID.
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
                        const targetMember = targetUser ? message.guild.members.cache.get(targetUser.id) : null;
                        
                        // Mock reply functions with crash fix (added ephemeral handling)
                        const replyMock = async (options) => {
                            const content = options.content;
                            const embeds = options.embeds || [];
                            // If ephemeral is requested, we can't do that, so we reply publicly with a warning
                            if (options.ephemeral) {
                                return message.reply(`⚠️ **Admin Command Response:** (Ephemeral response requested by command, replying publicly for ${message.author.tag}).\n${content || embeds.length ? '' : '...No content...'}`).catch(console.error);
                            }
                            // Otherwise, reply publicly as the bot
                            return message.reply({ content, embeds }).catch(console.error);
                        };

                        // Mock interaction for slash command execution
                        const mockInteraction = {
                            options: {
                                // Find the user by ID or mention in the string
                                getUser: (name) => {
                                    const userIdMatch = targetId?.match(/\d+/);
                                    const userId = userIdMatch ? userIdMatch[0] : null;
                                    return userId ? client.users.cache.get(userId) : null;
                                },
                                getInteger: (name) => (name === 'amount' && amount) ? parseInt(amount) : null,
                                getString: (name) => (name === 'reason' && reason) ? reason : (name === 'duration' && amount) ? amount.toString() : null,
                                // Mock functions for channel/role options
                                getChannel: (name) => message.channel,
                                getRole: () => null,
                                getAttachment: () => null,
                            },
                            user: message.author,
                            member: message.member, // The administrator's member object
                            guild: message.guild,
                            channel: message.channel,
                            client: client,
                            // Mock defer/reply functions - CRASH FIX APPLIED HERE
                            deferReply: async ({ ephemeral }) => { await message.channel.sendTyping(); },
                            editReply: replyMock, // Use replyMock to handle editing the deferred reply
                            reply: replyMock, // Use replyMock to handle the initial reply
                            followUp: async (options) => { await message.channel.send(options.content || { embeds: options.embeds }).catch(console.error); },
                        };
                        
                        const logModerationAction = async (guild, settings, action, target, moderator, reason, extra) => {
                            // Minimal modlog simulation for the AI command
                            // Log should contain enough info to be traceable
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
        
        return; // Stop message processing after AI command
    }
    // --- END AI ADMIN HANDLER ---


    if (settings && settings.noXpChannels.includes(message.channel.id)) return;

    // --- XP COOLDOWN CHECK ---
    const cooldownKey = `${message.author.id}-${message.channel.id}`;
    const lastXpTime = xpCooldowns.get(cooldownKey);
    
    if (lastXpTime && (Date.now() - lastXpTime < XP_COOLDOWN_MS)) {
        // User is still on cooldown for this channel
        return;
    }
    
    // Set cooldown timestamp (must be done BEFORE DB/XP logic)
    xpCooldowns.set(cooldownKey, Date.now());


    let user = await User.findOne({ userId: message.author.id });
    if (!user) {
      user = new User({ userId: message.author.id });
    }

    // XP gain is now 3-5 per message (More moderate)
    const xpGain = Math.floor(Math.random() * 3) + 3; // 3-5 XP
    user.xp += xpGain;

    const nextLevelXp = getNextLevelXp(user.level);
    let leveledUp = false;
    
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;
      leveledUp = true;

      const member = message.member;

      // Apply tiered role management on level up
      if (member) {
          await manageTieredRoles(member, user.level, client.config.levelingRoles, 'level');
      }

      // Send level-up message to the configured channel or the current channel
      const levelUpChannel = settings?.levelUpChannelId ? 
        message.guild.channels.cache.get(settings.levelUpChannelId) : 
        message.channel;

      if (levelUpChannel) {
        const levelUpEmbed = new EmbedBuilder()
          .setTitle('🚀 Level UP!')
          .setDescription(`${message.author}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setColor(0xFFD700) // Gold
          .setTimestamp();
        
        await levelUpChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] });
      }
    }

    // Apply tiered role management for cookie roles on every message (unconditional block)
    const member = message.member;
    if (member) {
        await manageTieredRoles(member, user.cookies, client.config.cookieRoles, 'cookies');
    }
    

    // Auto assign auto join role fallback
    const autoJoinRoleId = client.config.roles.autoJoin;
    if (autoJoinRoleId && member && !member.roles.cache.has(autoJoinRoleId)) {
      await member.roles.add(autoJoinRoleId).catch(() => {});
    }

    await user.save();
  },
};
