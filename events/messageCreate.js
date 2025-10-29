// events/messageCreate.js (FIXED VERSION - Full AI Integration)
const { EmbedBuilder, ChannelType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const User = require('../models/User');
const Settings = require('../models/Settings');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// System instruction for the AI
const SYSTEM_INSTRUCTION = `You are Blecky AI, a helpful and powerful AI assistant in a Discord server.

You can perform various actions:
1. **Chat naturally** - Answer questions, have conversations
2. **Execute commands** - Use any bot command available
3. **Ping users** - Mention specific users
4. **Send DMs** - Private message users
5. **Search GIFs** - Find and share GIFs

When the user asks you to perform an action (ping someone, send a DM, etc.), respond with a JSON object:

{
  "action": "command",
  "commandName": "ping|dm|say|gif",
  "targetUser": "username or displayname",
  "arguments": ["arg1", "arg2"]
}

For normal conversation, just respond naturally (no JSON).

**Important**: Always search for the closest matching username/displayname from the member list.`;

const AI_MODEL = 'gemini-1.5-flash';
const AI_MAX_RETRIES = 3;

// XP System (from your existing code)
const XP_COOLDOWN = 60000; // 1 minute
const xpCooldowns = new Map();

// Helper function to calculate XP needed for next level
const getNextLevelXp = (level) => {
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

// Helper function to find user by name
async function findUserByName(guild, searchName) {
    if (!searchName) return null;
    
    const search = searchName.toLowerCase().trim();
    
    // Try exact match first
    let member = guild.members.cache.find(m => 
        m.user.username.toLowerCase() === search ||
        m.displayName.toLowerCase() === search ||
        m.user.tag.toLowerCase() === search
    );
    
    if (member) return member;
    
    // Try partial match
    member = guild.members.cache.find(m => 
        m.user.username.toLowerCase().includes(search) ||
        m.displayName.toLowerCase().includes(search)
    );
    
    return member;
}

// Helper to extract JSON from AI response
function extractJson(text) {
    if (!text) return null;
    
    // Remove code blocks
    text = text.replace(/```json|```/gi, '');
    
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    
    if (start === -1 || end === -1) return null;
    
    try {
        const jsonStr = text.slice(start, end + 1);
        return JSON.parse(jsonStr);
    } catch {
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
                let user = await User.findOne({ userId: message.author.id });
                if (!user) {
                    user = new User({ userId: message.author.id });
                }
                
                const xpGain = Math.floor(Math.random() * 15) + 10; // 10-25 XP
                user.xp += xpGain;
                
                // Check level up
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

            // Only process AI requests if triggered by prefix OR in designated AI channel
            const settings = await Settings.findOne({ guildId: message.guild.id });
            const isAiChannel = settings?.aiChannelId && message.channel.id === settings.aiChannelId;

            if (!isAiPrefixCommand && !isAiChannel) {
                return; // Not an AI request
            }

            // Permission check: Only 'forgottenOne' role can use AI
            const forgottenOneId = client.config.roles.forgottenOne;
            if (!message.member.roles.cache.has(forgottenOneId)) {
                if (message.channel.permissionsFor(client.user).has('ManageMessages')) {
                    await message.delete().catch(console.error);
                }
                return;
            }

            // Delete the triggering message if it was a prefix command
            if (isAiPrefixCommand && message.channel.permissionsFor(client.user).has('ManageMessages')) {
                await message.delete().catch(console.error);
            }

            // If empty command, prompt user
            if (content.length === 0) {
                return message.author.send('✅ Blecky is listening. Please follow the prefix (e.g., `blecky ping alien`).').catch(console.error);
            }

            // Apply anonymous mode from settings if not a prefix command
            if (!isAiPrefixCommand && settings?.aiAnonymousMode) {
                isAnonymousMode = true;
            }

            // Build member list for AI context
            const memberList = message.guild.members.cache
                .filter(m => !m.user.bot)
                .map(m => `${m.user.username} (Display: ${m.displayName})`)
                .join('\n');

            // Call AI
            const authorDisplay = isAnonymousMode ? 'Anonymous' : message.author.username;
            const prompt = `${authorDisplay}: ${content}`;

            const aiResponse = await callGeminiAI(prompt, memberList);
            
            if (!aiResponse) {
                return message.channel.send('⚠️ AI failed to respond. Please try again.');
            }

            // Try to extract JSON command
            const parsed = extractJson(aiResponse);

            // Execute command if JSON found
            if (parsed?.action === 'command') {
                return await executeAiCommand(message, parsed, isAnonymousMode, client);
            }

            // Otherwise, send normal AI reply
            const replyPrefix = isAnonymousMode ? '🤖 **Anonymous:**' : `🤖 **${client.user.username}:**`;
            const replyText = aiResponse.length > 1800 ? aiResponse.substring(0, 1800) + '...' : aiResponse;
            
            await message.channel.send(`${replyPrefix} ${replyText}`);

        } catch (err) {
            console.error('❌ messageCreate error:', err);
            message.channel.send('⚠️ Something went wrong while processing your message.').catch(console.error);
        }
    },
};

// Execute AI-generated commands
async function executeAiCommand(message, action, isAnonymousMode, client) {
    try {
        const { commandName, targetUser, arguments: args = [] } = action;

        // 1. SAY command - send plain text
        if (commandName === 'say') {
            return message.channel.send(args.join(' '));
        }

        // 2. PING command - mention a user
        if (commandName === 'ping') {
            const member = await findUserByName(message.guild, targetUser);
            if (member) {
                return message.channel.send(`🏓 Pong! ${member}`);
            } else {
                return message.channel.send(`❌ Couldn't find user "${targetUser}".`);
            }
        }

        // 3. DM command - private message
        if (commandName === 'dm') {
            const member = await findUserByName(message.guild, targetUser);
            if (!member) {
                return message.channel.send(`❌ Couldn't find user "${targetUser}" to DM.`);
            }

            const dmMessage = args.join(' ');
            const senderTag = isAnonymousMode ? 'Anonymous' : message.author.tag;

            try {
                await member.user.send(`**[DM from ${senderTag}]**: ${dmMessage}`);
                return message.channel.send(`✅ DM sent to **${member.user.tag}**.`);
            } catch {
                return message.channel.send(`❌ Could not DM **${member.user.tag}**. They might have DMs disabled.`);
            }
        }

        // 4. GIF command - search and send GIF
        if (commandName === 'gif') {
            // Placeholder: You'd integrate with Giphy API here
            const searchTerm = args.join(' ');
            return message.channel.send(`🎬 *Searching for GIF: "${searchTerm}"* (Giphy integration needed)`);
        }

        // 5. Try to execute as a slash command (if applicable)
        const command = client.commands.get(commandName);
        if (command) {
            // Note: This is a simplified approach. Full slash command execution
            // would require creating a mock interaction object.
            return message.channel.send(`ℹ️ AI suggested: \`/${commandName}\` (Manual execution required for slash commands)`);
        }

        // Unknown command
        return message.channel.send(`❌ Unknown command: \`${commandName}\``);

    } catch (err) {
        console.error('Error executing AI command:', err);
        message.channel.send('⚠️ Error executing the AI-suggested command.').catch(console.error);
    }
}
