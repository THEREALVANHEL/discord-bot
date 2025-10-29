// events/messageCreate.js (REPLACED - Advanced AI Handler v2)
const { Events, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch'); // Required for Giphy search if using older fetch version
const User = require('../models/User'); // Import User model
const { findUserInGuild } = require('../utils/findUserInGuild'); // Utility to find users
const { searchGiphyGif } = require('../utils/searchGiphyGif'); // Import Giphy search
const { getNextLevelXp } = require('../utils/levelUtils'); // Import XP calculation

// --- Configuration ---
const AI_MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest'; // Use flash by default
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TRIGGER_WORD = 'blecky'; // Word to trigger the AI (case-insensitive)
const MAX_HISTORY = 5; // Max number of conversation turns (user + model) to remember per user
const AI_COOLDOWN_MS = 3000; // 3 seconds cooldown per user

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
        // Bot will run but AI features won't work
    }
} else {
    console.warn("⚠️ GEMINI_API_KEY not found in environment variables. AI features will be disabled.");
}


// --- AI System Instructions ---
const SYSTEM_INSTRUCTION = `You are Blecky Nephew, an advanced AI integrated into a Discord server, inspired by Jarvis. Your personality is helpful, highly knowledgeable, witty, proactive, and aware of the server's context (economy, levels, commands). You remember the recent conversation history with the current user.

Capabilities & Rules:
1.  **Conversational Interaction:** Engage naturally, answer questions thoroughly, provide information, and maintain context based on History and User Data.
2.  **Contextual Awareness:** Use the provided User Data (level, coins, etc.) to inform your responses where relevant. Example: If asked about affording something, refer to their coin balance.
3.  **Command Assistance (CRUCIAL):** If a user's request clearly maps to a bot command (e.g., "warn Bob", "check my profile", "give 10 coins to Alice", "what's the leaderboard?", "remind me to..."), DO NOT attempt the action yourself. INSTEAD, provide the precise slash command syntax for the user to execute. Be explicit about this. Examples:
    * User: "blecky warn Bob for spamming" -> Your Response: "To warn Bob, please use the command: \`/warn target: @Bob reason: spamming\`"
    * User: "blecky check my coins" -> Your Response: "You can see your full profile, including coins, using: \`/profile\`"
    * User: "blecky give 10 coins to @Alice" -> Your Response: "To give coins, use the command: \`/givecoins target: @Alice amount: 10\`"
    * User: "blecky show me the xp leaderboard" -> Your Response: "You can view the XP leaderboard with: \`/leaderboard type: xp\`"
    * User: "blecky remind me in 5 minutes about the meeting" -> Your Response: "Set a reminder using: \`/remind time: 5m message: about the meeting\`"
4.  **Structured Action Requests:** ONLY for specific, pre-approved tasks, include ONE of these exact tags at the VERY END of your response text:
    * For a GIF related to your response: `[ACTION:SEND_GIF keyword(s)]` (e.g., `[ACTION:SEND_GIF thumbs up]`) - Use sparingly for illustrative/emotional emphasis.
    * For a user's mini-profile summary: `[ACTION:SHOW_PROFILE user_mention_or_ID]` (e.g., `[ACTION:SHOW_PROFILE @Vanhel]`)
    * (No other actions can be requested this way).
5.  **Database Interaction:** You CANNOT directly access the database. If asked for specific user data not in the initial context, state you don't have live access but can show a profile summary via the action tag, or guide the user to the relevant command (e.g., \`/profile target:@User\`).
6.  **Tone:** Jarvis-like: Intelligent, slightly sophisticated but friendly and approachable, efficient, occasionally humorous. Use Discord markdown (\`code\`, *italic*, **bold**) effectively.
7.  **Task Handling:** If asked to do something complex not covered by commands or actions (e.g., "explain photosynthesis", "write a short poem"), perform the task to the best of your ability as a language model. Keep responses concise unless detail is needed.

Current Conversation History (User <-> You):
{{CONVERSATION_HISTORY}}

User Data Provided: {{USER_DATA}}

---
User's Current Message: {{USER_MESSAGE}}
---
Your Response:`;
// --- End AI System Instructions ---


// Simple in-memory conversation history
const conversationHistory = new Map(); // userId -> array of { role: 'user'/'model', parts: [{text: content}] }

