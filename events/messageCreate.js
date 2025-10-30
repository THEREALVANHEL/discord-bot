// events/messageCreate.js (FIXED - AI Prompt Redundancy)
const { Events, EmbedBuilder, Collection, PermissionsBitField } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { findUserInGuild } = require('../utils/findUserInGuild');
const { searchGiphyGif } = require('../utils/searchGiphyGif');
const { getNextLevelXp } = require('../utils/levelUtils');
const { generateUserLevel } = require('../utils/levelSystem');
const { XP_COOLDOWN, generateXP } = require('../utils/xpSystem');

// --- AI Configuration ---
const AI_MODEL_NAME = 'gemini-1.5-flash-latest';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AI_TRIGGER_PREFIX = '?blecky';
const MAX_HISTORY = 5;
const AI_COOLDOWN_MS = 3000;

// --- Prefix Command Configuration ---
const PREFIX = '?';

// --- Initialize Gemini ---
let genAI;
let model;
if (GEMINI_API_KEY) {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: AI_MODEL_NAME });
        console.log(`[AI Init] Initialized Gemini AI model: ${AI_MODEL_NAME}`);
    } catch (error) {
        console.error("[AI Init] Failed to initialize Gemini AI:", error.message);
    }
} else {
    console.warn("[AI Init] GEMINI_API_KEY not found. AI features will be disabled.");
}

