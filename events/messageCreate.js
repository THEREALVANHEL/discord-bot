// events/messageCreate.js (REPLACED - Handles Prefixes and ?blecky AI)
const { Events, EmbedBuilder, Collection, PermissionsBitField } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { findUserInGuild } = require('../utils/findUserInGuild');
const { searchGiphyGif } = require('../utils/searchGiphyGif');
const { getNextLevelXp } = require('../utils/levelUtils'); // <<<< ENSURE THIS LINE IS CORRECT
const { generateUserLevel } = require('../utils/levelSystem');
const { XP_COOLDOWN, generateXP } = require('../utils/xpSystem');

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
        console.log(`✅ Initialized Gemini AI model: ${AI_MODEL_NAME}`);
    } catch (error) {
        console.error("❌ Failed to initialize Gemini AI:", error.message);
    }
} else {
    console.warn("⚠️ GEMINI_API_KEY not found. AI features will be disabled.");
}

const SYSTEM_INSTRUCTION = `You are Blecky Nephew, an advanced AI integrated into a Discord server... [Your existing detailed instructions remain here] ...
User Data Provided: {{USER_DATA}}
---
User's Current Message: {{USER_MESSAGE}}
---
Your Response:`; // Keep your existing System Instruction

const conversationHistory = new Map();
const aiCooldowns = new Map();

