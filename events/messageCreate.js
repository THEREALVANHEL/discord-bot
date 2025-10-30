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
const AI_MODEL_NAME = 'gemini-2.0-flash-001';
const AI_TRIGGER_PREFIXES = ['?blecky', '?b']; // Multiple trigger prefixes
const MAX_HISTORY = 5;
const AI_COOLDOWN_MS = 3000;

// --- Prefix Command Configuration ---
const PREFIX = '?';

// --- Enhanced User Search Function ---
async function findUserAnyMethod(guild, searchTerm) {
    if (!searchTerm) return null;
    
    // Clean the search term
    const cleanTerm = searchTerm.replace(/[<@!>]/g, '').trim().toLowerCase();
    
    // Method 1: Try by user ID
    if (/^\d+$/.test(cleanTerm)) {
        try {
            const member = await guild.members.fetch(cleanTerm).catch(() => null);
            if (member) return member;
        } catch (error) {
            // Ignore and try other methods
        }
    }
    
    // Method 2: Try by mention
    if (searchTerm.startsWith('<@') && searchTerm.endsWith('>')) {
        const userId = searchTerm.replace(/[<@!>]/g, '');
        try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) return member;
        } catch (error) {
            // Ignore and try other methods
        }
    }
    
    // Method 3: Try by username (case insensitive)
    const members = await guild.members.fetch();
    
    // Try exact display name match
    const displayNameMatch = members.find(member => 
        member.displayName.toLowerCase() === cleanTerm
    );
    if (displayNameMatch) return displayNameMatch;
    
    // Try exact username match
    const usernameMatch = members.find(member => 
        member.user.username.toLowerCase() === cleanTerm
    );
    if (usernameMatch) return usernameMatch;
    
    // Try partial display name match
    const partialDisplayMatch = members.find(member => 
        member.displayName.toLowerCase().includes(cleanTerm)
    );
    if (partialDisplayMatch) return partialDisplayMatch;
    
    // Try partial username match
    const partialUsernameMatch = members.find(member => 
        member.user.username.toLowerCase().includes(cleanTerm)
    );
    if (partialUsernameMatch) return partialUsernameMatch;
    
    // Try by tag (username#discriminator or username)
    const tagMatch = members.find(member => 
        member.user.tag.toLowerCase() === cleanTerm || 
        member.user.username.toLowerCase() === cleanTerm
    );
    if (tagMatch) return tagMatch;
    
    return null;
}

// --- Find User by ID Globally ---
async function findUserGlobally(client, userId) {
    try {
        // Try to fetch user directly (works for any user the bot can see)
        const user = await client.users.fetch(userId).catch(() => null);
        return user;
    } catch (error) {
        return null;
    }
}

