// events/messageCreate.js (FINAL, FINAL VERSION - Replaces nested AI call with local safe JS calculation)

const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');

// --- CONVERSATION MEMORY (per user) ---
const conversationHistory = new Map(); // userId -> [{role, content}]
const MAX_HISTORY_LENGTH = 10; // Keep last 10 exchanges

function addToHistory(userId, role, content) {
// ... (omitted for brevity, assume unchanged)
}

function getHistory(userId) {
// ... (omitted for brevity, assume unchanged)
}

// --- GIPHY API ---
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function searchGiphyGif(query) {
// ... (omitted for brevity, assume unchanged)
}

// --- GEMINI AI CORE ---
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";
const API_KEY = process.env.GEMINI_API_KEY || "";

const SYSTEM_INSTRUCTION = `You are Blecky Nephew, a Discord bot assistant. You are an expert at identifying and executing bot commands.
Your primary role is to be a friendly, knowledgeable, and slightly snarky companion, responding conversationally to all questions.
However, if the user's message clearly translates to a single, structured bot command (like 'warn', 'add coins', 'send gif', 'calculate', etc.), you MUST respond ONLY with a JSON object that strictly adheres to the schema below. If no command is found, respond only with conversational text.

Current Date/Time: ${new Date().toISOString()}

Server Members for reference: {MEMBER_LIST}

JSON SCHEMA (Return ONLY the JSON if an action is detected):
{
  "action": "one of: warn, warnlist, remove_warn, add_coins, remove_coins, add_cookies, remove_cookies, add_xp, remove_xp, dm, gif, avatar, calculate, info, ping, account_created, joined",
  "targetUser": "The username, nickname, or mention of the user (resolved to a string name/ID), or null",
  "amount": "The numerical value for currency/XP, or the warning index for remove_warn, or null",
  "reason": "The reason for the action or null",
  "gifQuery": "The full search term for a GIF, or null",
  "dmMessage": "The message to send in a DM, or null",
  "mathExpression": "The exact math expression to calculate (e.g., '99 * 87'), or null",
  "infoType": "coins, cookies, xp, or level (for 'info' action), or null"
}

If a command is not suitable for the current user's role (e.g., a non-admin asking to 'warn'), still output the JSON, but include a 'permission_note' field stating the required role.

If the user mentions an action not listed in 'action', or asks a general question, do NOT output JSON. Respond conversationally, keeping your response concise and under 300 characters.`;


