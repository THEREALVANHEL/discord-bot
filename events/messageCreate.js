// events/messageCreate.js (No changes needed, your logging is already correct)
const { Events, EmbedBuilder, Collection, PermissionsBitField } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch'); // Required for Giphy/Gemini
const User = require('../models/User'); // Import User model
const Settings = require('../models/Settings'); // Import Settings model
const { findUserInGuild } = require('../utils/findUserInGuild'); // Utility to find users
const { searchGiphyGif } = require('../utils/searchGiphyGif'); // Import Giphy search
const { getNextLevelXp } = require('../utils/levelUtils'); // Import XP calculation from your level utils
const { generateUserLevel } = require('../utils/levelSystem'); // Import level up check
const { XP_COOLDOWN, generateXP } = require('../utils/xpSystem'); // Import XP settings

// --- AI Configuration ---
const AI_MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AI_TRIGGER_PREFIX = '?blecky'; // AI Prefix
const MAX_HISTORY = 5;
const AI_COOLDOWN_MS = 3000;

// --- Prefix Command Configuration ---
const PREFIX = '?'; // Bot's command prefix

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

// System instructions (keep your existing one)
const SYSTEM_INSTRUCTION = `You are Blecky Nephew, an advanced AI integrated into a Discord server... [Your existing detailed instructions remain here] ...
User Data Provided: {{USER_DATA}}
---
User's Current Message: {{USER_MESSAGE}}
---
Your Response:`;

const conversationHistory = new Map();
const aiCooldowns = new Map();