// --- Message Handler ---
module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Basic checks
        if (message.author.bot || !message.guild) return;

        const settings = await Settings.findOne({ guildId: message.guild.id });
        const noXpChannels = settings?.noXpChannels || [];

        // --- XP Gain Logic (Moved from old messageCreate if applicable) ---
        if (!noXpChannels.includes(message.channel.id) && !message.content.startsWith(PREFIX) && !message.content.toLowerCase().startsWith(AI_TRIGGER_PREFIX)) {
            const userXPCooldown = message.client.xpCooldowns.get(message.author.id);
            const now = Date.now();

            if (!userXPCooldown || now > userXPCooldown) {
                message.client.xpCooldowns.set(message.author.id, now + XP_COOLDOWN); // Use XP_COOLDOWN from utils

                let user = await User.findOne({ userId: message.author.id });
                if (!user) {
                    user = new User({ userId: message.author.id });
                }

                const xpGained = generateXP(); // Use generateXP from utils
                user.xp += xpGained;

                const leveledUp = generateUserLevel(user); // Check level up

                if (leveledUp) {
                    // --- Level Up Notification & Role Handling ---
                    const levelUpChannelId = settings?.levelUpChannelId;
                    let notifyChannel = message.channel;
                    if (levelUpChannelId) {
                        const foundChannel = message.guild.channels.cache.get(levelUpChannelId);
                        if (foundChannel) notifyChannel = foundChannel;
                    }

                    const levelUpEmbed = new EmbedBuilder()
                        .setTitle('🚀 Level UP!')
                        .setDescription(`${message.author}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
                        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                        .setColor(0xFFD700)
                        .setTimestamp();
                    notifyChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] }).catch(console.error);

                    // --- Role Assignment Logic ---
                    const member = message.member;
                    if (member) {
                        const levelingRoles = message.client.config.levelingRoles || [];
                         const targetLevelRole = levelingRoles
                            .filter(r => r.level <= user.level)
                            .sort((a, b) => b.level - a.level)[0];
                         const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;

                         for (const roleConfig of levelingRoles) {
                            const roleId = roleConfig.roleId;
                            const hasRole = member.roles.cache.has(roleId);
                            if (roleId === targetLevelRoleId) {
                                if (!hasRole) await member.roles.add(roleId).catch(() => {});
                            } else {
                                if (hasRole) await member.roles.remove(roleId).catch(() => {});
                            }
                        }
                    }
                    // --- End Role Assignment ---
                }
                await user.save();
            }
        }
        // --- End XP Gain Logic ---


        // --- AI Trigger Logic (?blecky) ---
        if (model && message.content.toLowerCase().startsWith(AI_TRIGGER_PREFIX)) {
            const nowAI = Date.now();
            const userAICooldown = aiCooldowns.get(message.author.id);
            if (userAICooldown && nowAI < userAICooldown) {
                return; // AI Cooldown
            }
            aiCooldowns.set(message.author.id, nowAI + AI_COOLDOWN_MS);

            const userPrompt = message.content.substring(AI_TRIGGER_PREFIX.length).trim();
            if (!userPrompt) {
                 aiCooldowns.delete(message.author.id); // Reset cooldown
                 return message.reply("Yes? How can I assist you?").catch(console.error);
            }

            try {
                await message.channel.sendTyping();
                // Fetch User Data
                let userDataContext = "No specific data available.";
                let userDB = await User.findOne({ userId: message.author.id });
                if (userDB) {
                     const jobTitle = userDB.currentJob ? (message.client.config?.workProgression?.find(j => j.id === userDB.currentJob)?.title || 'Unknown Job') : 'Unemployed';
                     userDataContext = `Level ${userDB.level} | ${userDB.coins} Coins | ${userDB.cookies} Cookies | ${userDB.warnings.length} Warnings | Job: ${jobTitle}`;
                }

                // Manage History
                const userId = message.author.id;
                let userHistory = conversationHistory.get(userId) || [];
                userHistory.push({ role: 'user', parts: [{ text: userPrompt }] });
                if (userHistory.length > MAX_HISTORY * 2) {
                    userHistory = userHistory.slice(-(MAX_HISTORY * 2));
                }
                conversationHistory.set(userId, userHistory);
                const historyString = userHistory.map(h => `${h.role === 'user' ? 'User' : 'Blecky'}: ${h.parts[0].text}`).join('\n');

                // Prepare Prompt
                const finalSystemInstruction = SYSTEM_INSTRUCTION
                    .replace('{{USER_DATA}}', `User: ${message.author.tag} (${userDataContext})`)
                    .replace('{{CONVERSATION_HISTORY}}', historyString || "No previous messages.")
                    .replace('{{USER_MESSAGE}}', userPrompt);

                // Call AI
                 const chat = model.startChat({ history: userHistory.slice(0, -1) });
                 const result = await chat.sendMessage(finalSystemInstruction);
                const response = result.response;
                let aiTextResult = response.text();


                if (!aiTextResult) {
                    console.warn("Gemini returned empty response.", response.promptFeedback || '');
                    aiTextResult = "I'm having trouble responding right now.";
                     if (response.promptFeedback?.blockReason) {
                        aiTextResult += ` (Reason: ${response.promptFeedback.blockReason})`;
                     }
                }

                // Parse Actions (keep your action parsing logic)
                let aiTextResponseForUser = aiTextResult;
                const actionsToPerform = [];
                const actionRegex = /\[ACTION:([A-Z_]+)\s*(.*?)\]$/i;
                const match = aiTextResult.match(actionRegex);
                if (match) {
                    actionsToPerform.push({ type: match[1].toUpperCase(), args: match[2]?.trim() });
                    aiTextResponseForUser = aiTextResult.replace(match[0], '').trim();
                }

                // Add AI response to history
                 userHistory.push({ role: 'model', parts: [{ text: aiTextResponseForUser || '(Performed action)' }] });
                 conversationHistory.set(userId, userHistory);

                // Send Response
                if (aiTextResponseForUser) {
                    await message.reply(aiTextResponseForUser.substring(0, 2000)).catch(console.error);
                } else if (actionsToPerform.length === 0) {
                     await message.reply("Okay.").catch(console.error);
                }

                // Execute Actions (keep your performAction function)
                for (const action of actionsToPerform) {
                    await performAction(message, action.type, action.args); // Ensure performAction is defined below or imported
                }

            } catch (error) {
                console.error("Error in AI processing:", error);
                 if (error.code !== 50013) { // Avoid replying on permission errors
                    message.reply("⚠️ Error processing AI request.").catch(console.error);
                 }
                  aiCooldowns.delete(message.author.id); // Clear cooldown on error
            }
            return; // Stop processing after AI handling
        }
        // --- End AI Trigger Logic ---


        // --- Prefix Command Handling ---
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Find command by name or alias
        const command = message.client.commands.get(commandName) ||
                        message.client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) return;

         // Check if the command is one of those moved to prefix
         const prefixOnlyCommands = ['claimticket', 'ticket', 'warn', 'warnlist', 'removewarn', 'timeout', 'softban', 'grant']; // Added 'grant'
         const isPrefixOnlyCommand = prefixOnlyCommands.includes(command.name);

         if (!isPrefixOnlyCommand && command.data) {
             // This is likely a remaining slash command file - ignore it here.
             // InteractionCreate will handle it.
             console.log(`Ignoring slash command file ${command.name} found during prefix check.`);
             return;
         } else if (!isPrefixOnlyCommand && !command.data) {
             // It's a prefix command file, but not one we explicitly converted in this request - execute it.
         } else if (!isPrefixOnlyCommand) {
             // Should not happen if files are structured correctly
             return;
         }

         // Handle 'ticket close' specifically if 'ticket' is the command object name
         if (command.name === 'ticket' && args[0]?.toLowerCase() !== 'close') {
            if (args[0]?.toLowerCase() === 'setup') {
                return message.reply('❌ The `ticket setup` command is only available as a slash command (`/ticket setup`).');
            }
             return; // Ignore other 'ticket' subcommands via prefix
         }
         // For ticket close, remove the 'close' argument
         if (command.name === 'ticket' && args[0]?.toLowerCase() === 'close') {
             args.shift(); // Remove 'close' so it's not passed to the execute function
         }


        // Cooldown Check (Similar to interactionCreate)
        if (!message.client.cooldowns.has(command.name)) {
            message.client.cooldowns.set(command.name, new Collection());
        }
        const nowCmd = Date.now();
        const timestamps = message.client.cooldowns.get(command.name);
        const cooldownAmount = (command.cooldown || 3) * 1000; // Use command-defined cooldown or 3s

        if (timestamps.has(message.author.id)) {
            const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
            if (nowCmd < expirationTime) {
                const timeLeft = (expirationTime - nowCmd) / 1000;
                return message.reply(`⏱️ Please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.name}\` command.`);
            }
        }
        timestamps.set(message.author.id, nowCmd);
        setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);


        // Execute Prefix Command
        try {
            // Execute the command, passing message, args, and client
            await command.execute(message, args, message.client);
        } catch (error) {
            console.error(`Error executing prefix command ${command.name}:`, error);
            message.reply('❌ There was an error trying to execute that command!').catch(console.error);
        }
        // --- End Prefix Command Handling ---
    },
};


