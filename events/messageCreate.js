// events/messageCreate.js (FIXED - AI Command Execution + MongoDB)
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

const AI_MODEL = 'gemini-1.5-flash';
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
                const userId = options[name];
                if (!userId) return null;
                return message.guild.members.cache.get(userId)?.user || null;
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
            const embeds = typeof content === 'object' ? content.embeds : [];
            return message.channel.send({ content: msg, embeds: embeds });
        },
        
        editReply: async (content) => {
            const msg = typeof content === 'string' ? content : (content.content || 'Command executed');
            const embeds = typeof content === 'object' ? content.embeds : [];
            return message.channel.send({ content: msg, embeds: embeds });
        },
        
        followUp: async (content) => {
            const msg = typeof content === 'string' ? content : (content.content || 'Follow up');
            const embeds = typeof content === 'object' ? content.embeds : [];
            return message.channel.send({ content: msg, embeds: embeds });
        },
        
        deferReply: async (opts) => {
            mockInteraction.deferred = true;
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
                        }
                    }
                    
                    await user.save();
                    xpCooldowns.set(userKey, now);
                    
                    if (leveledUp) {
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
                return;
            }

            // Permission check
            const forgottenOneId = client.config.roles.forgottenOne;
            if (!message.member.roles.cache.has(forgottenOneId)) {
                if (message.channel.permissionsFor(client.user).has('ManageMessages')) {
                    await message.delete().catch(console.error);
                }
                return;
            }

            // Delete triggering message
            if (isAiPrefixCommand && message.channel.permissionsFor(client.user).has('ManageMessages')) {
                await message.delete().catch(console.error);
            }

            if (content.length === 0) {
                return message.author.send('✅ Blecky is listening. Type `blecky <your message>`').catch(console.error);
            }

            // Apply anonymous mode
            if (!isAiPrefixCommand && settings?.aiAnonymousMode) {
                isAnonymousMode = true;
            }

            // Build member list
            await message.guild.members.fetch();
            const memberList = message.guild.members.cache
                .filter(m => !m.user.bot)
                .map(m => `${m.user.username} (${m.user.id}) [Display: ${m.displayName}]`)
                .slice(0, 50)
                .join('\n');

            // Call AI
            const authorDisplay = isAnonymousMode ? 'Anonymous' : message.author.username;
            const prompt = `${authorDisplay}: ${content}`;

            const aiResponse = await callGeminiAI(prompt, memberList);
            
            if (!aiResponse) {
                return message.channel.send('⚠️ AI failed to respond.');
            }

            // Try to extract JSON command
            const parsed = extractJson(aiResponse);

            if (parsed?.action === 'command') {
                return await executeAiCommand(message, parsed, client);
            }

            // Send normal reply
            const replyPrefix = isAnonymousMode ? '🤖 **Anonymous:**' : `🤖 **${client.user.username}:**`;
            const replyText = aiResponse.length > 1800 ? aiResponse.substring(0, 1800) + '...' : aiResponse;
            
            await message.channel.send(`${replyPrefix} ${replyText}`);

        } catch (err) {
            console.error('❌ messageCreate error:', err);
            message.channel.send('⚠️ Something went wrong.').catch(console.error);
        }
    },
};

// Execute AI-generated commands
async function executeAiCommand(message, action, client) {
    try {
        const { commandName, options = {} } = action;

        console.log(`[AI] Executing command: ${commandName}`, options);

        // Resolve user targets
        if (options.target) {
            const member = await findUserByName(message.guild, options.target);
            if (member) {
                options.target = member.id;
            } else {
                return message.channel.send(`❌ User "${options.target}" not found.`);
            }
        }

        // Get the command
        const command = client.commands.get(commandName);
        
        if (!command) {
            return message.channel.send(`❌ Command \`${commandName}\` not found.`);
        }

        // Create mock interaction
        const mockInteraction = createMockInteraction(message, commandName, options);

        // Execute command
        const logModerationAction = async () => {}; // Placeholder
        await command.execute(mockInteraction, client, logModerationAction);
        
        console.log(`[AI] Command ${commandName} executed successfully`);

    } catch (err) {
        console.error('Error executing AI command:', err);
        message.channel.send(`⚠️ Error executing command: ${err.message}`).catch(console.error);
    }
}