// --- AI FIX: REMOVED {{CONVERSATION_HISTORY}} placeholder ---
// The history is now *only* passed via the .startChat({ history: ... }) method.
const SYSTEM_INSTRUCTION = `You are Blecky Nephew, an advanced AI integrated into a Discord server... [Your existing detailed instructions remain here] ...
User Data Provided: {{USER_DATA}}
---
User's Current Message: {{USER_MESSAGE}}
---
Your Response:`;
// --- END AI FIX ---

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

        const settings = await Settings.findOne({ guildId: message.guild.id });
        const noXpChannels = settings?.noXpChannels || [];
        const lowerContent = message.content.toLowerCase();

        // --- XP Gain Logic ---
        if (!noXpChannels.includes(message.channel.id) && !message.content.startsWith(PREFIX) && !lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
            const userXPCooldown = message.client.xpCooldowns.get(message.author.id);
            const now = Date.now();

            if (!userXPCooldown || now > userXPCooldown) {
                message.client.xpCooldowns.set(message.author.id, now + XP_COOLDOWN);
                let user = await User.findOne({ userId: message.author.id });
                if (!user) user = new User({ userId: message.author.id });
                
                const xpGained = generateXP();
                user.xp += xpGained;
                
                // --- LEVEL UP LOGIC ---
                // generateUserLevel updates user.level and user.xp by reference
                const leveledUp = generateUserLevel(user); 
                
                if (leveledUp) {
                    const levelUpChannelId = settings?.levelUpChannelId;
                     let notifyChannel = message.channel;
                     if (levelUpChannelId) {
                         const foundChannel = message.guild.channels.cache.get(levelUpChannelId);
                         if (foundChannel) notifyChannel = foundChannel;
                     }
                     const levelUpEmbed = new EmbedBuilder().setTitle('🚀 Level UP!').setDescription(`${message.author}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`).setThumbnail(message.author.displayAvatarURL({ dynamic: true })).setColor(0xFFD700).setTimestamp();
                     notifyChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] }).catch(console.error);
                     
                     // --- LEVEL ROLE ASSIGNMENT ---
                     const member = message.member;
                     if (member) {
                        // Use the config from index.js
                        const levelingRoles = message.client.config.levelingRoles || []; 
                        
                        // Find the single highest eligible role
                        const targetLevelRole = levelingRoles
                            .filter(r => r.level <= user.level)
                            .sort((a, b) => b.level - a.level)[0];
                        
                        const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;
                        
                        // Loop to add the correct role and remove incorrect ones
                        for (const roleConfig of levelingRoles) {
                           const roleId = roleConfig.roleId; 
                           const hasRole = member.roles.cache.has(roleId);
                           
                           if (roleId === targetLevelRoleId) { 
                               if (!hasRole) await member.roles.add(roleId).catch(() => {}); 
                           }
                           else { 
                               if (hasRole) await member.roles.remove(roleId).catch(() => {}); 
                           }
                        }
                     }
                     // --- END LEVEL ROLE ASSIGNMENT ---
                }
                // --- END LEVEL UP LOGIC ---
                
                await user.save();
            }
        }
        // --- End XP Gain Logic ---

        // --- LOGGING: Log Attachments/Links ---
        if (settings && settings.autologChannelId && !message.content.startsWith(PREFIX) && !lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
            if (message.attachments.size > 0 || message.content.includes('http://') || message.content.includes('https://')) {
                const logChannel = message.guild.channels.cache.get(settings.autologChannelId);
                if (logChannel) {
                    let logDescription = `**Message Content:**\n${message.content || '*(No text content)*'}`;
                    if (message.attachments.size > 0) {
                        logDescription += `\n\n**Attachments:**\n${message.attachments.map(a => `[${a.name}](${a.url})`).join('\n')}`;
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
        // --- END LOGGING ---


        // --- AI Trigger Logic (?blecky) ---
        if (model && lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
            console.log(`[AI Trigger] Detected trigger from ${message.author.tag}`);
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
            aiCooldowns.set(message.author.id, nowAI + AI_COOLDOWN_MS);

            const userPrompt = message.content.substring(AI_TRIGGER_PREFIX.length).trim();
            if (!userPrompt) {
                 console.log(`[AI Trigger] Empty prompt from ${message.author.tag}, replying with greeting.`);
                 aiCooldowns.delete(message.author.id);
                 return message.reply("Yes? How can I assist you?").catch(console.error);
            }

            console.log(`[AI Trigger] Processing prompt: "${userPrompt}"`);
            try {
                await message.channel.sendTyping();
                let userDataContext = "No specific data.";
                let userDB = await User.findOne({ userId: message.author.id });
                if (userDB) {
                     const jobTitle = userDB.currentJob ? (message.client.config?.workProgression?.find(j => j.id === userDB.currentJob)?.title || 'Unk Job') : 'Unemployed';
                     userDataContext = `Lvl ${userDB.level}|${userDB.coins} Coins|${userDB.cookies} Cookies|${userDB.warnings.length} Warns|Job:${jobTitle}`;
                }

                const userId = message.author.id;
                let userHistory = conversationHistory.get(userId) || [];
                userHistory.push({ role: 'user', parts: [{ text: userPrompt }] });
                if (userHistory.length > MAX_HISTORY * 2) userHistory = userHistory.slice(-(MAX_HISTORY * 2));
                
                // --- AI FIX: Build the prompt WITHOUT the conversation history string ---
                const finalSystemInstruction = SYSTEM_INSTRUCTION
                    .replace('{{USER_DATA}}', `${message.author.tag}(${userDataContext})`)
                    .replace('{{USER_MESSAGE}}', userPrompt);
                // --- END AI FIX ---

                 console.log(`[AI Call] Sending request for ${message.author.tag}...`);
                 
                 // Pass the history ONLY to startChat
                 const chat = model.startChat({ history: userHistory.slice(0, -1) }); 
                 // Send only the new system instruction + prompt
                 const result = await chat.sendMessage(finalSystemInstruction); 
                 
                 const response = result.response;
                 let aiTextResult = response?.text();
                 console.log(`[AI Call] Received response for ${message.author.tag}. Success: ${!!aiTextResult}`);


                if (!aiTextResult) {
                    console.warn("[AI Error] Gemini returned empty response or block.", response?.promptFeedback || 'No feedback');
                    aiTextResult = "I'm having trouble formulating a response right now. Could you try rephrasing?";
                    if (response?.promptFeedback?.blockReason) aiTextResult += ` (Reason: ${response.promptFeedback.blockReason})`;
                }

                let aiTextResponseForUser = aiTextResult;
                const actionsToPerform = [];
                const actionRegex = /\[ACTION:([A-Z_]+)\s*(.*?)\]$/i;
                const match = aiTextResult.match(actionRegex);
                if (match) {
                    actionsToPerform.push({ type: match[1].toUpperCase(), args: match[2]?.trim() });
                    aiTextResponseForUser = aiTextResult.replace(match[0], '').trim();
                }

                 // Add the model's response to the history
                 userHistory.push({ role: 'model', parts: [{ text: aiTextResponseForUser || '(Action)' }] });
                 conversationHistory.set(userId, userHistory);

                 console.log(`[AI Respond] Sending text response (if any) for ${message.author.tag}`);
                if (aiTextResponseForUser) {
                    await message.reply(aiTextResponseForUser.substring(0, 2000)).catch(console.error);
                } else if (actionsToPerform.length === 0) {
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
                    if (error.code !== 50013) {
                        await message.reply("⚠️ Oops! Something went wrong with my AI core.").catch(console.error);
                    } else {
                        console.error(`[AI Error] Missing permissions to reply in channel ${message.channel.id}`);
                    }
                 } catch (replyError) {
                    console.error("[AI Error] Failed to send error reply:", replyError);
                 }
            }
            return;
        }
        // --- End AI Trigger Logic ---


        // --- Prefix Command Handling ---
        if (!message.content.startsWith(PREFIX)) return;

        console.log(`[Prefix Cmd] Detected prefix from ${message.author.tag}: ${message.content}`);

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = message.client.commands.get(commandName);

        if (!command) {
            console.log(`[Prefix Cmd] Command not found: ${commandName}`);
            return;
        }


        // --- TICKET ALIAS FIX ---
        if (command.name === 'ticket') { // Catches 'ticket' and 'closeticket'
             
             if (args[0]?.toLowerCase() === 'setup') {
                 console.log(`[Prefix Cmd] Ignoring 'ticket setup' prefix command.`);
                 return message.reply('❌ The `ticket setup` command is only available as a slash command (`/ticket setup`).');
             }

             if (commandName === 'ticket' && args[0]?.toLowerCase() !== 'close') {
                 console.log(`[Prefix Cmd] Ignoring 'ticket' prefix command without 'close' arg.`);
                 return message.reply('Did you mean `?ticket close` or `?closeticket`? Setup is slash-only (`/ticket setup`).').catch(console.error);
             }

             if (commandName === 'ticket' && args[0]?.toLowerCase() === 'close') {
                 args.shift(); // Remove 'close' from args
             }
        }
        // --- END TICKET ALIAS FIX ---


        // Check if it's a slash-only command
        if (command.data && typeof command.data.toJSON === 'function') {
            if (command.name !== 'ticket') {
                console.log(`[Prefix Cmd] Ignoring slash command file invoked via prefix: ${commandName}`);
                return message.reply(`The command \`${commandName}\` is only available as a slash command (e.g., \`/${commandName}\`).`).catch(console.error);
            }
        }
        // Check if it's a valid prefix command (handles non-hybrid slash commands)
        else if (!command.name || !command.execute || command.data) {
             console.warn(`[Prefix Cmd] Command file '${commandName}' is invalid.`);
             return;
        }


        // Cooldown Check
         if (!message.client.cooldowns.has(command.name)) {
            message.client.cooldowns.set(command.name, new Collection());
         }
         const nowCmd = Date.now();
         const timestamps = message.client.cooldowns.get(command.name);
         const cooldownAmount = (command.cooldown || 3) * 1000;

         if (timestamps.has(message.author.id)) {
            const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
            if (nowCmd < expirationTime) {
                const timeLeft = (expirationTime - nowCmd) / 1000;
                console.log(`[Prefix Cmd] User ${message.author.tag} on cooldown for ${command.name}`);
                return message.reply(`⏱️ Please wait ${timeLeft.toFixed(1)}s before reusing \`${command.name}\`.`).catch(console.error);
            }
         }
         timestamps.set(message.author.id, nowCmd);
         setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

        // Execute Prefix Command
        try {
             console.log(`[Prefix Cmd] Executing command '${command.name}' (triggered by '${commandName}') for ${message.author.tag}`);
            await command.execute(message, args, message.client);
        } catch (error) {
            console.error(`[Prefix Cmd Error] Error executing ${command.name}:`, error);
            message.reply('❌ Error executing command!').catch(console.error);
        }
    },
};


// --- Helper: Perform Specific Bot Actions ---
async function performAction(message, actionType, actionArgs) {
     console.log(`[AI Action] Performing action: ${actionType}, Args: ${actionArgs}`);
     switch (actionType) {
        case 'SEND_GIF':
            if (actionArgs) {
                const gifUrl = await searchGiphyGif(actionArgs);
                const DEFAULT_GIF = 'https://media.giphy.com/media/l4pTsh45Dg7ClzJny/giphy.gif';
                if (gifUrl && gifUrl !== DEFAULT_GIF) {
                    await message.channel.send(gifUrl).catch(e => console.error("[AI Action Error] Failed to send GIF:", e));
                } else { console.log(`[AI Action] GIF not found for "${actionArgs}"`); }
            } else { console.warn("[AI Action Warn] SEND_GIF without args."); }
            break;
        case 'SHOW_PROFILE':
            if (actionArgs) {
                 const targetMember = await findUserInGuild(message.guild, actionArgs);
                 if (targetMember) {
                     const targetUserId = targetMember.user.id;
                     const targetData = await User.findOne({ userId: targetUserId });
                     const profileEmbed = new EmbedBuilder().setColor(0x00BFFF);
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
                     } else { profileEmbed.setTitle(`📊 ${displayName}`).setDescription("No data."); }
                     await message.channel.send({ embeds: [profileEmbed] }).catch(e => console.error("[AI Action Error] Failed to send profile:", e));
                 } else { await message.channel.send(`Couldn't find user "${actionArgs}".`).catch(e => console.error("[AI Action Error] Failed to send user not found msg:", e)); }
            } else { console.warn("[AI Action Warn] SHOW_PROFILE without args."); }
            break;
        default:
            console.warn(`[AI Action Warn] Unsupported action: ${actionType}`);
    }
}
