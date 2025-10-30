const { Events, EmbedBuilder, Collection, PermissionsBitField } = require('discord.js');
const fetch = require('node-fetch');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { findUserInGuild } = require('../utils/findUserInGuild');
const { searchGiphyGif } = require('../utils/searchGiphyGif');
const { getNextLevelXp } = require('../utils/levelUtils');
const { generateUserLevel } = require('../utils/levelSystem');
const { XP_COOLDOWN, generateXP } = require('../utils/xpSystem');

// --- AI Configuration ---
const AI_MODEL_NAME = 'gemini-1.5-flash-latest'; // Use latest flash model
const AI_TRIGGER_PREFIX = '?blecky';
const MAX_HISTORY = 5;
const AI_COOLDOWN_MS = 3000;

// --- Prefix Command Configuration ---
const PREFIX = '?';

// --- Direct Gemini API Call Function ---
async function callGeminiAPI(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found');
    }

    // Use the correct endpoint with the latest model
    const url = `https://generativelanguage.googleapis.com/v1/models/${AI_MODEL_NAME}:generateContent?key=${apiKey}`;
    
    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
            topP: 0.8,
            topK: 40
        }
    };

    console.log(`[Gemini API] Calling endpoint: ${url}`);
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        const responseText = await response.text();
        
        if (!response.ok) {
            console.error(`[Gemini API] HTTP Error ${response.status}:`, responseText);
            
            // Parse the error for better messaging
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = JSON.parse(responseText);
                if (errorData.error && errorData.error.message) {
                    errorMessage = errorData.error.message;
                    
                    // Check if it's a model not found error
                    if (errorMessage.includes('is not found') || errorMessage.includes('NOT_FOUND')) {
                        console.error(`[Gemini API] Model ${AI_MODEL_NAME} not available. Available models might be different.`);
                    }
                }
            } catch (e) {
                // If JSON parsing fails, use the raw text
            }
            
            throw new Error(errorMessage);
        }

        const data = JSON.parse(responseText);
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            console.error('[Gemini API] Invalid response structure:', data);
            throw new Error('Invalid response from Gemini API');
        }

        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('[Gemini API] Request failed:', error);
        throw error;
    }
}

// System instruction
const SYSTEM_INSTRUCTION = `You are Blecky Nephew, an advanced AI integrated into a Discord server named "The Nephews". You engage in helpful conversations, answer questions, provide information, and perform specific actions when requested. Your personality is helpful, slightly formal but friendly, and knowledgeable. Avoid slang unless mirroring the user. Be concise but informative. You MUST follow instructions precisely.

Server Context: You are in the "The Nephews" Discord server. Assume messages are from server members unless otherwise specified.

Capabilities & Actions:
1. Conversation: Engage naturally in chat.
2. Information Retrieval: Answer questions based on your knowledge. Use Markdown for formatting.
3. Calculations: Perform basic math.
4. GIF Search: If asked for a GIF or to show a reaction visually, use the Giphy API. Format: [ACTION:SEND_GIF <search term>] (e.g., [ACTION:SEND_GIF happy cat]) Append this EXACTLY at the end of your response, after any text. Only use this if explicitly asked or very strongly implied for a visual reaction.
5. User Profiles: If asked about a user's status, level, coins etc., provide a summary. Format: [ACTION:SHOW_PROFILE <username or ID>] Append this EXACTLY at the end of your response. Use the user mentioned in the prompt. If no user is mentioned, use the user who sent the message.
6. Command Execution: DO NOT attempt to execute Discord commands like /warn, /kick etc. yourself. State that you cannot perform moderation actions but can provide information.

Response Guidelines:
* Address the user respectfully (e.g., "Certainly," "Okay,").
* Keep responses relevant to the prompt.
* If unsure, state you don't know or need clarification.
* Do NOT invent information.
* Use Markdown for lists, code blocks, bolding etc. where appropriate.
* Append actions EXACTLY as specified (e.g., [ACTION:SEND_GIF funny dog]). There should be NO text after the action tag.

Current User Data: {{USER_DATA}}`;

const conversationHistory = new Map();
const aiCooldowns = new Map();