// --- Message Handler ---
module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Basic checks
        if (message.author.bot || !message.guild) {
             // console.log("[MsgCreate] Ignored: Bot message or DM."); // Debug Log
            return;
        }
        if (!message.content || typeof message.content !== 'string') {
             // console.log("[MsgCreate] Ignored: No message content."); // Debug Log
             return;
        }

        const settings = await Settings.findOne({ guildId: message.guild.id });
        const noXpChannels = settings?.noXpChannels || [];
        const lowerContent = message.content.toLowerCase(); // Lowercase once

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
                const leveledUp = generateUserLevel(user);
                if (leveledUp) {
                    // (Keep your existing level up notification & role logic here)
                    const levelUpChannelId = settings?.levelUpChannelId;
                     let notifyChannel = message.channel;
                     if (levelUpChannelId) {
                         const foundChannel = message.guild.channels.cache.get(levelUpChannelId);
                         if (foundChannel) notifyChannel = foundChannel;
                     }
                     const levelUpEmbed = new EmbedBuilder().setTitle('🚀 Level UP!').setDescription(`${message.author}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`).setThumbnail(message.author.displayAvatarURL({ dynamic: true })).setColor(0xFFD700).setTimestamp();
                     notifyChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] }).catch(console.error);
                     const member = message.member;
                     if (member) {
                        const levelingRoles = message.client.config.levelingRoles || [];
                        const targetLevelRole = levelingRoles.filter(r => r.level <= user.level).sort((a, b) => b.level - a.level)[0];
                        const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;
                        for (const roleConfig of levelingRoles) {
                           const roleId = roleConfig.roleId; const hasRole = member.roles.cache.has(roleId);
                           if (roleId === targetLevelRoleId) { if (!hasRole) await member.roles.add(roleId).catch(() => {}); }
                           else { if (hasRole) await member.roles.remove(roleId).catch(() => {}); }
                        }
                     }
                }
                await user.save();
            }
        }
        // --- End XP Gain Logic ---

        // --- AI Trigger Logic (?blecky) ---
        if (model && lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
            console.log(`[AI Trigger] Detected trigger from ${message.author.tag}`); // Debug Log
            const nowAI = Date.now();
            const userAICooldown = aiCooldowns.get(message.author.id);
            if (userAICooldown && nowAI < userAICooldown) {
                console.log(`[AI Cooldown] User ${message.author.tag} is on cooldown.`); // Debug Log
                // ADDED COOLDOWN MESSAGE
                const timeLeft = ((userAICooldown - nowAI) / 1000).toFixed(1);
                 message.reply(`⏱️ Blecky needs a moment to recharge! Try again in ${timeLeft}s.`).then(msg => {
                     setTimeout(() => msg.delete().catch(console.error), AI_COOLDOWN_MS); // Delete cooldown message after cooldown duration
                 }).catch(console.error);
                return;
            }
            aiCooldowns.set(message.author.id, nowAI + AI_COOLDOWN_MS);

            const userPrompt = message.content.substring(AI_TRIGGER_PREFIX.length).trim();
            if (!userPrompt) {
                 console.log(`[AI Trigger] Empty prompt from ${message.author.tag}, replying with greeting.`); // Debug Log
                 aiCooldowns.delete(message.author.id); // Reset cooldown
                 return message.reply("Yes? How can I assist you?").catch(console.error);
            }

            console.log(`[AI Trigger] Processing prompt: "${userPrompt}"`); // Debug Log
            try {
                await message.channel.sendTyping();
                // Fetch User Data
                let userDataContext = "No specific data.";
                let userDB = await User.findOne({ userId: message.author.id });
                if (userDB) {
                     const jobTitle = userDB.currentJob ? (message.client.config?.workProgression?.find(j => j.id === userDB.currentJob)?.title || 'Unk Job') : 'Unemployed';
                     userDataContext = `Lvl ${userDB.level}|${userDB.coins} Coins|${userDB.cookies} Cookies|${userDB.warnings.length} Warns|Job:${jobTitle}`;
                }

                // Manage History
                const userId = message.author.id;
                let userHistory = conversationHistory.get(userId) || [];
                userHistory.push({ role: 'user', parts: [{ text: userPrompt }] });
                if (userHistory.length > MAX_HISTORY * 2) userHistory = userHistory.slice(-(MAX_HISTORY * 2));
                conversationHistory.set(userId, userHistory);
                const historyString = userHistory.map(h => `${h.role === 'user' ? 'U' : 'B'}: ${h.parts[0].text}`).join('\n'); // Shortened roles

                // Prepare Prompt
                const finalSystemInstruction = SYSTEM_INSTRUCTION
                    .replace('{{USER_DATA}}', `${message.author.tag}(${userDataContext})`)
                    .replace('{{CONVERSATION_HISTORY}}', historyString || "None.")
                    .replace('{{USER_MESSAGE}}', userPrompt);

                // Call AI
                 console.log(`[AI Call] Sending request for ${message.author.tag}...`); // Debug Log
                 const chat = model.startChat({ history: userHistory.slice(0, -1) });
                 const result = await chat.sendMessage(finalSystemInstruction);
                 const response = result.response;
                 let aiTextResult = response?.text(); // Use optional chaining
                 console.log(`[AI Call] Received response for ${message.author.tag}. Success: ${!!aiTextResult}`); // Debug Log


                if (!aiTextResult) {
                    console.warn("[AI Error] Gemini returned empty response or block.", response?.promptFeedback || 'No feedback');
                    aiTextResult = "I'm having trouble formulating a response right now. Could you try rephrasing?";
                    if (response?.promptFeedback?.blockReason) aiTextResult += ` (Reason: ${response.promptFeedback.blockReason})`;
                }

                // Parse Actions
                let aiTextResponseForUser = aiTextResult;
                const actionsToPerform = [];
                const actionRegex = /\[ACTION:([A-Z_]+)\s*(.*?)\]$/i;
                const match = aiTextResult.match(actionRegex);
                if (match) {
                    actionsToPerform.push({ type: match[1].toUpperCase(), args: match[2]?.trim() });
                    aiTextResponseForUser = aiTextResult.replace(match[0], '').trim();
                }

                // Add AI response to history
                 userHistory.push({ role: 'model', parts: [{ text: aiTextResponseForUser || '(Action)' }] });
                 conversationHistory.set(userId, userHistory);

                // Send Response
                 console.log(`[AI Respond] Sending text response (if any) for ${message.author.tag}`); // Debug Log
                if (aiTextResponseForUser) {
                    await message.reply(aiTextResponseForUser.substring(0, 2000)).catch(console.error);
                } else if (actionsToPerform.length === 0) {
                     await message.reply("Okay.").catch(console.error);
                }

                // Execute Actions
                 console.log(`[AI Respond] Executing ${actionsToPerform.length} actions for ${message.author.tag}`); // Debug Log
                for (const action of actionsToPerform) {
                    await performAction(message, action.type, action.args);
                }

            } catch (error) {
                console.error("[AI Error] Error during AI processing:", error); // <-- THIS IS THE IMPORTANT LINE
                 aiCooldowns.delete(message.author.id); // Clear cooldown on error
                 try { // Try to reply with error
                    if (error.code !== 50013) { // Avoid replying on permission errors
                        await message.reply("⚠️ Oops! Something went wrong with my AI core.").catch(console.error);
                    } else {
                        console.error(`[AI Error] Missing permissions to reply in channel ${message.channel.id}`);
                    }
                 } catch (replyError) {
                    console.error("[AI Error] Failed to send error reply:", replyError);
                 }
            }
            return; // Stop processing after AI handling
        }
        // --- End AI Trigger Logic ---


        // --- Prefix Command Handling ---
        if (!message.content.startsWith(PREFIX)) return; // Not a prefix command

        console.log(`[Prefix Cmd] Detected prefix from ${message.author.tag}: ${message.content}`); // Debug Log

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = message.client.commands.get(commandName);
        // Note: Aliases are handled directly by client.commands.get if set up correctly in index.js

        if (!command) {
            console.log(`[Prefix Cmd] Command not found: ${commandName}`); // Debug Log
            return; // Unknown command
        }

        // Check if it's accidentally trying to run a slash command file via prefix
        if (command.data && typeof command.data.toJSON === 'function') {
            console.log(`[Prefix Cmd] Ignoring slash command file invoked via prefix: ${commandName}`); // Debug Log
            return message.reply(`The command \`${commandName}\` is only available as a slash command (e.g., \`/${commandName}\`).`).catch(console.error);
        }
        // Check if it's a prefix command file (has name and execute, no data)
        else if (!command.name || !command.execute || command.data) {
             console.warn(`[Prefix Cmd] Command file '${commandName}' is invalid.`); // Debug Log
             return; // Invalid command file structure
        }


        // Handle 'ticket close' specifically
        if (command.name === 'ticket' && args[0]?.toLowerCase() !== 'close') {
             console.log(`[Prefix Cmd] Ignoring 'ticket' prefix command without 'close' arg.`); // Debug Log
             if (args[0]?.toLowerCase() === 'setup') {
                return message.reply('❌ The `ticket setup` command is only available as a slash command (`/ticket setup`).');
             }
             return; // Ignore other 'ticket' args via prefix
        }
        if (command.name === 'ticket' && args[0]?.toLowerCase() === 'close') {
            args.shift(); // Remove 'close' arg
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
                console.log(`[Prefix Cmd] User ${message.author.tag} on cooldown for ${command.name}`); // Debug Log
                return message.reply(`⏱️ Please wait ${timeLeft.toFixed(1)}s before reusing \`${command.name}\`.`).catch(console.error);
            }
         }
         timestamps.set(message.author.id, nowCmd);
         setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

        // Execute Prefix Command
        try {
             console.log(`[Prefix Cmd] Executing command '${command.name}' for ${message.author.tag}`); // Debug Log
            await command.execute(message, args, message.client);
        } catch (error) {
            console.error(`[Prefix Cmd Error] Error executing ${command.name}:`, error);
            message.reply('❌ Error executing command!').catch(console.error);
        }
        // --- End Prefix Command Handling ---
    },
};


// --- Helper: Perform Specific Bot Actions (Keep your existing function) ---
async function performAction(message, actionType, actionArgs) {
     console.log(`[AI Action] Performing action: ${actionType}, Args: ${actionArgs}`); // Debug Log
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