// Cooldown management
const aiCooldowns = new Map();

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Basic checks
    if (message.author.bot || !message.guild || message.content.startsWith('/') || !model) return;

    // Trigger check (case-insensitive)
    const lowerContent = message.content.toLowerCase();
    if (!lowerContent.includes(TRIGGER_WORD)) return;

    // Cooldown Check
    const now = Date.now();
    const userCooldown = aiCooldowns.get(message.author.id);
    if (userCooldown && now < userCooldown) {
        // console.log(`User ${message.author.tag} on AI cooldown.`);
        return; // Silently ignore if on cooldown
    }
    aiCooldowns.set(message.author.id, now + AI_COOLDOWN_MS);


    // Clean the prompt - remove trigger word and mentions specifically for the prompt text
    let userPrompt = message.content.replace(new RegExp(TRIGGER_WORD, 'gi'), '').replace(/<@!?\d+>/g, '').trim();
    // Allow prompt even if only trigger word + mentions, but handle empty prompt after cleaning
    if (!userPrompt && message.mentions.users.size > 0) {
        // Example: "blecky @user" -> interpret as maybe asking about the user?
        userPrompt = `Tell me about ${message.mentions.users.first().username}`;
    } else if (!userPrompt) {
         if (message.content.trim().toLowerCase() === TRIGGER_WORD) {
            await message.reply("Yes? How can I help you today? 😄").catch(console.error);
         } // else: trigger word was part of a sentence but nothing else remained -> ignore
         aiCooldowns.delete(message.author.id); // Reset cooldown if prompt effectively empty
         return;
    }


    try {
        await message.channel.sendTyping();

        // 1. Fetch User Data from DB
        let userDataContext = "No specific data available.";
        let user = await User.findOne({ userId: message.author.id });
        if (!user) {
             user = new User({ userId: message.author.id });
             await user.save();
             console.log(`Created new user entry for ${message.author.tag}`);
             userDataContext = "New user, no data yet.";
        } else {
             const jobTitle = user.currentJob ? (message.client.config?.workProgression?.find(j => j.id === user.currentJob)?.title || 'Unknown Job') : 'Unemployed';
             userDataContext = `Level ${user.level} | ${user.coins} Coins | ${user.cookies} Cookies | ${user.warnings.length} Warnings | Job: ${jobTitle}`;
        }

        // 2. Manage and Format Conversation History
        const userId = message.author.id;
        let userHistory = conversationHistory.get(userId) || [];
        // Add current user message to history
        userHistory.push({ role: 'user', parts: [{ text: userPrompt }] });
        // Trim history if it exceeds max length (keeping newest)
        if (userHistory.length > MAX_HISTORY * 2) { // * 2 for user+model turns
            userHistory = userHistory.slice(-(MAX_HISTORY * 2));
        }
        conversationHistory.set(userId, userHistory); // Update map

        // Format history for the prompt string
        const historyString = userHistory.map(h => `${h.role === 'user' ? 'User' : 'Blecky'}: ${h.parts[0].text}`).join('\n');

        // 3. Prepare Prompt for Gemini
        const finalSystemInstruction = SYSTEM_INSTRUCTION
            .replace('{{USER_DATA}}', `User: ${message.author.tag} (${userDataContext})`)
            .replace('{{CONVERSATION_HISTORY}}', historyString || "No previous messages in this session.")
            .replace('{{USER_MESSAGE}}', userPrompt);

        // 4. Call AI using startChat for history management by the SDK
        // IMPORTANT: We send the *system prompt* conceptually, but the SDK handles history.
        // For models like flash that might not strongly use systemInstruction, embedding context near the latest message is key.
        const chat = model.startChat({
             history: userHistory.slice(0, -1), // Send all *previous* history
             // generationConfig: { maxOutputTokens: 500, temperature: 0.7 }, // Optional: Customize generation
             // safetySettings: [...] // Optional: Customize safety
              // Note: System prompt is implicitly part of the context now via finalSystemInstruction formatting strategy.
              // For newer SDK versions or models supporting explicit system roles, adjust accordingly.
        });

        // Send the LATEST user message (userPrompt) formatted within our custom system context string
        const result = await chat.sendMessage(finalSystemInstruction); // Send the combined context + latest query
        // Alternative for SDKs with clearer system prompt support:
        // const result = await model.generateContent({
        //     systemInstruction: { parts: [{ text: BASE_SYSTEM_PROMPT }] }, // Base prompt without dynamic parts
        //     contents: [ ...userHistory, { role: 'user', parts: [{ text: userPrompt }] } ] // Full history + new message
        // });


        // 5. Process AI Response
        const response = result.response;
        let aiTextResult = response.text();

        if (!aiTextResult) { // Handle cases where the response might be empty or blocked
            console.warn("Gemini returned empty response or potential block.", response.promptFeedback || '');
            aiTextResult = "I'm having trouble formulating a response right now. Could you try rephrasing?";
             // If blocked, add reason if available
            if (response.promptFeedback?.blockReason) {
                aiTextResult += ` (Reason: ${response.promptFeedback.blockReason})`;
            }
        }


        // 6. Parse AI Response for Actions
        let aiTextResponseForUser = aiTextResult;
        const actionsToPerform = [];
        const actionRegex = /\[ACTION:([A-Z_]+)\s*(.*?)\]$/i; // Only match if action is at the VERY END

        const match = aiTextResult.match(actionRegex);
        if (match) {
            const actionType = match[1].toUpperCase(); // Ensure uppercase for switch
            const actionArgs = match[2]?.trim();
            actionsToPerform.push({ type: actionType, args: actionArgs });
            // Remove the action tag from the text response shown to the user
            aiTextResponseForUser = aiTextResult.replace(match[0], '').trim();
        }

         // Add AI response to history BEFORE potential action failures interrupt
         // Ensure the text added is the cleaned one meant for the user
         userHistory.push({ role: 'model', parts: [{ text: aiTextResponseForUser || '(Performed an action)' }] }); // Add cleaned response or placeholder
         conversationHistory.set(userId, userHistory); // Update history map

        // 7. Send Text Response (if any)
        if (aiTextResponseForUser) {
            if (aiTextResponseForUser.length > 2000) {
                // Handle splitting logic if necessary
                await message.reply(aiTextResponseForUser.substring(0, 2000)).catch(console.error);
            } else {
                await message.reply(aiTextResponseForUser).catch(console.error);
            }
        } else if (actionsToPerform.length === 0) {
            await message.reply("Okay, consider it done (or I couldn't formulate a text response). 👍").catch(console.error);
        }

        // 8. Execute Parsed Actions
        for (const action of actionsToPerform) {
            await performAction(message, action.type, action.args);
        }

    } catch (error) {
        console.error("Error in messageCreate AI handler:", error);
         // Check if it's a Gemini-specific error (e.g., API key issue)
         if (error.message.includes('API key') || error.message.includes('permission')) {
             console.error("Potential API Key or permission issue with Gemini.");
             // Avoid sending API key errors to the channel
         }
        // Avoid replying if it might be a permissions issue sending the reply itself
         else if (error.code !== 50013) { // 50013 = Missing Permissions
            await message.reply("⚠️ Oops! Something went wrong while trying to process that with my AI core.").catch(console.error);
         }
         // Clear cooldown on error to allow retrying sooner
          aiCooldowns.delete(message.author.id);
    }
  },
};

