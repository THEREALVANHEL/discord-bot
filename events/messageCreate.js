// events/messageCreate.js (REPLACED - Removed duplicate getNextLevelXp declaration)
const { Events, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch'); // Ensure node-fetch@2 is installed
const User = require('../models/User'); // Import User model
const { findUserInGuild } = require('../utils/findUserInGuild'); // Utility to find users by name/ID
const { searchGiphyGif } = require('../utils/searchGiphyGif'); // Import Giphy search
const { getNextLevelXp } = require('../utils/levelUtils'); // <-- IMPORT the function

const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TRIGGER_WORD = 'blecky'; // Word to trigger the AI

// --- AI System Instructions ---
const SYSTEM_INSTRUCTION = `You are Blecky Nephew, an advanced AI integrated into a Discord server. Your personality is helpful, knowledgeable, slightly informal, and aware of the server's context (economy, levels, commands).

Capabilities & Rules:
1.  **Conversational Response:** Engage in conversation, answer questions, provide information based on the context given and general knowledge.
2.  **Context Awareness:** Use the provided user data (level, coins, warnings, job) naturally in your responses where relevant.
3.  **Command Assistance:** If a user asks you to perform an action that corresponds to a known bot command (like warn, kick, profile, give coins, check balance, etc.), DO NOT try to execute it yourself. Instead, respond by explaining *how* the user can use the correct slash command. Provide the exact syntax, e.g., "To warn that user, you can use: \`/warn target: @User reason: [Your Reason]\`".
4.  **Action Requests:** You can request specific actions from the bot by including special tags in your response:
    * To send a GIF: Include "[ACTION:SEND_GIF keyword for GIF search]" (e.g., "[ACTION:SEND_GIF happy cat]"). The bot will find and send a relevant GIF *after* your text response. Use this sparingly for appropriate emotional expression or illustration.
    * To show a user's basic profile summary: Include "[ACTION:SHOW_PROFILE user mention or ID]" (e.g., "[ACTION:SHOW_PROFILE @OtherUser]"). The bot will fetch and display a mini-profile *after* your text.
5.  **Data Access:** You only have access to the user data provided in the prompt. You cannot directly query or modify the database.
6.  **Tone:** Maintain a helpful, friendly, and slightly witty tone appropriate for Discord. Use Discord markdown formatting (like *italics*, **bold**, \`code\`) where helpful. End casual responses with a fitting emoji.
7.  **Brevity:** Keep responses reasonably concise unless a detailed explanation is required.

User Data Provided: {{USER_DATA}}
User Message: {{USER_MESSAGE}}`;
// --- End AI System Instructions ---

// Cooldown management
const aiCooldowns = new Map();
const AI_COOLDOWN_MS = 5000; // 5 seconds cooldown per user

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Basic checks first
    if (message.author.bot) return;
    if (!message.guild) return; // Ignore DMs for this handler
    if (message.content.startsWith('/')) return; // Ignore slash commands

    // Trigger check (case-insensitive)
    const lowerContent = message.content.toLowerCase();
    if (!lowerContent.includes(TRIGGER_WORD)) return;

    // API Key Check
    if (!GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is not set. AI features disabled.");
        return; // Don't notify channel about config errors
    }

    // Cooldown Check
    const now = Date.now();
    const userCooldown = aiCooldowns.get(message.author.id);
    if (userCooldown && now < userCooldown) {
        // Optionally notify user they are on cooldown (can be spammy)
        // message.reply("Blecky is thinking... please wait a moment before asking again!").then(msg => setTimeout(() => msg.delete().catch(console.error), 3000)).catch(console.error);
        return;
    }
    aiCooldowns.set(message.author.id, now + AI_COOLDOWN_MS);


    // Clean the prompt - remove trigger word and mentions
    let userPrompt = message.content.replace(new RegExp(TRIGGER_WORD, 'gi'), '').replace(/<@!?(\d+)>/g, '').trim();
    if (!userPrompt) {
         // If only "blecky" was said, provide a simple response
         if (message.content.trim().toLowerCase() === TRIGGER_WORD) {
            await message.reply("Yes? How can I help? 😄").catch(console.error);
         }
         aiCooldowns.delete(message.author.id); // Reset cooldown if prompt was empty
         return;
    }


    try {
        await message.channel.sendTyping();

        // 1. Fetch User Data from DB
        let userDataContext = "No specific data available.";
        let user = await User.findOne({ userId: message.author.id });
        if (!user) {
             // Create a new user if they don't exist
             user = new User({ userId: message.author.id });
             await user.save();
             console.log(`Created new user entry for ${message.author.tag}`);
             userDataContext = "New user, no data yet.";
        } else {
             // Format user data for the AI prompt
             const jobTitle = user.currentJob ? (message.client.config.workProgression.find(j => j.id === user.currentJob)?.title || 'Unknown Job') : 'Unemployed';
             userDataContext = `Level ${user.level} | Coins: ${user.coins} | Cookies: ${user.cookies} | Warnings: ${user.warnings.length} | Current Job: ${jobTitle}`;
        }

        // 2. Prepare Prompt for Gemini
        const finalSystemInstruction = SYSTEM_INSTRUCTION
            .replace('{{USER_DATA}}', `User: ${message.author.tag} (${userDataContext})`)
            .replace('{{USER_MESSAGE}}', userPrompt); // Inject user message into system prompt for clarity

        // 3. Call AI
        const aiResult = await fetchGeminiResponse(userPrompt, finalSystemInstruction); // Pass user prompt AND system instruction

        // 4. Parse AI Response for Actions
        let aiTextResponse = aiResult;
        const actionsToPerform = [];
        const actionRegex = /\[ACTION:([A-Z_]+)\s*(.*?)\]/gi; // Regex to find actions

        let match;
        while ((match = actionRegex.exec(aiResult)) !== null) {
            const actionType = match[1];
            const actionArgs = match[2]?.trim();
            actionsToPerform.push({ type: actionType, args: actionArgs });
            // Remove the action tag from the text response shown to the user
            aiTextResponse = aiTextResponse.replace(match[0], '').trim();
        }

        // 5. Send Text Response (if any)
        if (aiTextResponse) {
            // Split long messages
            if (aiTextResponse.length > 2000) {
                const chunks = aiTextResponse.match(/[\s\S]{1,2000}/g) || [];
                for (const chunk of chunks) {
                    await message.reply(chunk).catch(console.error);
                }
            } else {
                await message.reply(aiTextResponse).catch(console.error);
            }
        } else if (actionsToPerform.length === 0) {
            // If AI gave no text and no actions, provide a fallback
            await message.reply("I processed that, but didn't have anything specific to add! 🤔").catch(console.error);
        }

        // 6. Execute Parsed Actions
        for (const action of actionsToPerform) {
            switch (action.type) {
                case 'SEND_GIF':
                    if (action.args) {
                        const gifUrl = await searchGiphyGif(action.args);
                        const DEFAULT_GIF = 'https://media.giphy.com/media/l4pTsh45Dg7ClzJny/giphy.gif'; // Ensure default is defined or imported
                         if (gifUrl !== DEFAULT_GIF) { // Avoid sending default if search fails unless desired
                            await message.channel.send(gifUrl).catch(console.error);
                         } else {
                             console.log(`Could not find suitable GIF for "${action.args}"`);
                         }
                    }
                    break;
                case 'SHOW_PROFILE':
                    if (action.args) {
                         const targetMember = await findUserInGuild(message.guild, action.args);
                         if (targetMember) {
                             // Use targetMember.user.id or targetMember.id depending on what findUserInGuild returns
                             const targetUserId = targetMember.user ? targetMember.user.id : targetMember.id;
                             const targetData = await User.findOne({ userId: targetUserId });
                             const profileEmbed = new EmbedBuilder().setColor(0xADD8E6); // Light Blue
                             const displayName = targetMember.displayName || (targetMember.user ? targetMember.user.username : 'Unknown User');


                             if (targetData) {
                                 const nextXp = getNextLevelXp ? getNextLevelXp(targetData.level) : 'N/A'; // Use imported function
                                 profileEmbed.setTitle(`📊 ${displayName}'s Mini-Profile`)
                                     .addFields(
                                         { name: 'Level', value: `${targetData.level}`, inline: true },
                                         { name: 'XP', value: `${targetData.xp} / ${nextXp}`, inline: true },
                                         { name: 'Coins', value: `${targetData.coins} 💰`, inline: true },
                                         { name: 'Cookies', value: `${targetData.cookies} 🍪`, inline: true },
                                         { name: 'Warnings', value: `${targetData.warnings?.length || 0}`, inline: true }
                                     );
                             } else {
                                 profileEmbed.setTitle(`📊 ${displayName}'s Mini-Profile`)
                                     .setDescription("No economy/level data found for this user yet.");
                             }
                             await message.channel.send({ embeds: [profileEmbed] }).catch(console.error);
                         } else {
                             await message.channel.send(`Could not find a user matching "${action.args}" in this server.`).catch(console.error);
                         }
                    }
                    break;
                // Add more cases for other hardcoded actions here
                default:
                    console.warn(`Unknown AI action requested: ${action.type}`);
            }
        }

    } catch (error) {
        console.error("Error in messageCreate AI handler:", error);
         if (error.code !== 50013) { // 50013 = Missing Permissions
            await message.reply("⚠️ Oops! Something went wrong while processing that with Blecky.").catch(console.error);
         }
    }
  },
};

