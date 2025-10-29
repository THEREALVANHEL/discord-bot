// events/messageCreate.js (FIXED - API URL Typo, Unknown Message Error, MongoDB)
const { EmbedBuilder, ChannelType } = require('discord.js');
// We will use fetch directly
const User = require('../models/User');
const Settings = require('../models/Settings');

// API Configuration
const API_KEY = process.env.GEMINI_API_KEY || "";
// *** FIXED TYPO IN URL HERE ***
const GEMINI_API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/"; // Corrected 'language'
const AI_MODEL = 'gemini-1.5-flash-preview-05-20'; // Keep the model that works elsewhere
const AI_MAX_RETRIES = 3;

// Helper function for exponential backoff delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// System instruction for the AI (kept the same)
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

// XP System Config
const XP_COOLDOWN = 60000; // 1 minute
const xpCooldowns = new Map();

// Helper function to calculate XP needed for next level
const getNextLevelXp = (level) => {
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

// Helper function to find user by name (no changes needed)
async function findUserByName(guild, searchName) {
    if (!searchName) return null;
    try { await guild.members.fetch(); } catch {} // Refresh cache
    const search = searchName.toLowerCase().trim().replace(/[<@!>]/g, '');
    if (/^\d{17,19}$/.test(search)) {
        const member = guild.members.cache.get(search);
        if (member) return member;
        try { const fetchedMember = await guild.members.fetch(search); if (fetchedMember) return fetchedMember; } catch {}
    }
    let member = guild.members.cache.find(m => m.user.username.toLowerCase() === search || m.user.tag.toLowerCase() === search);
    if (member) return member;
    member = guild.members.cache.find(m => m.displayName.toLowerCase() === search);
    if (member) return member;
    member = guild.members.cache.find(m => m.user.username.toLowerCase().includes(search) || m.displayName.toLowerCase().includes(search) || m.user.tag.toLowerCase().includes(search));
    return member;
}

// Helper to extract JSON (no changes needed)
function extractJson(text) {
    if (!text) return null;
    text = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) return null;
    try { const jsonStr = text.slice(start, end + 1); return JSON.parse(jsonStr); }
    catch (e) { console.error('JSON parse error:', e.message); return null; }
}

