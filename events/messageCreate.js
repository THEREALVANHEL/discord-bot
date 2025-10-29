// events/messageCreate.js (FIXED - AI Model Name + MongoDB)
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

// *** THIS LINE IS CHANGED ***
const AI_MODEL = 'gemini-1.5-flash-latest'; // Use -latest or a specific preview version like 'gemini-1.5-flash-preview-05-20'
const AI_MAX_RETRIES = 3;

// XP System
const XP_COOLDOWN = 60000; // 1 minute
const xpCooldowns = new Map();

// Helper function to calculate XP needed for next level
const getNextLevelXp = (level) => {
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

// Helper function to find user by name with improved matching
async function findUserByName(guild, searchName) {
    if (!searchName) return null;

    // Fetch all members to ensure cache is up to date
    await guild.members.fetch();

    const search = searchName.toLowerCase().trim().replace(/[<@!>]/g, '');

    // Check if it's a user ID
    if (/^\d{17,19}$/.test(search)) {
        const member = guild.members.cache.get(search);
        if (member) return member;
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

    // Try partial match
    member = guild.members.cache.find(m =>
        m.user.username.toLowerCase().includes(search) ||
        m.displayName.toLowerCase().includes(search) ||
        m.user.tag.toLowerCase().includes(search)
    );

    return member;
}

// Helper to extract JSON from AI response
function extractJson(text) {
    if (!text) return null;

    // Remove markdown code blocks
    text = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '');

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start === -1 || end === -1) return null;

    try {
        const jsonStr = text.slice(start, end + 1);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('JSON parse error:', e.message);
        return null;
    }
}

