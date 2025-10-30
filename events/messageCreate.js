// events/messageCreate.js (FIXED - AI Prompt Redundancy, Switched to gemini-pro for testing)
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
// FIXED: Changed model name for testing based on 404 error
const AI_MODEL_NAME = 'gemini-pro'; // Was 'gemini-1.5-flash-latest'
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
        model = null; // Ensure model is null if init fails
    }
} else {
    console.warn("[AI Init] GEMINI_API_KEY not found. AI features will be disabled.");
    model = null;
}

// System instruction (History placeholder removed)
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
            // Optionally reply if critical features depend on settings
            // message.reply("Error fetching server configuration.").catch(console.error);
            return; // Exit early if settings are crucial and failed to load
        }
        const noXpChannels = settings?.noXpChannels || [];
        const lowerContent = message.content.toLowerCase();

        // --- XP Gain Logic ---
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

                     // --- LEVEL UP LOGIC ---
                     const leveledUp = generateUserLevel(user);

                     if (leveledUp) {
                         const levelUpChannelId = settings?.levelUpChannelId;
                          let notifyChannel = message.channel;
                          if (levelUpChannelId) {
                              const foundChannel = message.guild.channels.cache.get(levelUpChannelId);
                              if (foundChannel && foundChannel.isTextBased()) notifyChannel = foundChannel; // Check if text-based
                          }
                          const levelUpEmbed = new EmbedBuilder().setTitle('🚀 Level UP!').setDescription(`${message.author}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`).setThumbnail(message.author.displayAvatarURL({ dynamic: true })).setColor(0xFFD700).setTimestamp();
                          notifyChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] }).catch(console.error);

                          // --- LEVEL ROLE ASSIGNMENT ---
                          const member = message.member;
                          if (member) {
                             const levelingRoles = message.client.config.levelingRoles || [];

                             const targetLevelRole = levelingRoles
                                 .filter(r => r.level <= user.level)
                                 .sort((a, b) => b.level - a.level)[0];

                             const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;

                             for (const roleConfig of levelingRoles) {
                                const roleId = roleConfig.roleId;
                                if (!roleId) continue; // Skip if role ID is missing

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
                          // --- END LEVEL ROLE ASSIGNMENT ---
                     }
                     // --- END LEVEL UP LOGIC ---

                     await user.save();
                } catch (dbError) {
                    console.error("Error processing XP gain:", dbError);
                }
            }
        }
        // --- End XP Gain Logic ---

        // --- LOGGING: Log Attachments/Links ---
        if (settings && settings.autologChannelId && !message.content.startsWith(PREFIX) && !lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
            if (message.attachments.size > 0 || message.content.includes('http://') || message.content.includes('https://')) {
                const logChannel = message.guild.channels.cache.get(settings.autologChannelId);
                if (logChannel && logChannel.isTextBased()) { // Check if text-based
                    let logDescription = `**Message Content:**\n${message.content || '*(No text content)*'}`.substring(0, 4000); // Limit description length
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
        // --- END LOGGING ---


        // --- AI Trigger Logic (?blecky) ---
        // Check if the model was initialized successfully
        if (model && (lowerContent.startsWith(AI_TRIGGER_PREFIX) || message.channel.id === settings?.aiChannelId)) {
            // Determine the actual prompt (remove prefix if used, otherwise use full content in AI channel)
            let userPrompt;
             if (lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
                userPrompt = message.content.substring(AI_TRIGGER_PREFIX.length).trim();
                console.log(`[AI Trigger] Detected trigger prefix from ${message.author.tag}`);
             } else {
                 userPrompt = message.content.trim(); // Use full message in AI channel
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
             // Apply cooldown only if there's a prompt
             if (userPrompt) {
                aiCooldowns.set(message.author.id, nowAI + AI_COOLDOWN_MS);
             }


            if (!userPrompt) {
                 // Only send greeting if triggered by prefix, not just any message in AI channel
                 if (lowerContent.startsWith(AI_TRIGGER_PREFIX)) {
                     console.log(`[AI Trigger] Empty prefix prompt from ${message.author.tag}, replying with greeting.`);
                     aiCooldowns.delete(message.author.id); // Remove cooldown if no actual prompt
                     return message.reply("Yes? How can I assist you?").catch(console.error);
                 } else {
                     // Ignore empty messages in AI channel
                     console.log(`[AI Trigger] Ignoring empty message in AI channel from ${message.author.tag}.`);
                     return;
                 }
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
                // Add current prompt to history *before* sending to AI
                userHistory.push({ role: 'user', parts: [{ text: userPrompt }] });
                // Trim history if it exceeds the limit (MAX_HISTORY pairs)
                if (userHistory.length > MAX_HISTORY * 2) {
                     userHistory = userHistory.slice(-(MAX_HISTORY * 2));
                 }


                // Build the prompt string with current user data and message
                const finalSystemInstruction = SYSTEM_INSTRUCTION
                    .replace('{{USER_DATA}}', `${message.author.tag}(${userDataContext})`)
                    .replace('{{USER_MESSAGE}}', userPrompt);


                 console.log(`[AI Call] Sending request for ${message.author.tag}... Model: ${AI_MODEL_NAME}`);

                 // Start chat *with* previous history (excluding the current user message which is part of the final prompt string)
                 const chat = model.startChat({ history: userHistory.slice(0, -1) });
                 // Send the system instruction combined with the latest user message
                 const result = await chat.sendMessage(finalSystemInstruction);

                 const response = result.response;
                 let aiTextResult = response?.text();
                 console.log(`[AI Call] Received response for ${message.author.tag}. Success: ${!!aiTextResult}`);


                if (!aiTextResult) {
                    console.warn("[AI Error] Gemini returned empty response or block.", response?.promptFeedback || 'No feedback');
                    aiTextResult = "I'm having trouble formulating a response right now. Could you try rephrasing?";
                    if (response?.promptFeedback?.blockReason) aiTextResult += ` (Reason: ${response.promptFeedback.blockReason})`;
                    // Don't add problematic response to history
                } else {
                     // Add the successful model response to history
                     userHistory.push({ role: 'model', parts: [{ text: aiTextResult }] });
                     conversationHistory.set(userId, userHistory); // Update history
                }


                let aiTextResponseForUser = aiTextResult;
                const actionsToPerform = [];
                // Simple action parsing (adjust regex if needed)
                const actionRegex = /\[ACTION:([A-Z_]+)\s*(.*?)\]/gi; // Global flag to find all actions
                let match;
                 while ((match = actionRegex.exec(aiTextResult)) !== null) {
                    actionsToPerform.push({ type: match[1].toUpperCase(), args: match[2]?.trim() });
                    // Remove the action string from the user-facing response
                    aiTextResponseForUser = aiTextResponseForUser.replace(match[0], '').trim();
                 }


                 console.log(`[AI Respond] Sending text response (if any) for ${message.author.tag}`);
                if (aiTextResponseForUser) {
                    await message.reply(aiTextResponseForUser.substring(0, 2000)).catch(console.error);
                } else if (actionsToPerform.length === 0 && aiTextResult) { // Only reply "Okay." if there was a result but no text/action
                     await message.reply("Okay.").catch(console.error);
                }

                 console.log(`[AI Respond] Executing ${actionsToPerform.length} actions for ${message.author.tag}`);
                for (const action of actionsToPerform) {
                    await performAction(message, action.type, action.args);
                }

            } catch (error) {
                console.error("[AI Error] Error during AI processing:", error);
                 // Clear cooldown on error to allow retrying sooner
                 aiCooldowns.delete(message.author.id);
                 try {
                    // Avoid replying if missing permissions
                    if (error.code !== 50013 && message.channel.permissionsFor(message.guild.members.me)?.has(PermissionsBitField.Flags.SendMessages)) {
                         let errorMsg = "⚠️ Oops! Something went wrong with my AI core.";
                         // Add more details for specific Gemini errors if helpful
                         if (error.message && error.message.includes("404 Not Found")) {
                            errorMsg += ` (Model "${AI_MODEL_NAME}" might be unavailable.)`;
                         } else if (error.message) {
                             // Log the raw error message server-side but give generic to user
                             console.error("Underlying AI error:", error.message);
                         }
                        await message.reply(errorMsg).catch(console.error);
                    } else {
                        console.error(`[AI Error] Missing permissions to reply in channel ${message.channel.id} or other Discord API error.`);
                    }
                 } catch (replyError) {
                    console.error("[AI Error] Failed to send error reply:", replyError);
                 }
            }
            return; // Stop further processing if AI handled it
        }
        // --- End AI Trigger Logic ---


        // --- Prefix Command Handling ---
        if (!message.content.startsWith(PREFIX)) return;

        console.log(`[Prefix Cmd] Detected prefix from ${message.author.tag}: ${message.content}`);

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Find command by name or alias
        const command = message.client.commands.get(commandName);

        if (!command) {
            console.log(`[Prefix Cmd] Command not found: ${commandName}`);
            // Optional: Add a reply like message.reply("Unknown command.").catch(console.error);
            return;
        }


        // --- TICKET ALIAS/ARGUMENT FIX ---
        // Special handling ONLY if the matched command's primary name is 'ticket'
        if (command.name === 'ticket') {
             // Block 'setup' via prefix
             if (args[0]?.toLowerCase() === 'setup') {
                 console.log(`[Prefix Cmd] Ignoring 'ticket setup' prefix command.`);
                 return message.reply('❌ The `ticket setup` command is only available as a slash command (`/ticket setup`).').catch(console.error);
             }

             // If the user typed just '?ticket' or '?ticket something_else'
             if (commandName === 'ticket' && args[0]?.toLowerCase() !== 'close') {
                 console.log(`[Prefix Cmd] Ignoring 'ticket' prefix command without 'close' arg.`);
                 return message.reply('Did you mean `?ticket close`, `?close`, or `?closeticket`? Setup is slash-only (`/ticket setup`).').catch(console.error);
             }

             // If the user typed '?ticket close', remove 'close' from args before passing to execute
             if (commandName === 'ticket' && args[0]?.toLowerCase() === 'close') {
                 args.shift();
             }
             // Aliases '?close' and '?closeticket' will naturally have no 'close' in args here.
        }
        // --- END TICKET ALIAS/ARGUMENT FIX ---


        // Check if it's a slash-only command definition (has 'data' but no prefix 'name')
        // Allow ticket command to proceed as it's prefix-only now
        if (command.data && !command.name && command.data.name !== 'ticket') { // Check data.name to be safe
             console.log(`[Prefix Cmd] Ignoring slash command file invoked via prefix: ${commandName}`);
             return message.reply(`The command \`${commandName}\` is only available as a slash command (e.g., \`/${commandName}\`).`).catch(console.error);
        }
        // Check if it's NOT a valid prefix command (missing name or execute, OR it's slash-only)
         else if (!command.name || !command.execute) {
              // This condition might catch hybrid commands if they lack `.name`, but the loader should handle that.
              // It mainly ensures prefix-only commands have the required properties.
              console.warn(`[Prefix Cmd] Command file corresponding to '${commandName}' is invalid or slash-only.`);
              return;
         }


        // Cooldown Check
         if (!message.client.cooldowns.has(command.name)) {
            message.client.cooldowns.set(command.name, new Collection());
         }
         const nowCmd = Date.now();
         const timestamps = message.client.cooldowns.get(command.name);
         const cooldownAmount = (command.cooldown || 3) * 1000; // Use command-specific cooldown or default 3s

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
             // Pass message, args, client to the prefix command's execute function
            await command.execute(message, args, message.client);
        } catch (error) {
            console.error(`[Prefix Cmd Error] Error executing ${command.name}:`, error);
            message.reply('❌ An error occurred while executing that command!').catch(console.error);
        }
    },
};


// --- Helper: Perform Specific Bot Actions ---
async function performAction(message, actionType, actionArgs) {
     console.log(`[AI Action] Performing action: ${actionType}, Args: ${actionArgs}`);
     try { // Add try-catch around actions
        switch (actionType) {
            case 'SEND_GIF':
                if (actionArgs) {
                    const gifUrl = await searchGiphyGif(actionArgs);
                    if (gifUrl) { // Check if a URL was returned
                        await message.channel.send(gifUrl).catch(e => console.error("[AI Action Error] Failed to send GIF:", e));
                    } else {
                         console.log(`[AI Action] No valid GIF URL returned for "${actionArgs}"`);
                         // Optionally send a fallback message
                         // await message.channel.send(`Couldn't find a GIF for "${actionArgs}".`).catch(console.error);
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