// Helper function to call Gemini AI using Fetch (no changes needed from previous version)
async function callGeminiAIWithFetch(prompt, memberList, retries = AI_MAX_RETRIES) {
    if (API_KEY === "") { console.error("GEMINI_API_KEY is not set!"); throw new Error("API key is missing."); }
    const fullUrl = `${GEMINI_API_URL_BASE}${AI_MODEL}:generateContent?key=${API_KEY}`; // Uses corrected base URL
    const systemPrompt = `${SYSTEM_INSTRUCTION}\n\nServer Members (partial list):\n${memberList}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };
    let lastError = null;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(fullUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({})); const errorMessage = errorBody?.error?.message || response.statusText;
                 if (response.status === 404) throw new Error(`API Error 404: Model '${AI_MODEL}' not found at v1beta endpoint. (${errorMessage})`); // More specific 404
                throw new Error(`API error ${response.status}: ${errorMessage}`);
            }
            const result = await response.json();
             const candidate = result?.candidates?.[0]; const aiText = candidate?.content?.parts?.[0]?.text;
             if (aiText) return aiText; // Success
             else { const finishReason = candidate?.finishReason; console.warn(`AI response empty. Finish Reason: ${finishReason}.`); throw new Error(`AI returned empty response. Finish Reason: ${finishReason}`); }
        } catch (error) {
            lastError = error; console.error(`AI fetch attempt ${i + 1} failed: ${error.message}`);
            if (i < retries - 1) { const delayMs = Math.pow(2, i) * 1000 + Math.random() * 1000; await delay(delayMs); }
        }
    }
    throw lastError || new Error('AI failed after max retries.');
}

// Create mock interaction object (no changes needed)
function createMockInteraction(message, commandName, options = {}) {
    // ... (implementation remains the same as previous correct version) ...
     const mockInteraction = {
        commandName: commandName, user: message.author, member: message.member, guild: message.guild,
        channel: message.channel, client: message.client, replied: false, deferred: false,
        applicationId: message.client.application.id, createdTimestamp: message.createdTimestamp,
        options: {
             _resolvedData: options, _subcommand: options.subcommand || null,
            getUser: (name) => { const userId = mockInteraction.options._resolvedData[name]; if (!userId) return null; return message.guild?.members.cache.get(userId)?.user || null; },
            getString: (name) => mockInteraction.options._resolvedData[name]?.toString() || null,
            getInteger: (name) => { const val = mockInteraction.options._resolvedData[name]; const intVal = parseInt(val); return !isNaN(intVal) ? intVal : null; },
            getBoolean: (name) => mockInteraction.options._resolvedData[name] === true || mockInteraction.options._resolvedData[name] === 'true',
            getChannel: (name) => { const id = mockInteraction.options._resolvedData[name]; return id ? message.guild?.channels.cache.get(id) : null; },
             getAttachment: (name) => null,
             getRole: (name) => { const id = mockInteraction.options._resolvedData[name]; return id ? message.guild?.roles.cache.get(id) : null; },
             getNumber: (name) => { const val = mockInteraction.options._resolvedData[name]; const numVal = parseFloat(val); return !isNaN(numVal) ? numVal : null; },
            getMember: (name) => { const userId = mockInteraction.options._resolvedData[name]; if (!userId) return null; return message.guild?.members.cache.get(userId) || null; },
            getSubcommand: (required = false) => { if (required && !mockInteraction.options._subcommand) throw new Error("Subcommand is required but not found."); return mockInteraction.options._subcommand; },
        },
        reply: async (options) => { mockInteraction.replied = true; mockInteraction.deferred = false; const payload = typeof options === 'string' ? { content: options } : options; if (payload.ephemeral) console.warn("[Mock] Ephemeral reply not supported, sending publicly."); delete payload.ephemeral; return message.channel.send(payload); },
        editReply: async (options) => { const payload = typeof options === 'string' ? { content: options } : options; if (payload.ephemeral) console.warn("[Mock] Ephemeral editReply not supported, sending publicly."); delete payload.ephemeral; return message.channel.send(payload); },
        followUp: async (options) => { const payload = typeof options === 'string' ? { content: options } : options; if (payload.ephemeral) console.warn("[Mock] Ephemeral followUp not supported, sending publicly."); delete payload.ephemeral; return message.channel.send(payload); },
        deferReply: async (options) => { if (mockInteraction.replied || mockInteraction.deferred) return; mockInteraction.deferred = true; await message.channel.sendTyping().catch(console.error); return Promise.resolve(); },
         fetchReply: async () => { console.warn("[Mock] fetchReply not fully supported."); return null; },
         deleteReply: async () => { console.warn("[Mock] deleteReply not fully supported."); return Promise.resolve(); },
    };
    return mockInteraction;
}

// --- Main Event Handler ---
module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // Initial checks
        if (message.author.bot || !message.guild || message.channel.type === ChannelType.DM) return;
        let user, settings;
        try {
            settings = await Settings.findOne({ guildId: message.guild.id });
            // --- XP System (condensed, no changes) ---
            const userKey = `${message.guild.id}-${message.author.id}`; const now = Date.now(); const noXp = settings?.noXpChannels?.includes(message.channel.id) ?? false;
            if (!noXp && (!xpCooldowns.has(userKey) || now - xpCooldowns.get(userKey) > XP_COOLDOWN)) {
                try {
                    user = await User.findOne({ userId: message.author.id }); if (!user) user = new User({ userId: message.author.id });
                    const xpGain = Math.floor(Math.random() * 15) + 10; user.xp += xpGain; let oldLevel = user.level; let leveledUp = false;
                    while (user.xp >= getNextLevelXp(user.level)) { const xpNeeded = getNextLevelXp(user.level); user.level++; user.xp -= xpNeeded; leveledUp = true; }
                    await user.save(); xpCooldowns.set(userKey, now);
                    if (leveledUp && user.level > oldLevel) { /* Role & Message Logic */
                        let member = message.member || await message.guild.members.fetch(message.author.id).catch(()=>null);
                        if(member) { /* Role update */ const levelingRoles = client.config.levelingRoles || []; const targetLevelRole = levelingRoles.filter(r => r.level <= user.level).sort((a,b)=>b.level-a.level)[0]; const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null; for (const roleConfig of levelingRoles){const roleId = roleConfig.roleId; const hasRole = member.roles.cache.has(roleId); if (roleId === targetLevelRoleId && !hasRole) await member.roles.add(roleId).catch(()=>{}); else if (roleId !== targetLevelRoleId && hasRole) await member.roles.remove(roleId).catch(()=>{});} /* Level up message */ const levelUpChannelId = settings?.levelUpChannelId; let levelUpChannel = levelUpChannelId ? message.guild.channels.cache.get(levelUpChannelId) : message.channel; if(levelUpChannel && levelUpChannel.isTextBased()){const embed=new EmbedBuilder().setTitle('🚀 Level UP!').setDescription(`${message.author}, congratulations! You've reached **Level ${user.level}**! 🎉`).setThumbnail(message.author.displayAvatarURL({dynamic:true})).setColor(0xFFD700).setTimestamp(); await levelUpChannel.send({content:`${message.author}`, embeds:[embed]}).catch(()=>{});}}}
                } catch (err) { console.error('XP system error:', err.message); }
            }
            // --- End XP System ---

            // --- AI Chat Handler ---
            let content = message.content.trim(); let isAnonymousMode = false; let isAiPrefixCommand = false;
            if (content.toLowerCase().startsWith('r-blecky')) { content = content.substring(9).trim(); isAnonymousMode = true; isAiPrefixCommand = true; }
            else if (content.toLowerCase().startsWith('blecky')) { content = content.substring(6).trim(); isAiPrefixCommand = true; }
            const isAiChannel = settings?.aiChannelId && message.channel.id === settings.aiChannelId;
            if (!isAiPrefixCommand && !isAiChannel) return; // Not an AI request

            // Permission Check
            if (!message.member) message.member = await message.guild.members.fetch(message.author.id).catch(() => null);
            const forgottenOneId = client.config.roles?.forgottenOne;
            if (!message.member || !forgottenOneId || !message.member.roles.cache.has(forgottenOneId)) {
                if (message.deletable) await message.delete().catch(err => { if (err.code !== 10008) console.error("Failed to delete unauthorized AI trigger:", err.message); }); return;
            }
            // Delete Trigger
            if (isAiPrefixCommand && message.deletable) await message.delete().catch(err => { if (err.code !== 10008) console.error("Failed to delete AI trigger:", err.message); });
            if (content.length === 0) return; // Ignore empty prompts
            // Anonymous Mode
            if (isAiChannel && settings?.aiAnonymousMode && !isAiPrefixCommand) isAnonymousMode = true;
            // Member List Context
            await message.guild.members.fetch().catch(console.error); const memberList = message.guild.members.cache.filter(m => !m.user.bot).map(m => `${m.user.username} (ID: ${m.user.id}, Display: ${m.displayName})`).slice(0, 50).join('\n') || 'No other members found.';
            // Typing Indicator
            await message.channel.sendTyping().catch(console.error);
            // Call AI via Fetch
            const authorDisplay = isAnonymousMode ? 'An anonymous user' : message.author.username; const prompt = `${authorDisplay}: ${content}`;
            const aiResponse = await callGeminiAIWithFetch(prompt, memberList); // Use fetch wrapper
            if (!aiResponse) return; // Error already logged
            // Check for Command JSON
            const parsed = extractJson(aiResponse); if (parsed?.action === 'command') return await executeAiCommand(message, parsed, client, settings);
            // Send Normal Reply
            const replyPrefix = isAnonymousMode ? '🤖 **Anonymous:**' : `🤖 **${client.user.username}:**`; const MAX_LENGTH = 1950;
            for (let i = 0; i < aiResponse.length; i += MAX_LENGTH) { const chunk = aiResponse.substring(i, Math.min(aiResponse.length, i + MAX_LENGTH)); await message.channel.send(`${replyPrefix} ${chunk}`).catch(err => console.error(`Failed send AI reply chunk: ${err.message}`)); }
            // --- End AI Chat Handler ---
        } catch (err) { console.error('❌ Unhandled error in messageCreate:', err.message, err.stack); try { await message.channel.send('⚠️ An unexpected error occurred.').catch(()=>{}); } catch {} }
    },
};