// Helper function to call Gemini AI with retry
async function callGeminiAI(prompt, memberList, retries = AI_MAX_RETRIES) {
    const systemPrompt = `${SYSTEM_INSTRUCTION}\n\nServer Members:\n${memberList}`;

    for (let i = 0; i < retries; i++) {
        try {
            const model = genAI.getGenerativeModel({
                model: AI_MODEL,
                systemInstruction: systemPrompt,
            });

            const result = await model.generateContent(prompt);
            const response = result.response.text();

            if (response) return response;
        } catch (err) {
            console.error(`AI call attempt ${i + 1} failed:`, err.message);
            if (i === retries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
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

        options: {
            getUser: (name) => {
                const userIdOrName = options[name]; // AI might return ID or Name
                if (!userIdOrName) return null;
                // Try fetching by ID first
                let user = message.guild.members.cache.get(userIdOrName)?.user;
                // If not found by ID, try finding by name (using the existing helper)
                if (!user) {
                     // We need an async context to use findUserByName here if needed,
                     // but for simplicity in mock, assume AI provides ID or findUserByName resolves it before calling executeAiCommand.
                     // A more robust solution might involve passing the resolved member ID directly.
                     // For now, let's assume `options[name]` holds the resolved ID after findUserByName runs in executeAiCommand.
                     user = message.guild.members.cache.get(userIdOrName)?.user;
                }
                return user || null;
            },
            getString: (name) => options[name] || null,
            getInteger: (name) => {
                const val = options[name];
                return val ? parseInt(val) : null;
            },
            getBoolean: (name) => options[name] || false,
            getChannel: (name) => {
                const id = options[name];
                return id ? message.guild.channels.cache.get(id) : null;
            },
            getSubcommand: () => options.subcommand || null,
        },

        reply: async (content) => {
            mockInteraction.replied = true;
            const msg = typeof content === 'string' ? content : (content.content || 'Command executed');
            const embeds = typeof content === 'object' && content.embeds ? content.embeds : [];
            const ephemeral = typeof content === 'object' && content.ephemeral;

            // Simple reply, doesn't handle ephemeral well from message context
            return message.channel.send({ content: msg, embeds: embeds });
        },

        editReply: async (content) => {
             // Mocking editReply by sending a new message
            const msg = typeof content === 'string' ? content : (content.content || 'Command executed (edit)');
            const embeds = typeof content === 'object' && content.embeds ? content.embeds : [];
            return message.channel.send({ content: msg, embeds: embeds });
        },

        followUp: async (content) => {
            // Mocking followUp by sending a new message
            const msg = typeof content === 'string' ? content : (content.content || 'Follow up');
            const embeds = typeof content === 'object' && content.embeds ? content.embeds : [];
            const ephemeral = typeof content === 'object' && content.ephemeral;
            // Simple followUp, doesn't handle ephemeral well from message context
            return message.channel.send({ content: msg, embeds: embeds });
        },

        deferReply: async (opts) => {
            mockInteraction.deferred = true;
            // Optionally simulate typing indicator
            // await message.channel.sendTyping();
            return Promise.resolve();
        },
    };

    return mockInteraction;
}


module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        try {
            // Ignore bots, DMs, and non-guild messages
            if (message.author.bot || !message.guild || message.channel.type === ChannelType.DM) {
                return;
            }

            // --- XP System (runs for all messages) ---
            const userKey = `${message.guild.id}-${message.author.id}`;
            const now = Date.now();

            if (!xpCooldowns.has(userKey) || now - xpCooldowns.get(userKey) > XP_COOLDOWN) {
                try {
                    let user = await User.findOne({ userId: message.author.id });
                    if (!user) {
                        user = new User({ userId: message.author.id });
                    }

                    const xpGain = Math.floor(Math.random() * 15) + 10;
                    user.xp += xpGain;

                    const nextLevelXp = getNextLevelXp(user.level);
                    let leveledUp = false;

                    if (user.xp >= nextLevelXp) {
                         let oldLevel = user.level; // Store old level before incrementing
                        user.level++;
                        user.xp -= nextLevelXp;
                        leveledUp = true;

                        // Update leveling roles
                        const member = message.guild.members.cache.get(message.author.id);
                        if (member) {
                            const levelingRoles = client.config.levelingRoles;
                            const targetLevelRole = levelingRoles
                                .filter(r => r.level <= user.level)
                                .sort((a, b) => b.level - a.level)[0];

                            const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;

                            for (const roleConfig of levelingRoles) {
                                const roleId = roleConfig.roleId;
                                const hasRole = member.roles.cache.has(roleId);

                                if (roleId === targetLevelRoleId && !hasRole) {
                                    await member.roles.add(roleId).catch(() => {});
                                } else if (roleId !== targetLevelRoleId && hasRole) {
                                    await member.roles.remove(roleId).catch(() => {});
                                }
                            }
                             // Send level-up message only if level actually changed
                             if (leveledUp && user.level > oldLevel) {
                                const settings = await Settings.findOne({ guildId: message.guild.id });
                                const levelUpChannel = settings?.levelUpChannelId
                                    ? message.guild.channels.cache.get(settings.levelUpChannelId)
                                    : message.channel;

                                if (levelUpChannel) {
                                    const levelUpEmbed = new EmbedBuilder()
                                        .setTitle('🚀 Level UP!')
                                        .setDescription(`${message.author}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
                                        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                                        .setColor(0xFFD700)
                                        .setTimestamp();

                                    await levelUpChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] });
                                }
                            }
                        }
                    }

                    await user.save();
                    xpCooldowns.set(userKey, now);

                } catch (err) {
                    console.error('XP system error:', err);
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

            // Only process AI requests if triggered
            const settings = await Settings.findOne({ guildId: message.guild.id });
            const isAiChannel = settings?.aiChannelId && message.channel.id === settings.aiChannelId;

            if (!isAiPrefixCommand && !isAiChannel) {
                return; // Not an AI request
            }

            // Permission check (Ensure member object is available)
            if (!message.member) {
                 // Fetch member if not cached
                 try {
                     message.member = await message.guild.members.fetch(message.author.id);
                 } catch {
                     console.error(`Could not fetch member ${message.author.id} for permission check.`);
                     return; // Cannot verify permissions
                 }
            }
            const forgottenOneId = client.config.roles.forgottenOne;
            if (!message.member.roles.cache.has(forgottenOneId)) {
                // Check if bot can delete messages, then delete and return
                if (message.channel.permissionsFor(client.user).has('ManageMessages')) {
                    await message.delete().catch(console.error);
                }
                // Send an ephemeral notice if possible (difficult in message context) or just return
                return;
            }


            // Delete triggering message if it was a prefix command
            if (isAiPrefixCommand && message.channel.permissionsFor(client.user).has('ManageMessages')) {
                await message.delete().catch(console.error);
            }

            if (content.length === 0) {
                 // If prefix was used but no content, maybe send a notice?
                 // For now, just return to avoid processing empty prompt
                return;
            }


            // Apply anonymous mode if configured for the AI channel and not overridden by prefix
            if (!isAiPrefixCommand && settings?.aiAnonymousMode) {
                isAnonymousMode = true;
            }

            // Build member list (fetch ensures cache is somewhat fresh)
            await message.guild.members.fetch();
            const memberList = message.guild.members.cache
                .filter(m => !m.user.bot)
                .map(m => `${m.user.username} (${m.user.id}) [Display: ${m.displayName}]`)
                .slice(0, 50) // Limit list size
                .join('\n');

            // Call AI
            const authorDisplay = isAnonymousMode ? 'Anonymous' : message.author.username;
            const prompt = `${authorDisplay}: ${content}`;

            // Indicate processing
            await message.channel.sendTyping();

            const aiResponse = await callGeminiAI(prompt, memberList);

            if (!aiResponse) {
                return message.channel.send('⚠️ AI failed to respond after retries.');
            }

            // Try to extract JSON command
            const parsed = extractJson(aiResponse);

            if (parsed?.action === 'command') {
                return await executeAiCommand(message, parsed, client, settings); // Pass settings for logging
            }

            // Send normal reply
            const replyPrefix = isAnonymousMode ? '🤖 **Anonymous:**' : `🤖 **${client.user.username}:**`;
            // Split long messages
            const replyChunks = aiResponse.match(/[\s\S]{1,1900}/g) || []; // Split into chunks ~1900 chars

            for (const chunk of replyChunks) {
                 await message.channel.send(`${replyPrefix} ${chunk}`);
            }


        } catch (err) {
            console.error('❌ messageCreate error:', err);
            // Avoid sending error in channel if it's potentially sensitive
            // Log it server-side instead. Maybe send a generic error.
             try {
                 await message.channel.send('⚠️ An unexpected error occurred while processing your request.');
             } catch {} // Ignore errors sending the error message
        }
    },
};

// Execute AI-generated commands
async function executeAiCommand(message, action, client, settings) { // Added settings parameter
    let logChannel = null;
    if (settings?.aiLogChannelId) {
        logChannel = message.guild.channels.cache.get(settings.aiLogChannelId);
    }

    try {
        const { commandName, options = {} } = action;

        const logEntry = `[AI Command Execution Request]
User: ${message.author.tag} (${message.author.id})
Command: /${commandName}
Raw Options: ${JSON.stringify(options)}`;
        console.log(logEntry);
        if (logChannel) await logChannel.send(`\`\`\`${logEntry}\`\`\``);


        // Resolve user targets
        let targetMember = null; // Store resolved member for logging
        if (options.target) {
            targetMember = await findUserByName(message.guild, options.target);
            if (targetMember) {
                options.target = targetMember.id; // Replace name with ID for command execution
            } else {
                 const notFoundMsg = `❌ AI Command Error: User "${options.target}" not found for command /${commandName}.`;
                 console.log(notFoundMsg);
                 if (logChannel) await logChannel.send(`\`\`\`${notFoundMsg}\`\`\``);
                return message.channel.send(notFoundMsg);
            }
        }

        // Get the command
        const command = client.commands.get(commandName);

        if (!command) {
            const cmdNotFoundMsg = `❌ AI Command Error: Command \`/${commandName}\` not recognized by the bot.`;
            console.log(cmdNotFoundMsg);
            if (logChannel) await logChannel.send(`\`\`\`${cmdNotFoundMsg}\`\`\``);
            return message.channel.send(cmdNotFoundMsg);
        }

        // --- Permission Check (Simulated) ---
        // This is complex because commands have different permission levels.
        // We might need a permission mapping or check within the mock interaction if critical.
        // For now, let's assume the AI won't suggest commands the user *definitely* can't run,
        // but the actual command execution might still fail later if permissions are insufficient.
        // A basic check for admin/mod commands based on SYSTEM_INSTRUCTION:
        const isAdminCommand = ['addcoins', 'addxp'].includes(commandName);
        const isModCommand = ['warn', 'timeout'].includes(commandName);
        const forgottenOneId = client.config.roles.forgottenOne; // Assuming admin role ID
        const modRoleId = client.config.roles.mod; // Assuming mod role ID
        const leadModRoleId = client.config.roles.leadMod; // Assuming lead mod role ID

        const hasAdminRole = message.member.roles.cache.has(forgottenOneId); // Simplified check
        const hasModRole = message.member.roles.cache.has(modRoleId) || message.member.roles.cache.has(leadModRoleId) || hasAdminRole;

        if ((isAdminCommand && !hasAdminRole) || (isModCommand && !hasModRole)) {
            const permErrorMsg = `❌ AI Command Error: You lack permissions for command \`/${commandName}\`.`;
            console.log(permErrorMsg);
            if (logChannel) await logChannel.send(`\`\`\`${permErrorMsg}\`\`\``);
            return message.channel.send(permErrorMsg);
        }
        // --- End Permission Check ---


        // Create mock interaction
        const mockInteraction = createMockInteraction(message, commandName, options);

        // Execute command
        // Define a placeholder logModerationAction for commands that need it
         const logModerationActionPlaceholder = async (guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') => {
            console.log(`[Mock Mod Log] Action: ${action}, Target: ${target?.id || target}, Mod: ${moderator.id}, Reason: ${reason}, Extra: ${extra}`);
            // If you have a real logging channel setup, you could call the actual log function here too
        };
        await command.execute(mockInteraction, client, logModerationActionPlaceholder);

        const successMsg = `[AI Command Executed] /${commandName} by ${message.author.tag}`;
        console.log(successMsg);
        if (logChannel) await logChannel.send(`\`\`\`${successMsg}\`\`\``);


    } catch (err) {
        const errorMsg = `[AI Command Error] Failed executing /${action?.commandName || 'unknown'} for ${message.author.tag}: ${err.message}`;
        console.error(errorMsg, err);
         if (logChannel) await logChannel.send(`\`\`\`${errorMsg}\`\`\``);
        // Avoid sending detailed errors to the channel, log them instead.
         try {
             await message.channel.send(`⚠️ An error occurred while trying to execute the command \`/${action?.commandName || 'unknown'}\`.`);
         } catch {} // Ignore errors sending the error message
    }
}