// --- Direct Gemini API Call Function ---
async function callGeminiAPI(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found');
    }

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
            
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = JSON.parse(responseText);
                if (errorData.error && errorData.error.message) {
                    errorMessage = errorData.error.message;
                    
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

// Enhanced System Instruction with Server Context
const SYSTEM_INSTRUCTION = `You are Blecky Nephew, an advanced AI integrated into a Discord server named "The Nephews". You engage in helpful conversations, answer questions, provide information, and perform specific actions when requested. Your personality is helpful, slightly formal but friendly, and knowledgeable. Avoid slang unless mirroring the user. Be concise but informative. You MUST follow instructions precisely.

Server Context: You are in the "The Nephews" Discord server. Assume messages are from server members unless otherwise specified.

IMPORTANT USER DATA ACCESS: You have access to MongoDB database that contains user profiles with levels, XP, coins, cookies, warnings, and job information. You can retrieve this data for any server member.

Capabilities & Actions:
1. Conversation: Engage naturally in chat.
2. Information Retrieval: Answer questions based on your knowledge. Use Markdown for formatting.
3. Calculations: Perform basic math.
4. User Data Lookup: You can access user profiles including levels, coins, cookies, warnings, and job information for any server member.
5. Server Information: You can provide information about when users joined the server and their roles.
6. User Pinging: You can ping/mention users in your responses. Just use @username or @displayname naturally in your text.
7. Direct Messaging: You can send direct messages to users. Format: [ACTION:SEND_DM <username or ID> <message>]
8. Avatar Display: You can show user avatars. Format: [ACTION:SHOW_AVATAR <username or ID>]
9. Global Avatar: You can show avatars of any user by ID, even if they're not in this server. Format: [ACTION:SHOW_GLOBAL_AVATAR <user ID>]
10. Server Stats: You can show server statistics. Format: [ACTION:SERVER_STATS]
11. User Roles: You can show a user's roles. Format: [ACTION:SHOW_ROLES <username or ID>]
12. GIF Search: If asked for a GIF or to show a reaction visually, use the Giphy API. Format: [ACTION:SEND_GIF <search term>]
13. User Profiles: If asked about a user's status, level, coins etc., provide a summary. Format: [ACTION:SHOW_PROFILE <username or ID>]
14. Server Join Date: If asked when a user joined, provide their join date. Format: [ACTION:SHOW_JOIN_DATE <username or ID>]
15. Random Fact: Share a random interesting fact. Format: [ACTION:RANDOM_FACT]
16. Joke: Tell a joke. Format: [ACTION:TELL_JOKE]

Response Guidelines:
* Address the user respectfully (e.g., "Certainly," "Okay,").
* Keep responses relevant to the prompt.
* You can naturally ping users using @username in your responses.
* For DMs, avatars, profiles, join dates, use the specific actions.
* Do NOT invent information - use actions to retrieve real data.
* Use Markdown for lists, code blocks, bolding etc. where appropriate.
* Append actions EXACTLY as specified. There should be NO text after the action tag.

Current User Data: {{USER_DATA}}`;

const conversationHistory = new Map();
const aiCooldowns = new Map();

// --- Message Handler ---
module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // === DUPLICATE MESSAGE PROTECTION ===
        if (message.client.processedMessages && message.client.processedMessages.has(message.id)) {
            console.log(`[Duplicate Protection] Ignoring duplicate message: ${message.id}`);
            return;
        }
        
        if (!message.client.processedMessages) {
            message.client.processedMessages = new Map();
        }
        
        message.client.processedMessages.set(message.id, true);
        
        if (message.client.processedMessages.size > 1000) {
            const firstKey = message.client.processedMessages.keys().next().value;
            message.client.processedMessages.delete(firstKey);
        }

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

        // --- Check for AI Trigger Prefixes ---
        let usedPrefix = null;
        for (const prefix of AI_TRIGGER_PREFIXES) {
            if (lowerContent.startsWith(prefix)) {
                usedPrefix = prefix;
                break;
            }
        }

        // --- XP Gain Logic ---
        if (!noXpChannels.includes(message.channel.id) && !message.content.startsWith(PREFIX) && !usedPrefix) {
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

        // --- LOGGING: Log Attachments/Links ---
        if (settings && settings.autologChannelId && !message.content.startsWith(PREFIX) && !usedPrefix) {
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

        // --- AI Trigger Logic ---
        if (process.env.GEMINI_API_KEY && (usedPrefix || message.channel.id === settings?.aiChannelId)) {
            let userPrompt;
            if (usedPrefix) {
                userPrompt = message.content.substring(usedPrefix.length).trim();
                console.log(`[AI Trigger] Detected trigger prefix "${usedPrefix}" from ${message.author.tag}`);
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
                 if (usedPrefix) {
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
                             } else if (error.message.includes('404') || errorMessage.includes('NOT_FOUND') || error.message.includes('is not found')) {
                                 errorMsg = "⚠️ AI service is temporarily unavailable. Please try again later.";
                                 console.error(`[AI Error] Model ${AI_MODEL_NAME} not available. Consider trying gemini-2.5-flash or gemini-2.5-pro`);
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

// --- Enhanced Helper: Perform Specific Bot Actions ---
async function performAction(message, actionType, actionArgs) {
     console.log(`[AI Action] Performing action: ${actionType}, Args: "${actionArgs}"`);
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
                    let targetMember;
                    
                    // If no specific user mentioned, use the message author
                    if (actionArgs.toLowerCase() === 'me' || actionArgs === '') {
                        targetMember = message.member;
                    } else {
                        targetMember = await findUserAnyMethod(message.guild, actionArgs);
                    }
                    
                    if (targetMember) {
                        const targetUserId = targetMember.user.id;
                        const targetData = await User.findOne({ userId: targetUserId });
                        const profileEmbed = new EmbedBuilder()
                            .setColor(targetMember.displayColor || 0x00BFFF)
                            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }));

                        const displayName = targetMember.displayName;
                        
                        if (targetData) {
                            const nextXp = getNextLevelXp(targetData.level);
                            const jobTitle = targetData.currentJob ? 
                                (message.client.config?.workProgression?.find(j => j.id === targetData.currentJob)?.title || 'Unknown') : 
                                'Unemployed';
                                
                            profileEmbed.setTitle(`📊 ${displayName}'s Profile`)
                                .addFields(
                                    { name: 'Level', value: `**${targetData.level}**`, inline: true },
                                    { name: 'XP', value: `**${targetData.xp}**/${nextXp}`, inline: true },
                                    { name: 'Coins', value: `**${targetData.coins}**`, inline: true },
                                    { name: 'Cookies', value: `**${targetData.cookies}**`, inline: true },
                                    { name: 'Warnings', value: `**${targetData.warnings?.length || 0}**`, inline: true },
                                    { name: 'Job', value: `**${jobTitle}**`, inline: true }
                                )
                                .setFooter({ text: `User ID: ${targetUserId}` })
                                .setTimestamp();
                        } else {
                            profileEmbed.setTitle(`📊 ${displayName}`)
                                .setDescription("No profile data found in database.")
                                .setFooter({ text: `User ID: ${targetUserId}` });
                        }
                        
                        await message.channel.send({ embeds: [profileEmbed] }).catch(e => 
                            console.error("[AI Action Error] Failed to send profile:", e)
                        );
                    } else {
                        await message.channel.send(`❌ Couldn't find user "${actionArgs}" in this server.`).catch(e => 
                            console.error("[AI Action Error] Failed to send user not found msg:", e)
                        );
                    }
                } else {
                    console.warn("[AI Action Warn] SHOW_PROFILE without args.");
                }
                break;
                
            case 'SHOW_JOIN_DATE':
                if (actionArgs) {
                    let targetMember;
                    
                    if (actionArgs.toLowerCase() === 'me' || actionArgs === '') {
                        targetMember = message.member;
                    } else {
                        targetMember = await findUserAnyMethod(message.guild, actionArgs);
                    }
                    
                    if (targetMember) {
                        const joinDate = targetMember.joinedAt;
                        const joinEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle(`📅 Join Date: ${targetMember.displayName}`)
                            .setDescription(`**${targetMember.displayName}** joined this server on:\n**${joinDate.toDateString()}**\n*${joinDate.toLocaleTimeString()}*`)
                            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
                            .setFooter({ text: `User ID: ${targetMember.user.id}` })
                            .setTimestamp();
                            
                        await message.channel.send({ embeds: [joinEmbed] }).catch(e => 
                            console.error("[AI Action Error] Failed to send join date:", e)
                        );
                    } else {
                        await message.channel.send(`❌ Couldn't find user "${actionArgs}" in this server.`).catch(e => 
                            console.error("[AI Action Error] Failed to send user not found msg:", e)
                        );
                    }
                }
                break;

            case 'SHOW_AVATAR':
                if (actionArgs) {
                    let targetMember;
                    
                    if (actionArgs.toLowerCase() === 'me' || actionArgs === '') {
                        targetMember = message.member;
                    } else {
                        targetMember = await findUserAnyMethod(message.guild, actionArgs);
                    }
                    
                    if (targetMember) {
                        const avatarEmbed = new EmbedBuilder()
                            .setColor(0x0099FF)
                            .setTitle(`🖼️ ${targetMember.displayName}'s Avatar`)
                            .setImage(targetMember.user.displayAvatarURL({ size: 4096, dynamic: true }))
                            .setDescription(`[Avatar URL](${targetMember.user.displayAvatarURL({ size: 4096, dynamic: true })})`)
                            .setFooter({ text: `Requested by ${message.author.tag}` })
                            .setTimestamp();
                            
                        await message.channel.send({ embeds: [avatarEmbed] });
                    } else {
                        await message.channel.send(`❌ Couldn't find user "${actionArgs}" in this server.`);
                    }
                }
                break;

            case 'SHOW_GLOBAL_AVATAR':
                if (actionArgs) {
                    const userId = actionArgs.replace(/[<@!>]/g, '');
                    const globalUser = await findUserGlobally(message.client, userId);
                    
                    if (globalUser) {
                        const avatarEmbed = new EmbedBuilder()
                            .setColor(0x9932CC)
                            .setTitle(`🌐 ${globalUser.tag}'s Avatar`)
                            .setImage(globalUser.displayAvatarURL({ size: 4096, dynamic: true }))
                            .setDescription(`[Avatar URL](${globalUser.displayAvatarURL({ size: 4096, dynamic: true })})`)
                            .setFooter({ text: `Global User ID: ${globalUser.id}` })
                            .setTimestamp();
                            
                        await message.channel.send({ embeds: [avatarEmbed] });
                    } else {
                        await message.channel.send(`❌ Couldn't find user with ID "${userId}".`);
                    }
                }
                break;

            case 'SEND_DM':
                if (actionArgs) {
                    const [userArg, ...dmMessageParts] = actionArgs.split(' ');
                    const dmMessage = dmMessageParts.join(' ');
                    
                    let targetMember;
                    
                    if (userArg.toLowerCase() === 'me') {
                        targetMember = message.member;
                    } else {
                        targetMember = await findUserAnyMethod(message.guild, userArg);
                    }
                    
                    if (targetMember && dmMessage) {
                        try {
                            await targetMember.send(`📨 **DM from ${message.author.tag} via Blecky:**\n${dmMessage}`);
                            await message.channel.send(`✅ Successfully sent DM to ${targetMember.displayName}`);
                        } catch (dmError) {
                            await message.channel.send(`❌ Could not send DM to ${targetMember.displayName}. They might have DMs disabled.`);
                        }
                    } else {
                        await message.channel.send(`❌ Usage: [ACTION:SEND_DM username message]`);
                    }
                }
                break;

            case 'SERVER_STATS':
                const members = await message.guild.members.fetch();
                const onlineMembers = members.filter(m => m.presence?.status === 'online').size;
                const totalMembers = message.guild.memberCount;
                const boostCount = message.guild.premiumSubscriptionCount || 0;
                
                const statsEmbed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle(`📊 ${message.guild.name} Server Stats`)
                    .setThumbnail(message.guild.iconURL({ dynamic: true }))
                    .addFields(
                        { name: '👥 Total Members', value: `**${totalMembers}**`, inline: true },
                        { name: '🟢 Online Now', value: `**${onlineMembers}**`, inline: true },
                        { name: '🚀 Server Boosts', value: `**${boostCount}**`, inline: true },
                        { name: '📅 Created', value: `<t:${Math.floor(message.guild.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: '👑 Owner', value: `<@${message.guild.ownerId}>`, inline: true },
                        { name: '📝 Channels', value: `**${message.guild.channels.cache.size}**`, inline: true }
                    )
                    .setFooter({ text: `Server ID: ${message.guild.id}` })
                    .setTimestamp();
                    
                await message.channel.send({ embeds: [statsEmbed] });
                break;

            case 'SHOW_ROLES':
                if (actionArgs) {
                    let targetMember;
                    
                    if (actionArgs.toLowerCase() === 'me' || actionArgs === '') {
                        targetMember = message.member;
                    } else {
                        targetMember = await findUserAnyMethod(message.guild, actionArgs);
                    }
                    
                    if (targetMember) {
                        const roles = targetMember.roles.cache
                            .filter(role => role.id !== message.guild.id)
                            .sort((a, b) => b.position - a.position)
                            .map(role => role.toString());
                            
                        const rolesEmbed = new EmbedBuilder()
                            .setColor(targetMember.displayColor || 0x95A5A6)
                            .setTitle(`🎭 ${targetMember.displayName}'s Roles`)
                            .setDescription(roles.length > 0 ? roles.join(', ') : 'No roles')
                            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
                            .addFields(
                                { name: 'Total Roles', value: `**${roles.length}**`, inline: true },
                                { name: 'Highest Role', value: targetMember.roles.highest.toString(), inline: true }
                            )
                            .setFooter({ text: `User ID: ${targetMember.user.id}` })
                            .setTimestamp();
                            
                        await message.channel.send({ embeds: [rolesEmbed] });
                    } else {
                        await message.channel.send(`❌ Couldn't find user "${actionArgs}" in this server.`);
                    }
                }
                break;

            case 'RANDOM_FACT':
                const facts = [
                    "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly good to eat.",
                    "Octopuses have three hearts. Two pump blood through the gills, while the third pumps it through the rest of the body.",
                    "A day on Venus is longer than a year on Venus. It takes Venus 243 Earth days to rotate once, but only 225 Earth days to orbit the Sun.",
                    "Bananas are berries, but strawberries aren't. Botanically speaking, berries are defined by having seeds inside, which bananas do.",
                    "The shortest war in history was between Britain and Zanzibar in 1896. It lasted only 38 minutes.",
                    "There are more possible iterations of a game of chess than there are atoms in the known universe.",
                    "A group of flamingos is called a 'flamboyance'.",
                    "The Eiffel Tower can be 15 cm taller during the summer due to thermal expansion of the metal."
                ];
                const randomFact = facts[Math.floor(Math.random() * facts.length)];
                
                const factEmbed = new EmbedBuilder()
                    .setColor(0x00CED1)
                    .setTitle('💡 Random Fact')
                    .setDescription(randomFact)
                    .setFooter({ text: 'Powered by Blecky' })
                    .setTimestamp();
                    
                await message.channel.send({ embeds: [factEmbed] });
                break;

            case 'TELL_JOKE':
                const jokes = [
                    "Why don't scientists trust atoms? Because they make up everything!",
                    "Why did the scarecrow win an award? He was outstanding in his field!",
                    "Why don't skeletons fight each other? They don't have the guts!",
                    "What do you call a fake noodle? An impasta!",
                    "Why did the math book look so sad? Because it had too many problems!",
                    "What do you call a bear with no teeth? A gummy bear!",
                    "Why don't eggs tell jokes? They'd crack each other up!",
                    "What do you call a sleeping bull? A bulldozer!"
                ];
                const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
                
                const jokeEmbed = new EmbedBuilder()
                    .setColor(0xFF69B4)
                    .setTitle('😂 Random Joke')
                    .setDescription(randomJoke)
                    .setFooter({ text: 'Powered by Blecky' })
                    .setTimestamp();
                    
                await message.channel.send({ embeds: [jokeEmbed] });
                break;
                
            default:
                console.warn(`[AI Action Warn] Unsupported action type requested: ${actionType}`);
        }
     } catch (actionError) {
         console.error(`[AI Action Error] Failed to execute action ${actionType} with args "${actionArgs}":`, actionError);
     }
}