// Execute AI Command function (no changes needed from previous version)
async function executeAiCommand(message, action, client, settings) {
    // ... (implementation remains the same as previous correct version) ...
    let logChannel = null; if (settings?.aiLogChannelId) { logChannel = message.guild.channels.cache.get(settings.aiLogChannelId); if (logChannel && !logChannel.isTextBased()) logChannel = null; }
    const log = async (logMessage, isError = false) => { if (isError) console.error(logMessage); else console.log(logMessage); if (logChannel) try { await logChannel.send(`\`\`\`${logMessage.substring(0, 1980)}\`\`\``); } catch (err) { console.error(`Failed log to AI channel: ${err.message}`); } };
    try {
        const { commandName, options = {} } = action; await log(`[AI Command Request] User: ${message.author.tag} (${message.author.id}), Command: /${commandName}, Raw Options: ${JSON.stringify(options)}`);
        let targetMember = null; let resolvedTargetId = null; if (options.target) { targetMember = await findUserByName(message.guild, options.target); if (targetMember) { resolvedTargetId = targetMember.id; await log(`[AI Command Info] Resolved target "${options.target}" to ${targetMember.user.tag} (${resolvedTargetId})`); } else { const notFoundMsg = `❌ AI Command Error: User "${options.target}" not found for /${commandName}.`; await log(notFoundMsg, true); return message.channel.send(notFoundMsg).catch(console.error); } } if (resolvedTargetId) options.target = resolvedTargetId;
        const command = client.commands.get(commandName); if (!command) { const cmdNotFoundMsg = `❌ AI Command Error: Command \`/${commandName}\` not recognized.`; await log(cmdNotFoundMsg, true); return message.channel.send(cmdNotFoundMsg).catch(console.error); }
        // Permission Check
        const rolesConfig = client.config.roles || {}; const forgottenOneId = rolesConfig.forgottenOne; const overseerId = rolesConfig.overseer; const leadModId = rolesConfig.leadMod; const modId = rolesConfig.mod; const cookiesManagerId = rolesConfig.cookiesManager; const memberRoles = message.member.roles.cache; const isAdmin = memberRoles.has(forgottenOneId) || memberRoles.has(overseerId); const isMod = memberRoles.has(leadModId) || memberRoles.has(modId) || isAdmin; const isCookieManager = memberRoles.has(cookiesManagerId); let requiredPermission = false; const adminCommands = ['addcoins', 'addxp']; const modCommands = ['warn', 'timeout', 'softban', 'purge', 'purgeuser']; const currencyCommands = ['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall']; if (adminCommands.includes(commandName)) requiredPermission = isAdmin; else if (modCommands.includes(commandName)) requiredPermission = isMod; else if (currencyCommands.includes(commandName)) requiredPermission = isCookieManager || isAdmin; else requiredPermission = true; if (message.member.permissions.has('Administrator')) requiredPermission = true;
        if (!requiredPermission) { const permErrorMsg = `❌ AI Command Error: User ${message.author.tag} lacks permissions for /${commandName}.`; await log(permErrorMsg, true); return message.channel.send(`You don't have permission for \`/${commandName}\`.`).catch(console.error); }
        // Execute
        const mockInteraction = createMockInteraction(message, commandName, options);
        const logModerationActionPlaceholder = async (guild, settings, action, target, moderator, reason = 'N/A', extra = '') => { await log(`[Mock Mod Log] Action: ${action}, Target: ${target?.tag || target?.id || target || 'N/A'}, Mod: ${moderator.tag}, Reason: ${reason}, Extra: ${extra}`); };
        await command.execute(mockInteraction, client, logModerationActionPlaceholder);
        await log(`[AI Command Success] /${commandName} executed by ${message.author.tag}.`);
    } catch (err) { const errorMsg = `[AI Command Failure] Error executing /${action?.commandName || 'unknown'} for ${message.author.tag}: ${err.message}\nStack: ${err.stack}`; await log(errorMsg, true); try { await message.channel.send(`⚠️ Error executing \`/${action?.commandName || 'unknown'}\`. Admins notified.`).catch(()=>{}); } catch {} }
}