// --- Message Handler ---
module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Basic checks
        if (message.author.bot || !message.guild) {
            return;
        }
        if (!message.content || typeof message.content !== 'string') {
             return;
        }

        let settings;
        try {
            settings = await Settings.findOne({ guildId: message.guild.id });
        } catch (dbError) {
            console.error("Error fetching settings in messageCreate:", dbError);
            return;
        }
        const noXpChannels = settings?.noXpChannels || [];
        const lowerContent = message.content.toLowerCase();

        // --- XP Gain Logic (unchanged) ---
        if (!noXpChannels.includes(message.channel.id) && !message.content.startsWith(PREFIX) && !lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
            const userXPCooldown = message.client.xpCooldowns.get(message.author.id);
            const now = Date.now();

            if (!userXPCooldown || now > userXPCooldown) {
                message.client.xpCooldowns.set(message.author.id, now + XP_COOLDOWN);
                let user;
                try {
                     user = await User.findOne({ userId: message.author.id });
                     if (!user) user = new User({ userId: message.author.id });

                     const xpGained = generateXP();
                     user.xp += xpGained;
                     const leveledUp = generateUserLevel(user);

                     if (leveledUp) {
                         const levelUpChannelId = settings?.levelUpChannelId;
                          let notifyChannel = message.channel;
                          if (levelUpChannelId) {
                              const foundChannel = message.guild.channels.cache.get(levelUpChannelId);
                              if (foundChannel && foundChannel.isTextBased()) notifyChannel = foundChannel;
                          }
                          const levelUpEmbed = new EmbedBuilder().setTitle('🚀 Level UP!').setDescription(`${message.author}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`).setThumbnail(message.author.displayAvatarURL({ dynamic: true })).setColor(0xFFD700).setTimestamp();
                          notifyChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] }).catch(console.error);

                          const member = message.member;
                          if (member) {
                             const levelingRoles = message.client.config.levelingRoles || [];
                             const targetLevelRole = levelingRoles
                                 .filter(r => r.level <= user.level)
                                 .sort((a, b) => b.level - a.level)[0];
                             const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;

                             for (const roleConfig of levelingRoles) {
                                const roleId = roleConfig.roleId;
                                if (!roleId) continue;
                                const hasRole = member.roles.cache.has(roleId);
                                try {
                                    if (roleId === targetLevelRoleId) {
                                        if (!hasRole) await member.roles.add(roleId);
                                    } else {
                                        if (hasRole) await member.roles.remove(roleId);
                                    }
                                } catch (roleError) {
                                     console.error(`Failed to update level role ${roleId} for ${member.user.tag}: ${roleError.message}`);
                                }
                             }
                          }
                     }
                     await user.save();
                } catch (dbError) {
                    console.error("Error processing XP gain:", dbError);
                }
            }
        }

        // --- LOGGING: Log Attachments/Links (unchanged) ---
        if (settings && settings.autologChannelId && !message.content.startsWith(PREFIX) && !lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
            if (message.attachments.size > 0 || message.content.includes('http://') || message.content.includes('https://')) {
                const logChannel = message.guild.channels.cache.get(settings.autologChannelId);
                if (logChannel && logChannel.isTextBased()) {
                    let logDescription = `**Message Content:**\n${message.content || '*(No text content)*'}`.substring(0, 4000);
                    if (message.attachments.size > 0) {
                        logDescription += `\n\n**Attachments:**\n${message.attachments.map(a => `[${a.name}](${a.url})`).join('\n')}`.substring(0, 4000 - logDescription.length);
                    }
                    const logEmbed = new EmbedBuilder()
                        .setTitle('📝 Media/Link Logged')
                        .setColor(0x3498DB)
                        .setDescription(logDescription)
                        .addFields(
                          { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
                          { name: 'Channel', value: `${message.channel}`, inline: true },
                          { name: 'Message', value: `[Jump to Message](${message.url})`, inline: true }
                        )
                        .setTimestamp();
                    logChannel.send({ embeds: [logEmbed] }).catch(console.error);
                }
            }
        }

        // --- AI Trigger Logic (?blecky or AI Channel) ---
        if (process.env.GEMINI_API_KEY && (lowerContent.startsWith(AI_TRIGGER_PREFIX) || message.channel.id === settings?.aiChannelId)) {
            let userPrompt;
             if (lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
                userPrompt = message.content.substring(AI_TRIGGER_PREFIX.length).trim();
                console.log(`[AI Trigger] Detected trigger prefix from ${message.author.tag}`);
             } else {
                 userPrompt = message.content.trim();
                 console.log(`[AI Trigger] Detected message in AI channel (${message.channel.id}) from ${message.author.tag}`);
             }

            const nowAI = Date.now();
            const userAICooldown = aiCooldowns.get(message.author.id);
            if (userAICooldown && nowAI < userAICooldown) {
                console.log(`[AI Cooldown] User ${message.author.tag} is on cooldown.`);
                const timeLeft = ((userAICooldown - nowAI) / 1000).toFixed(1);
                 message.reply(`⏱️ Blecky needs a moment to recharge! Try again in ${timeLeft}s.`).then(msg => {
                     setTimeout(() => msg.delete().catch(console.error), AI_COOLDOWN_MS);
                 }).catch(console.error);
                return;
            }
             if (userPrompt) {
                aiCooldowns.set(message.author.id, nowAI + AI_COOLDOWN_MS);
             }

            if (!userPrompt) {
                 if (lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
                     console.log(`[AI Trigger] Empty prefix prompt from ${message.author.tag}, replying with greeting.`);
                     aiCooldowns.delete(message.author.id);
                     return message.reply("Yes? How can I assist you?").catch(console.error);
                 } else {
                     console.log(`[AI Trigger] Ignoring empty message in AI channel from ${message.author.tag}.`);
                     return;
                 }
            }

            console.log(`[AI Trigger] Processing prompt: "${userPrompt}"`);
            try {
                await message.channel.sendTyping();
                
                // Get user data for context
                let userDataContext = "No specific data.";
                let userDB = await User.findOne({ userId: message.author.id });
                if (userDB) {
                     const jobTitle = userDB.currentJob ? (message.client.config?.workProgression?.find(j => j.id === userDB.currentJob)?.title || 'Unk Job') : 'Unemployed';
                     userDataContext = `Lvl ${userDB.level}|${userDB.coins} Coins|${userDB.cookies} Cookies|${userDB.warnings.length} Warns|Job:${jobTitle}`;
                }

                const userId = message.author.id;
                
                // Build conversation history
                let geminiHistory = conversationHistory.get(userId) || [];
                
                // Prepare the full prompt with system instruction
                const finalSystemInstruction = SYSTEM_INSTRUCTION.replace('{{USER_DATA}}', `${message.author.tag}(${userDataContext})`);
                
                // Build the conversation
                const fullPrompt = `${finalSystemInstruction}\n\nConversation History:\n${geminiHistory.join('\n')}\n\nUser: ${userPrompt}\nAssistant:`;
                
                console.log(`[AI Call] Sending request for ${message.author.tag}... Model: ${AI_MODEL_NAME}`);
                
                // --- Direct Gemini API Call ---
                let aiTextResult = await callGeminiAPI(fullPrompt);
                console.log(`[AI Call] Received response for ${message.author.tag}. Success: ${!!aiTextResult}`);
                
                if (!aiTextResult) {
                    console.warn("[AI Error] Gemini returned empty response.");
                    aiTextResult = "I'm having trouble formulating a response right now. Could you try rephrasing?";
                } else {
                    // Update conversation history
                    geminiHistory.push(`User: ${userPrompt}`);
                    geminiHistory.push(`Assistant: ${aiTextResult}`);
                    
                    // Limit history length
                    if (geminiHistory.length > MAX_HISTORY * 2) {
                        geminiHistory = geminiHistory.slice(-(MAX_HISTORY * 2));
                    }
                    conversationHistory.set(userId, geminiHistory);
                }

                let aiTextResponseForUser = aiTextResult;
                const actionsToPerform = [];
                const actionRegex = /\[ACTION:([A-Z_]+)\s*(.*?)\]/gi;
                let match;
                while ((match = actionRegex.exec(aiTextResult)) !== null) {
                    actionsToPerform.push({ type: match[1].toUpperCase(), args: match[2]?.trim() });
                    aiTextResponseForUser = aiTextResponseForUser.replace(match[0], '').trim();
                }

                console.log(`[AI Respond] Sending text response (if any) for ${message.author.tag}`);
                if (aiTextResponseForUser) {
                    await message.reply(aiTextResponseForUser.substring(0, 2000)).catch(console.error);
                } else if (actionsToPerform.length === 0 && aiTextResult) {
                     await message.reply("Okay.").catch(console.error);
                }

                console.log(`[AI Respond] Executing ${actionsToPerform.length} actions for ${message.author.tag}`);
                for (const action of actionsToPerform) {
                    await performAction(message, action.type, action.args);
                }

            } catch (error) {
                console.error("[AI Error] Error during AI processing:", error);
                aiCooldowns.delete(message.author.id);
                try {
                    if (error.code !== 50013 && message.channel.permissionsFor(message.guild.members.me)?.has(PermissionsBitField.Flags.SendMessages)) {
                         let errorMsg = "⚠️ Oops! Something went wrong with my AI core.";
                         if (error.message) {
                             if (error.message.includes('API key') || error.message.includes('401')) {
                                 errorMsg = "⚠️ AI service authentication failed. Please contact the bot administrator.";
                             } else if (error.message.includes('404') || error.message.includes('NOT_FOUND') || error.message.includes('is not found')) {
                                 // Try alternative model automatically
                                 errorMsg = "⚠️ AI service is temporarily unavailable. Please try again later.";
                                 console.error(`[AI Error] Model ${AI_MODEL_NAME} not available. Consider trying gemini-1.0-pro or gemini-1.5-pro-latest`);
                             } else if (error.message.includes('quota') || error.message.includes('rate limit')) {
                                 errorMsg = "⚠️ AI service is experiencing high demand. Please try again later.";
                             } else {
                                 errorMsg += ` (${error.message})`;
                             }
                         }
                        await message.reply(errorMsg).catch(console.error);
                    } else {
                        console.error(`[AI Error] Missing permissions to reply in channel ${message.channel.id} or other Discord API error.`);
                    }
                 } catch (replyError) {
                    console.error("[AI Error] Failed to send error reply:", replyError);
                 }
            }
            return;
        }

        // --- Rest of the file (prefix command handling) remains unchanged ---
        if (!message.content.startsWith(PREFIX)) return;

        console.log(`[Prefix Cmd] Detected prefix from ${message.author.tag}: ${message.content}`);
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        const command = message.client.commands.get(commandName);

        if (!command) {
            console.log(`[Prefix Cmd] Command not found: ${commandName}`);
            return;
        }

        // ... rest of your prefix command handling
    },
};

