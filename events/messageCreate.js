// events/messageCreate.js (REPLACE - Fixed infinite role add/remove loop in leveling and cookie role logic + MODERATE XP GAIN + 5s SPAM COOLDOWN + AI ADMIN HANDLER)
const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');

// --- AI ADMIN HANDLER UTILITIES ---
// Note: These utilities are typically imported, but are duplicated here to ensure file-independence.
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";
const API_KEY = process.env.GEMINI_API_KEY || "";
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
            const systemInstruction = `You are a sophisticated AI command parser and administrator bot named Bleck Nephew. Your primary goal is to interpret the user's request, which is a Discord bot command, and translate it into either a JSON object representing the command to execute, or a natural language response if the request is not a command or you can't fulfill it.

COMMAND MODE: If the request is clearly an administrative or currency command (e.g., add coins, remove xp, warn, purge, timeout, lock/unlock), you MUST respond ONLY with a single JSON object in the format: {"action": "COMMAND", "command": "commandName", "targetId": "<user id or mention>", "amount": "<number>", "reason": "<string>"} . Fill in only the relevant fields. For example: {"action": "COMMAND", "command": "addcoins", "targetId": "<@${message.author.id}>", "amount": "100"}. The available slash commands you can interpret are: addcoins, removecoins, addcookies, removecookies, addxp, removexp, warn, timeout, purge, purgeuser, lock, unlock. Note that 'purge' and 'purgeuser' only accept the 'amount' field.

CHAT MODE: If the request is a general question, a suggestion, or a command you cannot fulfill, respond with a casual, witty, and concise natural language message. Do not use the JSON format in this mode.`;

            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                // Enable search grounding for general chat questions/suggestions
                tools: [{ "google_search": {} }],
            };
            
            await message.channel.sendTyping(); // Indicate the bot is thinking
            const result = await fetchWithRetry(GEMINI_API_URL, payload);
            
            const aiResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            // 1. Try to parse as JSON command
            let commandExecutionData;
            try {
                commandExecutionData = JSON.parse(aiResponseText);
            } catch {}

            if (commandExecutionData && commandExecutionData.action === 'COMMAND') {
                const { command, targetId, amount, reason } = commandExecutionData;
                const commandObject = client.commands.get(command);

                if (commandObject) {
                    // This simulates the interaction execution logic
                    await message.reply(`🤖 **Executing AI Command:** \`/${command} target:${targetId} amount:${amount || 'N/A'} reason:${reason || 'N/A'}\``);
                    
                    // Simple mock interaction structure for basic commands
                    // NOTE: This mock is insufficient for complex commands like poll, but covers basic mods/currency.
                    const mockInteraction = {
                        // Minimal properties required by most simple command executes
                        options: {
                            getUser: () => {
                                const userIdMatch = targetId.match(/\d+/);
                                const userId = userIdMatch ? userIdMatch[0] : null;
                                return userId ? { id: userId, tag: `User${userId}`, bot: false } : null;
                            },
                            getInteger: (name) => {
                                if (name === 'amount' && amount) return parseInt(amount);
                                return null;
                            },
                            getString: (name) => {
                                if (name === 'reason' && reason) return reason;
                                if (name === 'duration' && amount) return amount.toString(); // For /timeout
                                return null;
                            },
                            // Minimal function mocks for other command-specific options
                            getChannel: () => message.channel,
                            getRole: () => null,
                        },
                        user: message.author,
                        member: message.member,
                        guild: message.guild,
                        channel: message.channel,
                        client: client,
                        // Mock defer/reply functions
                        deferReply: async ({ ephemeral }) => {},
                        editReply: async (options) => { await message.reply(options.content || { embeds: options.embeds }); },
                        reply: async (options) => { await message.reply(options.content || { embeds: options.embeds }); },
                        followUp: async (options) => { await message.channel.send(options.content || { embeds: options.embeds }); },
                    };
                    
                    // We must ensure 'logModerationAction' is passed for mod commands
                    const logModerationAction = (guild, settings, action, target, moderator, reason, extra) => {
                        // Simple version of logModerationAction
                        message.channel.send(`[MODLOG SIMULATION] ${action} on ${target.tag} by ${moderator.tag}. Reason: ${reason}`);
                    };

                    // Execute the actual command logic
                    await commandObject.execute(mockInteraction, client, logModerationAction);

                } else {
                    await message.reply(`❌ **AI Command Error:** The AI attempted to execute the unknown command: \`/${command}\`.`);
                }
            } else {
                // 2. Respond with AI chat (Chat Mode)
                await message.reply(aiResponseText);
            }
            
        } catch (error) {
            console.error('AI Admin Handler Error:', error);
            await message.reply(`❌ **AI System Error:** The AI service failed to process your request. Details: \`${error.message.substring(0, 100)}\``);
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
