const { Events } = require('discord.js');
const fetch = require('node-fetch');

const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      // Ignore bot messages and commands
      if (message.author.bot) return;
      if (message.content.startsWith('/')) return;

      // Mention trigger (bot responds only if mentioned)
      if (!message.mentions.has(message.client.user)) return;

      const prompt = message.content.replace(/<@!?(\d+)>/g, '').trim();
      if (!prompt) {
        await message.reply("Please mention me with a message you'd like me to respond to!");
        return;
      }

      await message.channel.sendTyping();

      const aiResponse = await fetchGeminiResponse(prompt);
      await message.reply(aiResponse);

    } catch (error) {
      console.error("Error handling messageCreate event:", error);
      await message.reply("⚠️ There was an error while generating my response. Please try again later.");
    }
  },
};

/**
 * Fetches a text response from the Gemini API with retries.
 */
async function fetchGeminiResponse(prompt) {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      attempt++;
      console.log(`AI fetch attempt ${attempt}...`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { parts: [{ text: prompt }] }
            ]
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI fetch failed [${response.status}]: ${errorText}`);

        // If model not found, stop retrying
        if (response.status === 404) throw new Error(`Model '${AI_MODEL}' not found at Gemini endpoint.`);

        throw new Error(`Gemini API returned status ${response.status}`);
      }

      const data = await response.json();
      const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!replyText) throw new Error("Invalid or empty AI response.");

      console.log(`AI fetch attempt ${attempt} succeeded ✅`);
      return replyText;

    } catch (err) {
      console.error(`AI fetch attempt ${attempt} failed:`, err.message);
      if (attempt === MAX_RETRIES) {
        return "❌ I couldn't get a response from Gemini after multiple attempts.";
      }
      await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
    }
  }
}