// --- Helper: Perform Specific Bot Actions ---
async function performAction(message, actionType, actionArgs) {
     console.log(`AI requested action: ${actionType} with args: ${actionArgs}`); // Log requested action
    switch (actionType) {
        case 'SEND_GIF':
            if (actionArgs) {
                const gifUrl = await searchGiphyGif(actionArgs);
                 const DEFAULT_GIF = 'https://media.giphy.com/media/l4pTsh45Dg7ClzJny/giphy.gif'; // Ensure consistent default
                 // Only send if found and not default, unless default is acceptable
                 if (gifUrl && gifUrl !== DEFAULT_GIF) {
                    await message.channel.send(gifUrl).catch(console.error);
                 } else {
                     console.log(`Could not find suitable GIF for "${actionArgs}"`);
                     // Optionally notify channel if GIF fails
                     // await message.channel.send(`_(Blecky couldn't find a GIF for "${actionArgs}")_`).catch(console.error);
                 }
            } else {
                console.warn("SEND_GIF action requested without arguments.");
            }
            break;
        case 'SHOW_PROFILE':
            if (actionArgs) {
                 const targetMember = await findUserInGuild(message.guild, actionArgs);
                 if (targetMember) {
                     const targetUserId = targetMember.user ? targetMember.user.id : targetMember.id;
                     const targetData = await User.findOne({ userId: targetUserId });
                     const profileEmbed = new EmbedBuilder().setColor(0x00BFFF); // Deep Sky Blue
                     const displayName = targetMember.displayName || (targetMember.user ? targetMember.user.username : 'Unknown User');

                     if (targetData) {
                         const nextXp = getNextLevelXp ? getNextLevelXp(targetData.level) : 'N/A';
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
                         profileEmbed.setTitle(`📊 ${displayName}'s Mini-Profile`)
                             .setDescription("No economy/level data found for this user yet.");
                     }
                     await message.channel.send({ embeds: [profileEmbed] }).catch(console.error);
                 } else {
                     await message.channel.send(`Sorry, I couldn't find a user matching "${actionArgs}" in this server.`).catch(console.error);
                 }
            } else {
                console.warn("SHOW_PROFILE action requested without arguments.");
                 // Maybe default to showing the message author's profile?
                 // await performAction(message, actionType, message.author.id);
            }
            break;
        // Add more specific, safe actions here if needed
        // case 'CHECK_BOT_STATUS': ...
        default:
            console.warn(`AI requested an unknown or unsupported action: ${actionType}`);
             // Maybe send a message indicating the action isn't supported
             // await message.channel.send(`_(Blecky tried to perform an unsupported action: ${actionType})_`).catch(console.error);
    }
}
