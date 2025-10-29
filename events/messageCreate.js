// events/messageCreate.js (FIXED - AI Model Name, Unknown Message Error, MongoDB)
const { EmbedBuilder, ChannelType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const User = require('../models/User');
const Settings = require('../models/Settings');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// System instruction for the AI
const SYSTEM_INSTRUCTION = `You are Blecky AI, a helpful Discord bot assistant.

When users ask you to execute commands, respond with JSON in this format:
{
  "action": "command",
  "commandName": "exact_command_name",
  "options": {
    "option_name": "value"
  }
}

Available commands you can execute:
- profile (options: target=username)
- balance / bal (options: target=username)
- daily
- work job / work apply / work resign
- beg
- gamble (options: amount=number)
- rob (options: target=username)
- addcoins (options: target=username, amount=number) [Admin only]
- addxp (options: target=username, amount=number) [Admin only]
- warn (options: target=username, reason=text) [Mod only]
- timeout (options: target=username, duration=1h, reason=text) [Mod only]

For normal conversation, respond naturally without JSON.`;

// *** THIS LINE IS CHANGED to match askblecknephew.js ***
const AI_MODEL = 'gemini-1.5-flash-preview-05-20';
const AI_MAX_RETRIES = 3;

// XP System
const XP_COOLDOWN = 60000; // 1 minute
const xpCooldowns = new Map();

// Helper function to calculate XP needed for next level
const getNextLevelXp = (level) => {
    // Using the same moderate formula as profile/addxp/removexp for consistency
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

// Helper function to find user by name with improved matching
async function findUserByName(guild, searchName) {
    if (!searchName) return null;

    // Fetch members if cache might be incomplete, handle potential errors
    try {
        await guild.members.fetch();
    } catch (err) {
        console.warn("Could not fetch all members for findUserByName:", err.message);
    }


    const search = searchName.toLowerCase().trim().replace(/[<@!>]/g, '');

    // Check if it's a user ID
    if (/^\d{17,19}$/.test(search)) {
        const member = guild.members.cache.get(search);
        if (member) return member;
        // Try fetching if not in cache by ID
        try {
            const fetchedMember = await guild.members.fetch(search);
            if (fetchedMember) return fetchedMember;
        } catch {} // Ignore fetch error if ID doesn't exist
    }

    // Try exact username match
    let member = guild.members.cache.find(m =>
        m.user.username.toLowerCase() === search ||
        m.user.tag.toLowerCase() === search
    );
    if (member) return member;

    // Try exact display name match
    member = guild.members.cache.find(m =>
        m.displayName.toLowerCase() === search
    );
    if (member) return member;

    // Try partial match (case-insensitive includes)
    member = guild.members.cache.find(m =>
        m.user.username.toLowerCase().includes(search) ||
        m.displayName.toLowerCase().includes(search) ||
        m.user.tag.toLowerCase().includes(search)
    );

    return member; // Returns found member or null
}


// Helper to extract JSON from AI response
function extractJson(text) {
    if (!text) return null;

    // Remove markdown code blocks ```json ... ``` or ``` ... ```
    text = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start === -1 || end === -1 || end < start) return null;

    try {
        const jsonStr = text.slice(start, end + 1);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('JSON parse error in extractJson:', e.message, 'Input text:', text);
        return null;
    }
}

// Helper function to call Gemini AI with retry
async function callGeminiAI(prompt, memberList, retries = AI_MAX_RETRIES) {
    const systemPrompt = `${SYSTEM_INSTRUCTION}\n\nServer Members (partial list):\n${memberList}`;

    for (let i = 0; i < retries; i++) {
        try {
            const model = genAI.getGenerativeModel({
                model: AI_MODEL,
                systemInstruction: systemPrompt,
            });

            // Adjust generation config if needed (e.g., temperature)
            const generationConfig = {
              // temperature: 0.7, // Example
              // maxOutputTokens: 1000, // Example
            };

            const result = await model.generateContent(prompt, generationConfig);
            // Check for safety ratings or blocked responses if necessary
             if (!result.response || !result.response.candidates || result.response.candidates.length === 0) {
                 const blockReason = result.response?.promptFeedback?.blockReason;
                 throw new Error(`AI response was empty or blocked. Reason: ${blockReason || 'Unknown'}`);
            }

            const response = result.response.text();

            if (response) return response;
            // Add a small delay even on successful empty response before retry
             await new Promise(resolve => setTimeout(resolve, 500));

        } catch (err) {
            console.error(`AI call attempt ${i + 1} failed:`, err.message);
            if (i === retries - 1) throw err; // Throw error on last retry
            // Exponential backoff with jitter
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw new Error('AI failed after max retries');
}


// Create a mock interaction object for command execution
function createMockInteraction(message, commandName, options = {}) {
    const mockInteraction = {
        commandName: commandName,
        user: message.author,
        member: message.member,
        guild: message.guild,
        channel: message.channel,
        client: message.client,
        replied: false,
        deferred: false,
        // Add application id needed by some discord.js internals potentially
        applicationId: message.client.application.id,
         // Add created timestamp
        createdTimestamp: message.createdTimestamp,

        options: {
            // Store resolved options internally for getters
             _resolvedData: options,
             _subcommand: options.subcommand || null, // Handle subcommand if passed

            getUser: (name) => {
                const userId = mockInteraction.options._resolvedData[name]; // Assumes ID is already resolved
                if (!userId) return null;
                // Prefer cache, fallback to potentially undefined user property if fetch fails
                return message.guild?.members.cache.get(userId)?.user || null;
            },
            getString: (name) => mockInteraction.options._resolvedData[name]?.toString() || null,
            getInteger: (name) => {
                const val = mockInteraction.options._resolvedData[name];
                const intVal = parseInt(val);
                return !isNaN(intVal) ? intVal : null;
            },
            getBoolean: (name) => mockInteraction.options._resolvedData[name] === true || mockInteraction.options._resolvedData[name] === 'true',
            getChannel: (name) => {
                const id = mockInteraction.options._resolvedData[name];
                return id ? message.guild?.channels.cache.get(id) : null;
            },
             getAttachment: (name) => {
                 // AI currently cannot specify attachments, return null
                 return null;
             },
             getRole: (name) => {
                 const id = mockInteraction.options._resolvedData[name];
                 return id ? message.guild?.roles.cache.get(id) : null;
             },
             getNumber: (name) => {
                 const val = mockInteraction.options._resolvedData[name];
                 const numVal = parseFloat(val);
                 return !isNaN(numVal) ? numVal : null;
            },
            getMember: (name) => {
                 const userId = mockInteraction.options._resolvedData[name];
                 if (!userId) return null;
                 return message.guild?.members.cache.get(userId) || null;
            },
            getSubcommand: (required = false) => {
                 if (required && !mockInteraction.options._subcommand) {
                    throw new Error("Subcommand is required but not found.");
                }
                return mockInteraction.options._subcommand;
            },
            // Add other getters if needed by commands (e.g., getMentionable)
        },

        // --- Reply Handling ---
        // Basic reply simulation - sends to the original message's channel.
        // Does NOT perfectly replicate ephemeral or interaction-specific features.
        reply: async (options) => {
            mockInteraction.replied = true;
            mockInteraction.deferred = false; // Reply overrides deferral
            const payload = typeof options === 'string' ? { content: options } : options;
            // Ignore ephemeral flag in message context
             if (payload.ephemeral) {
                 console.warn("[Mock Interaction] Ephemeral reply requested but not supported in message context, sending publicly.");
                 delete payload.ephemeral;
             }
            return message.channel.send(payload);
        },

        editReply: async (options) => {
            // For simplicity, just send another message. True edit requires storing the reply message ID.
            const payload = typeof options === 'string' ? { content: options } : options;
             if (payload.ephemeral) {
                 console.warn("[Mock Interaction] Ephemeral editReply requested but not supported in message context, sending publicly.");
                 delete payload.ephemeral;
             }
            return message.channel.send(payload);
        },

        followUp: async (options) => {
             const payload = typeof options === 'string' ? { content: options } : options;
             if (payload.ephemeral) {
                 console.warn("[Mock Interaction] Ephemeral followUp requested but not supported in message context, sending publicly.");
                 delete payload.ephemeral;
             }
            return message.channel.send(payload);
        },

        deferReply: async (options) => {
             if (mockInteraction.replied || mockInteraction.deferred) {
                 console.warn("[Mock Interaction] Already replied or deferred.");
                 return;
             }
            mockInteraction.deferred = true;
            // Optionally simulate typing
            await message.channel.sendTyping().catch(console.error);
            return Promise.resolve();
        },
         // Add fetchReply if needed, though harder to mock accurately
         fetchReply: async () => {
             console.warn("[Mock Interaction] fetchReply is not fully supported in this context.");
             return null; // Or return the last sent message if tracked
         },
         // Add deleteReply if needed
         deleteReply: async () => {
             console.warn("[Mock Interaction] deleteReply is not fully supported in this context.");
             return Promise.resolve();
         },
    };

    return mockInteraction;
}


module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // --- Initial Checks ---
        if (message.author.bot || !message.guild || message.channel.type === ChannelType.DM) {
            return;
        }

        let user; // Define user here for broader scope if needed later

        try {
            // --- XP System ---
            const userKey = `${message.guild.id}-${message.author.id}`;
            const now = Date.now();
             const settings = await Settings.findOne({ guildId: message.guild.id }); // Fetch settings early

             // Check if XP gain is disabled in this channel
             const noXp = settings?.noXpChannels?.includes(message.channel.id) ?? false;


             if (!noXp && (!xpCooldowns.has(userKey) || now - xpCooldowns.get(userKey) > XP_COOLDOWN)) {
                try {
                    user = await User.findOne({ userId: message.author.id });
                    if (!user) {
                        user = new User({ userId: message.author.id });
                    }

                    const xpGain = Math.floor(Math.random() * 15) + 10; // 10-24 XP
                    user.xp += xpGain;

                    const nextLevelXp = getNextLevelXp(user.level);
                    let leveledUp = false;
                    let oldLevel = user.level;

                    // Handle multiple level ups in one go
                    while (user.xp >= getNextLevelXp(user.level)) {
                         const xpNeeded = getNextLevelXp(user.level);
                         user.level++;
                         user.xp -= xpNeeded;
                         leveledUp = true;
                     }


                    await user.save(); // Save user data after XP and potential level changes
                    xpCooldowns.set(userKey, now); // Set cooldown after successful save


                    // If leveled up, handle roles and message
                    if (leveledUp) {
                         // Fetch member ensuring it's available
                         let member = message.member;
                         if (!member) {
                             member = await message.guild.members.fetch(message.author.id).catch(() => null);
                         }

                        if (member) {
                            const levelingRoles = client.config.levelingRoles || []; // Ensure it's an array

                             // Find the highest eligible role for the new level
                             const targetLevelRole = levelingRoles
                                .filter(r => r.level <= user.level) // Roles the user qualifies for
                                .sort((a, b) => b.level - a.level)[0]; // Get the highest level one

                             const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;

                             // Add the target role if not present, remove others
                             for (const roleConfig of levelingRoles) {
                                 const roleId = roleConfig.roleId;
                                 const hasRole = member.roles.cache.has(roleId);

                                 if (roleId === targetLevelRoleId) {
                                     if (!hasRole) {
                                         await member.roles.add(roleId).catch(err => console.error(`Failed to add level role ${roleId}: ${err.message}`));
                                     }
                                 } else {
                                     if (hasRole) {
                                         await member.roles.remove(roleId).catch(err => console.error(`Failed to remove level role ${roleId}: ${err.message}`));
                                     }
                                 }
                             }

                            // Send level-up message
                            // Ensure settings were fetched earlier
                            const levelUpChannelId = settings?.levelUpChannelId;
                            let levelUpChannel = null;
                             if (levelUpChannelId) {
                                 levelUpChannel = message.guild.channels.cache.get(levelUpChannelId);
                             } else {
                                 // Fallback to current channel if no specific channel set
                                 levelUpChannel = message.channel;
                            }


                            if (levelUpChannel && levelUpChannel.isTextBased()) { // Check if channel is text-based
                                const levelUpEmbed = new EmbedBuilder()
                                    .setTitle('🚀 Level UP!')
                                    .setDescription(`${message.author}, congratulations! You've reached **Level ${user.level}**! 🎉`)
                                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                                    .setColor(0xFFD700) // Gold
                                    .setTimestamp();
                                // Send only if level actually increased
                                if (user.level > oldLevel) {
                                     await levelUpChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] }).catch(err => console.error(`Failed to send level up message: ${err.message}`));
                                }

                            } else if (levelUpChannelId) {
                                console.warn(`Level up channel ${levelUpChannelId} not found or not text-based.`);
                            }
                        }
                    }
                } catch (err) {
                    console.error('XP system error:', err.message, err.stack);
                }
            }


            // --- AI Chat Handler ---
            let content = message.content.trim();
            let isAnonymousMode = false;
            let isAiPrefixCommand = false;

            // Check for AI prefixes
            if (content.toLowerCase().startsWith('r-blecky')) {
                content = content.substring('r-blecky'.length).trim();
                isAnonymousMode = true;
                isAiPrefixCommand = true;
            } else if (content.toLowerCase().startsWith('blecky')) {
                content = content.substring('blecky'.length).trim();
                isAiPrefixCommand = true;
            }

            // Determine if AI should process this message
            // Ensure settings were fetched earlier
            const isAiChannel = settings?.aiChannelId && message.channel.id === settings.aiChannelId;

            if (!isAiPrefixCommand && !isAiChannel) {
                return; // Not an AI request
            }

            // Permission check (Ensure member object is available)
            if (!message.member) {
                message.member = await message.guild.members.fetch(message.author.id).catch(() => null);
                 if (!message.member) {
                     console.error(`Could not fetch member ${message.author.id} for AI permission check.`);
                     return;
                 }
            }
            const forgottenOneId = client.config.roles?.forgottenOne; // Check if role exists in config
             if (!forgottenOneId || !message.member.roles.cache.has(forgottenOneId)) {
                // If the user lacks permission, try to delete their trigger message if possible
                 if (message.deletable) {
                     await message.delete().catch(err => console.error(`Failed to delete unauthorized AI trigger message: ${err.message}`));
                 }
                return; // Stop processing, user lacks permission
            }

            // Delete triggering message if it was a prefix command and bot has perms
             // *** FIX for Unknown Message Error ***
             if (isAiPrefixCommand && message.deletable) {
                 await message.delete().catch(err => {
                     // Log only if it's NOT an "Unknown Message" error, which is expected sometimes
                     if (err.code !== 10008) {
                         console.error(`Failed to delete AI trigger message: ${err.message}`);
                     }
                 });
             }


            if (content.length === 0) {
                 // Optionally send a DM or ephemeral reply if prefix used with no content
                 // await message.author.send("You mentioned Blecky, but didn't ask anything!").catch(()=>{});
                return;
            }

            // Apply anonymous mode if configured for the AI channel
            if (isAiChannel && settings?.aiAnonymousMode && !isAiPrefixCommand) { // Only if in AI channel AND prefix wasn't used
                isAnonymousMode = true;
            }


            // Build member list for AI context
             await message.guild.members.fetch().catch(console.error); // Refresh cache
             const memberList = message.guild.members.cache
                 .filter(m => !m.user.bot)
                 .map(m => `${m.user.username} (ID: ${m.user.id}, Display: ${m.displayName})`)
                 .slice(0, 50) // Limit size for context window
                 .join('\n') || 'No other members found.'; // Fallback


            // Indicate processing
            await message.channel.sendTyping().catch(console.error);

            // Call AI
            const authorDisplay = isAnonymousMode ? 'An anonymous user' : message.author.username;
            const prompt = `${authorDisplay}: ${content}`;


            const aiResponse = await callGeminiAI(prompt, memberList);

            if (!aiResponse) {
                // Don't send error to channel, already logged in callGeminiAI
                return;
            }

            // Try to extract JSON command
            const parsed = extractJson(aiResponse);

            if (parsed?.action === 'command') {
                return await executeAiCommand(message, parsed, client, settings);
            }

            // Send normal AI reply
            const replyPrefix = isAnonymousMode ? '🤖 **Anonymous:**' : `🤖 **${client.user.username}:**`;
            // Split long messages safely
             const MAX_LENGTH = 1950; // Discord message limit is 2000, leave buffer
            for (let i = 0; i < aiResponse.length; i += MAX_LENGTH) {
                 const chunk = aiResponse.substring(i, Math.min(aiResponse.length, i + MAX_LENGTH));
                 await message.channel.send(`${replyPrefix} ${chunk}`).catch(err => console.error(`Failed to send AI reply chunk: ${err.message}`));
             }


        } catch (err) {
            console.error('❌ Unhandled error in messageCreate:', err.message, err.stack);
            // Send a generic error message, avoid exposing details
             try {
                 await message.channel.send('⚠️ An unexpected error occurred. Please try again later.').catch(()=>{});
             } catch {}
        }
    },
};