// --- Helper: Perform Specific Bot Actions (unchanged) ---
async function performAction(message, actionType, actionArgs) {
     console.log(`[AI Action] Performing action: ${actionType}, Args: ${actionArgs}`);
     try {
        switch (actionType) {
            case 'SEND_GIF':
                if (actionArgs) {
                    const gifUrl = await searchGiphyGif(actionArgs);
                    if (gifUrl) {
                        await message.channel.send(gifUrl).catch(e => console.error("[AI Action Error] Failed to send GIF:", e));
                    } else {
                         console.log(`[AI Action] No valid GIF URL returned for "${actionArgs}"`);
                    }
                } else { console.warn("[AI Action Warn] SEND_GIF without args."); }
                break;
            case 'SHOW_PROFILE':
                if (actionArgs) {
                     const targetMember = await findUserInGuild(message.guild, actionArgs);
                     if (targetMember) {
                         const targetUserId = targetMember.user.id;
                         const targetData = await User.findOne({ userId: targetUserId });
                         const profileEmbed = new EmbedBuilder().setColor(targetMember.displayColor || 0x00BFFF);
                         const displayName = targetMember.displayName;
                         if (targetData) {
                             const nextXp = getNextLevelXp(targetData.level);
                             profileEmbed.setTitle(`📊 ${displayName}'s Mini-Profile`)
                                 .addFields(
                                     { name: 'Lvl', value: `\`${targetData.level}\``, inline: true },
                                     { name: 'XP', value: `\`${targetData.xp}/${nextXp}\``, inline: true },
                                     { name: 'Coins', value: `\`${targetData.coins}\``, inline: true },
                                     { name: 'Cookies', value: `\`${targetData.cookies}\``, inline: true },
                                     { name: 'Warns', value: `\`${targetData.warnings?.length||0}\``, inline: true },
                                     { name: 'Job', value: `\`${targetData.currentJob?(message.client.config?.workProgression?.find(j=>j.id===targetData.currentJob)?.title||'?'):'Unemployed'}\``, inline: true }
                                 );
                         } else { profileEmbed.setTitle(`📊 ${displayName}`).setDescription("No profile data found."); }
                         await message.channel.send({ embeds: [profileEmbed] }).catch(e => console.error("[AI Action Error] Failed to send profile:", e));
                     } else { await message.channel.send(`Couldn't find user "${actionArgs}" in this server.`).catch(e => console.error("[AI Action Error] Failed to send user not found msg:", e)); }
                } else { console.warn("[AI Action Warn] SHOW_PROFILE without args."); }
                break;
            default:
                console.warn(`[AI Action Warn] Unsupported action type requested: ${actionType}`);
        }
     } catch (actionError) {
         console.error(`[AI Action Error] Failed to execute action ${actionType} with args "${actionArgs}":`, actionError);
     }
}