async function callGeminiAI(history, guildMembers, latestMessage) {
// ... (omitted for brevity, assume unchanged, including the fix from the previous step)
    if (!API_KEY) {
        throw new Error("Gemini API key not configured");
    }
    
    // Prepare the member list string for the prompt
    const memberNames = guildMembers.slice(0, 100).map(m => 
        `${m.user.username} (display: ${m.displayName})`
    ).join(', ');

    const systemInstruction = SYSTEM_INSTRUCTION.replace("{MEMBER_LIST}", memberNames);

    const contents = [
        // System instruction sent as a user message to guide the model
        { role: 'user', parts: [{ text: systemInstruction }] }, 
        ...history,
        { role: 'user', parts: [{ text: latestMessage }] }
    ];

    // FIX: Removed the unsupported 'config' field and nested parameters.
    const payload = {
        contents: contents,
    };
    
    try {
        const response = await fetch(GEMINI_API_URL + API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content?.parts[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }
        
        if (data.error) {
             throw new Error(data.error.message);
        }
        
        throw new Error('No valid text response from AI');
        
    } catch (error) {
        console.error('Gemini AI error:', error);
        throw error;
    }
}


// --- SAFE CALCULATION HELPER ---

// Allowed characters in the expression (math, numbers, functions)
const ALLOWED_CHARS_REGEX = /^[0-9+\-*/().\s]+$/;

function safeEval(expression) {
    // 1. Sanitize the expression to prevent code injection
    const cleanedExpression = expression.toLowerCase()
        // Replace common math functions/constants with Math. equivalents
        .replace(/log10\s*\(/g, 'Math.log10(')
        .replace(/log\s*\(/g, 'Math.log(')
        .replace(/ln\s*\(/g, 'Math.log(')
        .replace(/sqrt\s*\(/g, 'Math.sqrt(')
        .replace(/pow\s*\(/g, 'Math.pow(')
        .replace(/sin\s*\(/g, 'Math.sin(')
        .replace(/cos\s*\(/g, 'Math.cos(')
        .replace(/tan\s*\(/g, 'Math.tan(')
        .replace(/pi/g, 'Math.PI')
        .replace(/[^-()\d/*+.]/g, ''); // Keep only basic math symbols

    try {
        // 2. Execute calculation using Function constructor for isolated scope
        // This is safer than eval() but still powerful.
        const result = new Function('return ' + cleanedExpression)();
        
        if (typeof result === 'number' && isFinite(result)) {
            return result;
        }
        return 'Error';
    } catch (e) {
        return 'Error';
    }
}

// ... (findUserInGuild, manageTieredRoles, getNextLevelXp omitted for brevity, assume unchanged)

// SMART USER FINDER (Existing function, copied for completeness)
function findUserInGuild(guild, searchTerm, authorId) {
    if (!searchTerm || searchTerm.length < 2) return null;
    
    const match = searchTerm.match(/<@!?(\d+)>|(\d{17,19})/);
    if (match) {
        const id = match[1] || match[2];
        const member = guild.members.cache.get(id);
        if (id === authorId) return { self: true };
        return member;
    }

    const search = searchTerm.toLowerCase().trim();
    
    let bestMatch = null;
    let bestScore = 0;
    
    guild.members.cache.forEach(member => {
        if (member.id === authorId) return;
        
        const username = member.user.username.toLowerCase();
        const displayName = member.displayName.toLowerCase();
        const tag = member.user.tag.toLowerCase();
        
        if (username === search || displayName === search || tag === search) {
            bestMatch = member;
            bestScore = 100;
            return;
        }
        
        if (username.includes(search) || displayName.includes(search)) {
            if (bestScore < 80) {
                bestMatch = member;
                bestScore = 80;
            }
        }
        
        if (username.startsWith(search) || displayName.startsWith(search)) {
            if (bestScore < 90) {
                bestMatch = member;
                bestScore = 90;
            }
        }
    });
    
    return bestMatch;
}

// ... (manageTieredRoles, getNextLevelXp omitted for brevity, assume unchanged)

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
            if (!hasRole) await member.roles.add(roleId).catch(() => {});
        } else {
            if (hasRole) await member.roles.remove(roleId).catch(() => {});
        }
    }
}

const getNextLevelXp = (level) => Math.floor(100 * Math.pow(level + 1, 1.5));


// Helper function to send the reply, ensuring correct method is used
async function sendReply(message, content, isAnonymous) {
    try {
        if (isAnonymous) {
            // Anonymous commands are always sent to the channel
            return await message.channel.send(content);
        } else if (typeof content === 'string') {
            // Standard reply to the user's message
            return await message.reply(content);
        } else {
            // Send rich content (embeds, etc.) to the channel
            return await message.channel.send(content);
        }
    } catch (e) {
        console.error("Failed to send final reply:", e);
    }
}

// --- UNIFIED ACTION EXECUTION ---
async function executeParsedAction(message, client, parsed, targetMember, isAnonymous) {
    const action = parsed.action;
    let targetUser = targetMember ? await User.findOne({ userId: targetMember.id }) || new User({ userId: targetMember.id }) : null;
    const amount = parsed.amount || 1;
    const reason = parsed.reason || 'No reason provided';
    const logChannelId = (await Settings.findOne({ guildId: message.guild.id }))?.modlogChannelId;
    const logChannel = logChannelId ? message.guild.channels.cache.get(logChannelId) : null;
    const isModerator = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                       message.member.roles.cache.has(client.config.roles.leadMod) || 
                       message.member.roles.cache.has(client.config.roles.mod);
    const isCurrencyManager = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                              message.member.roles.cache.has(client.config.roles.cookiesManager);
    
    // Helper for sending action replies
    const sendActionReply = async (content) => {
        if (isAnonymous) {
            return await message.channel.send(content);
        } else {
            return await message.reply(content);
        }
    }

    // --- UTILITY ACTION: CALCULATE (FIXED) ---
    if (action === 'calculate' && parsed.mathExpression) {
        const expression = parsed.mathExpression;
        const result = safeEval(expression);

        if (result === 'Error') {
             await sendActionReply(`❌ I couldn't safely calculate that expression: \`${expression}\``);
             return false;
        }

        // Format the result to 2 decimal places if it's a float
        const formattedResult = Number.isInteger(result) ? result : result.toFixed(2);
        
        await sendActionReply(`**${expression}** = **${formattedResult}**`);
        return true;
    }

    // --- BASIC ACTIONS (Always Allowed) ---
    if (action === 'gif') {
        const query = parsed.gifQuery || 'random';
        const gifUrl = await searchGiphyGif(query);
        // GIFs are always sent directly to the channel
        await message.channel.send(gifUrl); 
        return true;
    }
    
    if (action === 'ping') {
        if (!targetMember) {
             await sendActionReply(`❌ Couldn't find user "${parsed.targetUser}" to execute the **ping** command.`);
             return false;
        }
        await message.channel.send(`<@${targetMember.id}>`);
        return true;
    }

    // ... (rest of the actions omitted for brevity, assume unchanged and using sendActionReply)
    
    // --- INFO ACTIONS (Always Allowed if user exists) ---
    if (action === 'avatar' && targetMember) {
        const avatarUrl = targetMember.user.displayAvatarURL({ dynamic: true, size: 1024 });
        const embed = new EmbedBuilder()
            .setTitle(`${targetMember.user.tag}'s Avatar`)
            .setImage(avatarUrl)
            .setColor(0x7289DA);
        await message.channel.send({ embeds: [embed] });
        return true;
    }
    
    if (action === 'account_created' && targetMember) {
        const createdDate = `<t:${Math.floor(targetMember.user.createdTimestamp / 1000)}:F>`;
        await sendActionReply(`**${targetMember.user.tag}** created their account on ${createdDate}`);
        return true;
    }
    
    if (action === 'joined' && targetMember) {
        const joinDate = `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:F>`;
        await sendActionReply(`**${targetMember.user.tag}** joined on ${joinDate}`);
        return true;
    }

    if (action === 'info' && targetMember && targetUser) {
        const infoType = parsed.infoType || 'coins';
        let value = targetUser[infoType] || 0;
        if (infoType === 'level') value = targetUser.level; // Ensure level is displayed correctly
        await sendActionReply(`**${targetMember.user.tag}** has **${value}** ${infoType}`);
        return true;
    }


    // --- MODERATION ACTIONS (Requires Moderator) ---
    if (['warn', 'warnlist', 'remove_warn', 'dm'].includes(action)) {
        if (!isModerator && action !== 'dm') {
             await sendActionReply("❌ You need **Moderator** permissions to use that command.");
             return false;
        }
        if (!targetMember) {
             await sendActionReply(`❌ Target user "${parsed.targetUser}" not found.`);
             return false;
        }
        
        // WARNLIST
        if (action === 'warnlist') {
            if (!targetUser || !targetUser.warnings || targetUser.warnings.length === 0) {
                await sendActionReply(`✅ **${targetMember.user.tag}** has no warnings.`);
                return true;
            }
            const embed = new EmbedBuilder()
                 .setTitle(`⚠️ Warnings for ${targetMember.user.tag}`)
                 .setColor(0xFFA500)
                 .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
                 .setDescription(`Total Warnings: **${targetUser.warnings.length}**`)
                 .setTimestamp();
            
            targetUser.warnings.forEach((warn, index) => {
                 const moderator = message.guild.members.cache.get(warn.moderatorId);
                 embed.addFields({
                     name: `Warning #${index + 1}`,
                     value: `**Reason:** ${warn.reason}\n**Moderator:** ${moderator?.user.tag || 'Unknown'}\n**Date:** <t:${Math.floor(warn.date.getTime() / 1000)}:F>`,
                     inline: false
                 });
            });
            await message.channel.send({ embeds: [embed] });
            return true;
        }
        
        // WARN
        if (action === 'warn') {
            targetUser.warnings.push({ reason, moderatorId: message.author.id, date: new Date() });
            await targetUser.save();
            await sendActionReply(`✅ Warned **${targetMember.user.tag}**\n**Reason:** ${reason}\n**Total warnings:** ${targetUser.warnings.length}`);
            
            if (logChannel) {
                const logEmbed = new EmbedBuilder().setTitle('⚠️ Warning Issued').setColor(0xFFA500)
                    .addFields({ name: 'Target', value: `${targetMember.user.tag} (${targetMember.id})` },
                               { name: 'Admin', value: `${message.author.tag}` },
                               { name: 'Reason', value: reason },
                               { name: 'Total', value: `${targetUser.warnings.length}` }).setTimestamp();
                logChannel.send({ embeds: [logEmbed] });
            }
            // Auto timeout logic (unchanged)
            if (targetUser.warnings.length >= 5) {
                try {
                    await targetMember.timeout(5 * 60 * 1000, '5 warnings reached');
                    await message.channel.send(`⏰ **${targetMember.user.tag}** timed out for 5 minutes (5 warnings)`);
                } catch {}
            }
            return true;
        }

        // REMOVE WARNING
        if (action === 'remove_warn') {
            const warnIndex = amount;
            if (!targetUser || !targetUser.warnings || targetUser.warnings.length === 0) {
                await sendActionReply(`❌ **${targetMember.user.tag}** has no warnings.`);
                return false;
            }
            if (warnIndex < 1 || warnIndex > targetUser.warnings.length) {
                await sendActionReply(`❌ Invalid warning number. **${targetMember.user.tag}** has ${targetUser.warnings.length} warning(s).`);
                return false;
            }
            const removedWarn = targetUser.warnings.splice(warnIndex - 1, 1);
            await targetUser.save();
            await sendActionReply(`✅ Removed warning #${warnIndex} from **${targetMember.user.tag}**\n**Reason was:** ${removedWarn[0].reason}`);
            return true;
        }

        // DM
        if (action === 'dm') {
            const content = parsed.dmMessage || "Hi! 👋";
            try {
                await targetMember.user.send(content);
                await sendActionReply(`✅ Sent DM to **${targetMember.user.tag}**`);
            } catch {
                await sendActionReply(`❌ Couldn't DM **${targetMember.user.tag}** (DMs closed)`);
            }
            return true;
        }
    }


    // --- CURRENCY ACTIONS (Requires Currency Manager) ---
    if (['add_coins', 'remove_coins', 'add_cookies', 'remove_cookies', 'add_xp', 'remove_xp'].includes(action)) {
        if (!isCurrencyManager) {
             await sendActionReply("❌ You need **Currency Manager** permissions to modify currency/XP.");
             return false;
        }
        if (!targetMember) {
             await sendActionReply(`❌ Target user "${parsed.targetUser}" not found.`);
             return false;
        }
        
        const currencyType = action.split('_')[1]; // coins, cookies, xp
        const operation = action.split('_')[0]; // add, remove

        // REMOVE actions sanity check
        if (operation === 'remove') {
            if (!targetUser || targetUser[currencyType] < amount) {
                await sendActionReply(`❌ **${targetMember.user.tag}** only has ${targetUser ? targetUser[currencyType] : 0} ${currencyType}.`);
                return false;
            }
            targetUser[currencyType] = Math.max(0, targetUser[currencyType] - amount);
        } else {
            // ADD actions
            targetUser[currencyType] += amount;
        }

        await targetUser.save();
        
        // Role Management (Cookies and XP/Level)
        if (currencyType === 'cookies') {
            await manageTieredRoles(targetMember, targetUser.cookies, client.config.cookieRoles, 'cookies');
        }
        
        if (currencyType === 'xp') {
            let oldLevel = targetUser.level;

            let nextLevelXp = getNextLevelXp(targetUser.level);
            
            // Level-up loop (for multiple levels)
            while (targetUser.xp >= nextLevelXp) {
                targetUser.level++;
                targetUser.xp -= nextLevelXp;
                nextLevelXp = getNextLevelXp(targetUser.level);
                
                // Role management logic inside the loop
                await manageTieredRoles(targetMember, targetUser.level, client.config.levelingRoles, 'level');
            }
            await targetUser.save(); // Save after level loop
            
            // Send level-up message if a level change occurred
            if (targetUser.level > oldLevel) {
                 const settings = await Settings.findOne({ guildId: message.guild.id });
                 const levelUpChannel = settings?.levelUpChannelId ? 
                      message.guild.channels.cache.get(settings.levelUpChannelId) : 
                      message.channel;
                
                 if (levelUpChannel) {
                     const levelUpEmbed = new EmbedBuilder()
                          .setTitle('🚀 Level UP!')
                          .setDescription(`${targetMember}, congratulations! You've leveled up to **Level ${targetUser.level}**! 🎉`)
                          .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
                          .setColor(0xFFD700)
                          .setTimestamp();
                    await levelUpChannel.send({ content: `${targetMember}`, embeds: [levelUpEmbed] });
                 }
            }
        }
        
        await sendActionReply(`✅ **${operation.charAt(0).toUpperCase() + operation.slice(1)}** **${amount}** ${currencyType} ${operation === 'add' ? 'to' : 'from'} **${targetMember.user.tag}**\nThey now have **${targetUser[currencyType]}** ${currencyType}`);
        return true;
    }

    return false; // Action not executed
}


// --- XP GAIN LOGIC (Existing function, simplified) ---
async function handleXpGain(message, client, settings) {
    if (settings && settings.noXpChannels.includes(message.channel.id)) return;

    // Use the client's map, which was newly initialized in index.js
    const cooldownKey = `${message.author.id}-${message.channel.id}`;
    const lastXpTime = client.xpCooldowns.get(cooldownKey);
    const XP_COOLDOWN_MS = 5000;
    
    if (lastXpTime && (Date.now() - lastXpTime < XP_COOLDOWN_MS)) return;
    client.xpCooldowns.set(cooldownKey, Date.now());

    let user = await User.findOne({ userId: message.author.id });
    if (!user) user = new User({ userId: message.author.id });

    const xpGain = Math.floor(Math.random() * 3) + 3;
    user.xp += xpGain;

    const nextLevelXp = getNextLevelXp(user.level);
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;

      const member = message.member;
      if (member) {
          // Pass the 'level' property for sorting
          await manageTieredRoles(member, user.level, client.config.levelingRoles, 'level');
      }
      
      const levelUpChannel = settings?.levelUpChannelId ? 
        message.guild.channels.cache.get(settings.levelUpChannelId) : message.channel;
      if (levelUpChannel) {
        const levelUpEmbed = new EmbedBuilder()
          .setTitle('🚀 Level UP!')
          .setDescription(`${message.author}, you're now **Level ${user.level}**!`)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setColor(0xFFD700)
          .setTimestamp();
        await levelUpChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] });
      }
    }
    
    // Cookie role management is now part of XP gain for continuous update
    const member = message.member;
    if (member) {
        await manageTieredRoles(member, user.cookies, client.config.cookieRoles, 'cookies');
    }
    
    // Auto-join role logic (unchanged)
    const autoJoinRoleId = client.config.roles.autoJoin;
    if (autoJoinRoleId && member && !member.roles.cache.has(autoJoinRoleId)) {
      await member.roles.add(autoJoinRoleId).catch(() => {});
    }

    await user.save();
}


// --- MAIN MESSAGE CREATE EXECUTE FUNCTION ---
module.exports = {
  name: 'messageCreate',
  // Assuming client.xpCooldowns is initialized as a Map in index.js
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    
    // --- COMMAND CHECK PREFIXES ---
    const botMention = message.mentions.users.has(client.user.id);
    const isBleckyCommand = message.content.toLowerCase().startsWith('blecky');
    const isAnonymousCommand = message.content.toLowerCase().startsWith('r-blecky'); // NEW PREFIX
    
    // Determine the query source and if the message should be deleted
    let userQuery = message.content;
    let isAnonymous = false;

    if (isAnonymousCommand) {
        userQuery = userQuery.replace(/^r-blecky\s*/i, '').trim();
        isAnonymous = true;
    } else if (botMention) {
        userQuery = userQuery.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    } else if (isBleckyCommand) {
        userQuery = userQuery.replace(/^blecky\s*/i, '').trim();
    } else {
        // Not a bot command/mention, skip AI command logic
        await handleXpGain(message, client, settings);
        return;
    }

    // --- AI PERMISSION CHECK ---
    const API_KEY = process.env.GEMINI_API_KEY || "";
    const forgottenOneRole = client.config.roles.forgottenOne;
    const isForgottenOne = message.member?.roles.cache.has(forgottenOneRole);
    
    if (!isForgottenOne || !API_KEY) {
        if (userQuery.length > 0) {
            // Standard reply if the user is not anonymous
            const replyMethod = isAnonymous ? message.channel.send.bind(message.channel) : message.reply.bind(message);
            await replyMethod("❌ The AI command system is restricted to Administrators (`forgottenOne` role) only.");
        }
        // Always run XP gain unless the message was a valid command prefix and the user failed the permission check, in which case we exit early.
        return; 
    }
    
    // --- PROCESS AI COMMAND ---
    if (userQuery.length === 0) {
        await message.reply("Yes? 🐱");
        return;
    }
    
    // Add user message to history *before* calling the AI
    addToHistory(message.author.id, 'user', userQuery);

    try {
        // Delete original message if the anonymous prefix was used
        if (isAnonymous) {
            await message.delete().catch(e => console.error("Failed to delete anonymous message:", e));
        }

        const guildMembers = Array.from(message.guild.members.cache.values());
        const history = getHistory(message.author.id);
        
        // AI call for conversational or structured response
        const aiResponseText = await callGeminiAI(history, guildMembers, userQuery);
        
        // FIX: Robust JSON parsing: look for the first '{' and the last '}'
        const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log('AI Parsed Action:', parsed);
                
                let targetMember = null;
                if (parsed.targetUser) {
                    targetMember = findUserInGuild(message.guild, parsed.targetUser, message.author.id);
                    if (!targetMember && parsed.action !== 'calculate' && parsed.action !== 'gif') {
                        // Send error message using the channel's send method
                        await message.channel.send(`❌ Couldn't find user "${parsed.targetUser}" to execute the **${parsed.action}** command.`);
                        // Remove last user message as it led to an error state
                        getHistory(message.author.id).pop(); 
                        return;
                    }
                }
                
                // Execute the action via the new centralized function
                const actionExecuted = await executeParsedAction(message, client, parsed, targetMember, isAnonymous);

                if (actionExecuted) {
                    // Action successful, don't add JSON to history
                    return; 
                }
                // If action failed (e.g. permission denied) the error is handled inside executeParsedAction
            } catch (e) {
                console.error('AI JSON Parsing/Execution Error:', e);
                // Fallback to sending a conversational error message
                const replyMethod = isAnonymous ? message.channel.send.bind(message.channel) : message.reply.bind(message);
                await replyMethod("❌ I parsed a command but failed to execute it. Perhaps the argument format was wrong, or the resulting action failed.");
            }
        }
        
        // If it's a conversational response (or failed JSON detection fallback)
        const conversationalResponse = aiResponseText.replace(/\{[\s\S]*\}/g, '').trim();

        if (conversationalResponse.length > 0) {
             const replyMethod = isAnonymous ? message.channel.send.bind(message.channel) : message.reply.bind(message);
             await replyMethod(conversationalResponse);
             addToHistory(message.author.id, 'model', conversationalResponse);
        } else {
             const replyMethod = isAnonymous ? message.channel.send.bind(message.channel) : message.reply.bind(message);
             await replyMethod("🤔 That was interesting. Try rephrasing that command or question!");
             // Remove last user message if AI couldn't parse or respond meaningfully
             getHistory(message.author.id).pop(); 
        }
        
    } catch (error) {
        console.error('AI Command/Conversation Error:', error);
        // Ensure to send the error message to the channel if the original message was deleted
        const replyMethod = isAnonymous ? message.channel.send.bind(message.channel) : message.reply.bind(message);
        await replyMethod("❌ The AI system failed. Try checking the `GEMINI_API_KEY` or rephrasing your request.");
        // Remove last user message if AI threw an exception
        getHistory(message.author.id).pop(); 
    }
  },
};