// Execute AI-generated commands
async function executeAiCommand(message, action, client, settings) {
    let logChannel = null;
    if (settings?.aiLogChannelId) {
        logChannel = message.guild.channels.cache.get(settings.aiLogChannelId);
         if (logChannel && !logChannel.isTextBased()) { // Ensure it's a text channel
             console.warn(`AI Log Channel ${settings.aiLogChannelId} is not a text-based channel.`);
             logChannel = null; // Don't try to send logs there
         }
    }


    const log = async (logMessage, isError = false) => {
        if (isError) console.error(logMessage);
        else console.log(logMessage);

         if (logChannel) {
             try {
                 // Ensure message is not too long for Discord code block
                 const discordLogMsg = logMessage.substring(0, 1980); // Limit length
                 await logChannel.send(`\`\`\`${discordLogMsg}\`\`\``);
             } catch (err) {
                 console.error(`Failed to send AI command log to channel: ${err.message}`);
            }
         }
    };


    try {
        const { commandName, options = {} } = action;

         await log(`[AI Command Request] User: ${message.author.tag} (${message.author.id}), Command: /${commandName}, Raw Options: ${JSON.stringify(options)}`);


        // --- Resolve User Target ---
        let targetMember = null;
        let resolvedTargetId = null;
        if (options.target) {
            targetMember = await findUserByName(message.guild, options.target);
            if (targetMember) {
                 resolvedTargetId = targetMember.id; // Store resolved ID
                 await log(`[AI Command Info] Resolved target "${options.target}" to ${targetMember.user.tag} (${resolvedTargetId})`);
            } else {
                const notFoundMsg = `❌ AI Command Error: User "${options.target}" not found for command /${commandName}.`;
                 await log(notFoundMsg, true);
                return message.channel.send(notFoundMsg).catch(console.error);
            }
        }
         // Update options with resolved ID IF a target was specified
         if (resolvedTargetId) {
             options.target = resolvedTargetId;
         }
        // --- End Resolve User Target ---


        const command = client.commands.get(commandName);

        if (!command) {
            const cmdNotFoundMsg = `❌ AI Command Error: Command \`/${commandName}\` not recognized by the bot.`;
             await log(cmdNotFoundMsg, true);
            return message.channel.send(cmdNotFoundMsg).catch(console.error);
        }

        // --- Permission Check (More Granular) ---
        // Fetch necessary roles from config safely
        const rolesConfig = client.config.roles || {};
        const forgottenOneId = rolesConfig.forgottenOne;
        const overseerId = rolesConfig.overseer;
        const leadModId = rolesConfig.leadMod;
        const modId = rolesConfig.mod;
        const cookiesManagerId = rolesConfig.cookiesManager;
        // Gamelog roles not relevant for AI commands listed

        const memberRoles = message.member.roles.cache;
        const isAdmin = memberRoles.has(forgottenOneId) || memberRoles.has(overseerId);
        const isMod = memberRoles.has(leadModId) || memberRoles.has(modId) || isAdmin; // Mods include admins
        const isCookieManager = memberRoles.has(cookiesManagerId);

        let requiredPermission = false;
         const adminCommands = ['addcoins', 'addxp', /* 'resetdailystreak', 'quicksetup' - Not in AI list */];
         const modCommands = ['warn', 'timeout', 'softban', 'purge', 'purgeuser' /* ... other mod commands */];
         const currencyCommands = ['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', /* 'addxp', 'removexp', 'addcoins', 'removecoins' - Covered by admin */];


        if (adminCommands.includes(commandName)) requiredPermission = isAdmin;
        else if (modCommands.includes(commandName)) requiredPermission = isMod;
        else if (currencyCommands.includes(commandName)) requiredPermission = isCookieManager || isAdmin; // Allow Admins too
        else requiredPermission = true; // Assume public command if not listed

        // Check against Discord Permissions (e.g., Administrator bypass)
        if (message.member.permissions.has('Administrator')) {
            requiredPermission = true; // Bypass role checks if user has Discord Admin perm
        }


        if (!requiredPermission) {
             const permErrorMsg = `❌ AI Command Error: User ${message.author.tag} lacks permissions for command \`/${commandName}\`. Required: ${adminCommands.includes(commandName) ? 'Admin' : modCommands.includes(commandName) ? 'Moderator' : currencyCommands.includes(commandName) ? 'Cookie Manager/Admin' : 'Unknown'}`;
             await log(permErrorMsg, true);
            // Do not send specific permission error to channel for security/clarity
            return message.channel.send(`You don't have permission to use the \`/${commandName}\` command.`).catch(console.error);
        }
        // --- End Permission Check ---


        // Create mock interaction
        const mockInteraction = createMockInteraction(message, commandName, options);

        // Execute command
        const logModerationActionPlaceholder = async (guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') => {
             const logPayload = `[Mock Mod Log] Action: ${action}, Target: ${target?.tag || target?.id || target || 'N/A'}, Mod: ${moderator.tag}, Reason: ${reason}, Extra: ${extra}`;
             await log(logPayload); // Log mod actions called by commands
             // Add actual modlog channel sending logic here if desired
        };
        await command.execute(mockInteraction, client, logModerationActionPlaceholder);

        await log(`[AI Command Success] /${commandName} executed successfully by ${message.author.tag}.`);


    } catch (err) {
        // Log detailed error including stack trace
         const errorMsg = `[AI Command Failure] Error executing /${action?.commandName || 'unknown'} for ${message.author.tag}: ${err.message}\nStack: ${err.stack}`;
         await log(errorMsg, true);
        // Send generic error message to the channel
         try {
             await message.channel.send(`⚠️ An error occurred while trying to execute the command \`/${action?.commandName || 'unknown'}\`. The administrators have been notified.`).catch(()=>{});
         } catch {}
    }
}