// --- Helper: Fetch Gemini Response ---
async function fetchGeminiResponse(prompt, systemInstructionText) {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      console.log(`AI fetch attempt ${attempt} for prompt: "${prompt.substring(0, 50)}..."`);

      const payload = {
          contents: [ { role: "user", parts: [{ text: prompt }] } ],
          systemInstruction: { role: "system", parts: [{ text: systemInstructionText }] },
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          timeout: 45000
        }
      );

      if (!response.ok) {
        let errorBody = {};
        try { errorBody = await response.json(); }
        catch { errorBody.message = await response.text(); }
        const errorMessage = errorBody?.error?.message || errorBody.message || `Status ${response.status}`;
        console.error(`AI fetch failed [${response.status}]: ${errorMessage}`);

        if (response.status === 404) throw new Error(`Model '${AI_MODEL}' not found or API endpoint incorrect.`);
        if (response.status === 400) throw new Error(`Bad request to Gemini API: ${errorMessage}`);
        if (response.status === 429) console.log("Rate limited, retrying with backoff...");
        else throw new Error(`Gemini API returned status ${response.status}: ${errorMessage}`);
      } else {
          const data = await response.json();

          if (!data.candidates && data.promptFeedback?.blockReason) {
              console.warn(`AI response blocked: ${data.promptFeedback.blockReason}`);
              return `My response was blocked due to safety filters (${data.promptFeedback.blockReason}).`;
          }
          if (data.candidates?.[0]?.finishReason && data.candidates[0].finishReason !== 'STOP') {
               console.warn(`AI response finished unexpectedly: ${data.candidates[0].finishReason}`);
               if (data.candidates[0].finishReason === 'SAFETY') { return `My response was stopped due to safety filters.`; }
          }

          const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (replyText === undefined || replyText === null) {
              console.error("Invalid AI response structure (text missing):", JSON.stringify(data));
              throw new Error("Received an invalid response structure from the AI.");
          }

          console.log(`AI fetch attempt ${attempt} succeeded.`);
          return replyText.trim();
      }

    } catch (err) {
      console.error(`AI fetch attempt ${attempt} failed:`, err.message);
      if (attempt === MAX_RETRIES) {
        return "❌ I couldn't get a response from the AI after multiple attempts. There might be an issue with the AI service.";
      }
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000 + Math.random() * 500));
    }
  }
   return "❌ An unexpected error occurred while contacting the AI service.";
}

// --- REMOVED LOCAL getNextLevelXp function ---
// // Helper: Get Next Level XP (Example - ensure this matches your leveling system)
// function getNextLevelXp(level) {
//      // Using the 'Moderate' formula from profile.js/addxp.js
//      return Math.floor(100 * Math.pow(level + 1, 1.5));
// }