// --- Helper: Perform Specific Bot Actions (Copied from previous version) ---
async function performAction(message, actionType, actionArgs) {
     console.log(`AI requested action: ${actionType} with args: ${actionArgs}`);
     switch (actionType) {
        case 'SEND_GIF':
            if (actionArgs) {
                const gifUrl = await searchGiphyGif(actionArgs);
                 const DEFAULT_GIF = 'https://media.giphy.com/media/l4pTsh45Dg7ClzJny/giphy.gif';
                 if (gifUrl && gifUrl !== DEFAULT_GIF) {
                    await message.channel.send(gifUrl).catch(console.error);
                 } else {
                     console.log(`Could not find suitable GIF for "${actionArgs}"`);
                 }
            } else { console.warn("SEND_GIF action without args."); }
            break;
        case 'SHOW_PROFILE':
            if (actionArgs) {
                 const targetMember = await findUserInGuild(message.guild, actionArgs);
                 if (targetMember) {
                     const targetUserId = targetMember.user ? targetMember.user.id : targetMember.id;
                     const targetData = await User.findOne({ userId: targetUserId });
                     const profileEmbed = new EmbedBuilder().setColor(0x00BFFF);
                     const displayName = targetMember.displayName || (targetMember.user ? targetMember.user.username : 'Unknown');

                     if (targetData) {
                         // Assuming getNextLevelXp is available
                         const nextXp = typeof getNextLevelXp === 'function' ? getNextLevelXp(targetData.level) : 'N/A';
                         profileEmbed.setTitle(`📊 ${displayName}'s Mini-Profile`)
                             .addFields(
                                 { name: 'Level', value: `\`${targetData.level}\``, inline: true },
                                 { name: 'XP', value: `\`${targetData.xp} / ${nextXp}\``, inline: true },
                                 { name: 'Coins', value: `\`${targetData.coins}\` 💰`, inline: true },
                                 { name: 'Cookies', value: `\`${targetData.cookies}\` 🍪`, inline: true },
                                 { name: 'Warnings', value: `\`${targetData.warnings?.length || 0}\``, inline: true },
                                 { name: 'Job', value: `\`${targetData.currentJob ? (message.client.config?.workProgression?.find(j => j.id === targetData.currentJob)?.title || 'Unknown') : 'Unemployed'}\``, inline: true }
                             );
                     } else {
                         profileEmbed.setTitle(`📊 ${displayName}'s Mini-Profile`).setDescription("No data found.");
                     }
                     await message.channel.send({ embeds: [profileEmbed] }).catch(console.error);
                 } else {
                     await message.channel.send(`Couldn't find user "${actionArgs}".`).catch(console.error);
                 }
            } else { console.warn("SHOW_PROFILE action without args."); }
            break;
        default:
            console.warn(`AI requested unsupported action: ${actionType}`);
    }
}
