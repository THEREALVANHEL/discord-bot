// events/messageCreate.js (Optional Enhancement - Added default system prompt)
const { Events } = require('discord.js');
const fetch = require('node-fetch'); // Ensure this is installed ('npm install node-fetch@2')

const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest'; // Use latest flash model if not specified
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Default system prompt for general mentions
const DEFAULT_SYSTEM_PROMPT = "You are Bleck Nephew, a helpful and slightly informal Discord bot assistant. Respond concisely and conversationally.";

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Basic checks first
    if (message.author.bot) return;
    if (!message.guild) return; // Ignore DMs for this handler
    if (message.content.startsWith('/')) return; // Ignore slash commands

    // Check if the bot was mentioned
    if (!message.mentions.has(message.client.user)) return;

    // Check for API Key
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set in environment variables.");
        // Avoid replying in channel about config issues unless necessary
        // await message.reply("⚠️ AI features are currently unavailable due to configuration issues.").catch(console.error);
        return;
    }

    const prompt = message.content.replace(/<@!?(\d+)>/g, '').trim(); // Remove all mentions
    if (!prompt) {
        // Only reply if the mention was the *only* content
        if (message.content.trim() === `<@${message.client.user.id}>` || message.content.trim() === `<@!${message.client.user.id}>`) {
            await message.reply("Yes? Mention me with a message if you'd like me to respond!").catch(console.error);
        }
        return;
    }

    try {
        await message.channel.sendTyping();

        // Pass the prompt and the default system instruction
        const aiResponse = await fetchGeminiResponse(prompt, DEFAULT_SYSTEM_PROMPT);

        // Split long messages
        if (aiResponse.length > 2000) {
            const chunks = aiResponse.match(/[\s\S]{1,2000}/g) || [];
            for (const chunk of chunks) {
                await message.reply(chunk).catch(console.error);
            }
        } else {
            await message.reply(aiResponse).catch(console.error);
        }

    } catch (error) {
        console.error("Error handling messageCreate event AI response:", error);
        await message.reply("⚠️ There was an error while generating my response. Please try again later.").catch(console.error);
    }
  },
};

/**
 * Fetches a text response from the Gemini API with retries and system prompt.
 */
async function fetchGeminiResponse(prompt, systemInstructionText) {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      console.log(`AI fetch attempt ${attempt} for prompt: "${prompt.substring(0, 50)}..."`);

      const payload = {
          contents: [
              { parts: [{ text: prompt }] }
          ],
          // ADDED System Instruction
          systemInstruction: {
              parts: [{ text: systemInstructionText }]
          },
          // Optional: Add safety settings or generation config if needed
          // safetySettings: [ ... ],
          // generationConfig: { ... },
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), // Use the structured payload
          timeout: 30000 // Add a timeout (e.g., 30 seconds)
        }
      );

      if (!response.ok) {
        let errorBody = {};
        try {
            errorBody = await response.json(); // Try to parse JSON error
        } catch {
             errorBody.message = await response.text(); // Fallback to text
        }
        const errorMessage = errorBody?.error?.message || errorBody.message || `Status ${response.status}`;
        console.error(`AI fetch failed [${response.status}]: ${errorMessage}`);

        // Handle specific errors
        if (response.status === 404) throw new Error(`Model '${AI_MODEL}' not found or API endpoint incorrect.`);
        if (response.status === 400) throw new Error(`Bad request to Gemini API: ${errorMessage}`);
        if (response.status === 429) { // Rate limit
            console.log("Rate limited, retrying with backoff...");
             // Continue to retry loop with backoff
        } else {
             throw new Error(`Gemini API returned status ${response.status}: ${errorMessage}`);
        }
      } else { // Response OK
          const data = await response.json();

          // Check for blocked content due to safety settings
          if (!data.candidates && data.promptFeedback?.blockReason) {
              console.warn(`AI response blocked due to safety settings: ${data.promptFeedback.blockReason}`);
              return `My response was blocked due to safety filters (${data.promptFeedback.blockReason}).`;
          }

          // Check standard response structure
          const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (!replyText) {
              console.error("Invalid or empty AI response structure:", JSON.stringify(data));
              throw new Error("Received an invalid or empty response from the AI.");
          }

          console.log(`AI fetch attempt ${attempt} succeeded.`);
          return replyText.trim(); // Trim whitespace
      }

    } catch (err) {
      console.error(`AI fetch attempt ${attempt} failed:`, err.message);
      if (attempt === MAX_RETRIES) {
        return "❌ I couldn't get a response from the AI after multiple attempts. There might be an issue with the AI service.";
      }
      // Exponential backoff: 1s, 2s, 4s...
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt -1) * 1000 + Math.random() * 500));
    }
  }
   // Should not be reached if MAX_RETRIES > 0, but as a fallback
   return "❌ An unexpected error occurred while contacting the AI service.";
}
