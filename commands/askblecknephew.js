const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Helper function for exponential backoff (for API resilience)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// System instructions for the two modes
const systemPrompts = {
    chill: {
        instruction: "You are Bleck Nephew, a friendly, chill, and slightly snarky digital companion. Respond concisely in a conversational and humorous tone, focusing on lighthearted topics, pop culture, or casual advice. Do not be overly formal or academic. End your responses with a casual emoji.",
        emoji: '😎',
        color: 0x00A86B, // Emerald Green
        search: false,
    },
    sensei: {
        instruction: "You are Bleck Nephew, the 'Sensei' mode AI. Act as a world-class academic tutor and research assistant. Your purpose is to provide thorough, well-structured, and accurate information for study and academic queries. Use precise language and ensure the content is grounded in real-time information using the search tool.",
        emoji: '🧠',
        color: 0x8A2BE2, // Blue Violet
        search: true, // Enable Google Search grounding
    },
};

// The API key is sourced from process.env.GEMINI_API_KEY
// IMPORTANT: The variable is sourced from the environment, but the value is appended to the URL as per the prompt instructions.
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";
const API_KEY = process.env.GEMINI_API_KEY || "";


/**
 * Fetches data from the Gemini API with exponential backoff for resilience.
 */
async function fetchWithRetry(url, payload, maxRetries = 5) {
    let lastError = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const fullUrl = url + API_KEY;
            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // If it's a rate limit (429) or other API error, throw and retry
                const errorBody = await response.json().catch(() => ({}));
                throw new Error(`API error: ${response.status} - ${errorBody.error?.message || response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                const delayMs = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await delay(delayMs); // Exponential backoff
            } else {
                console.error(`Max retries reached. Last error: ${error.message}`);
            }
        }
    }
    throw lastError; // Re-throw the last error if all retries fail
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('askblecknephew')
    .setDescription('Ask Bleck Nephew (AI) a question in Chill or Sensei mode.')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Choose the personality mode.')
        .setRequired(true)
        .addChoices(
          { name: 'Chill Mode (Casual, Fun)', value: 'chill' },
          { name: 'Sensei Mode (Academic, Research)', value: 'sensei' }
        ))
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Your question or prompt for the AI.')
        .setRequired(true)),
  
  async execute(interaction) {
    const mode = interaction.options.getString('mode');
    const userQuery = interaction.options.getString('query');
    const selectedMode = systemPrompts[mode];
    
    if (!selectedMode) {
        return interaction.reply({ content: '❌ **Error:** Invalid mode selected.', ephemeral: true });
    }
    
    if (API_KEY === "") {
        return interaction.reply({ content: '❌ **Error:** The `GEMINI_API_KEY` environment variable is not set. Please configure it to use this command.', ephemeral: true });
    }

    // Defer the reply as the API call can take time
    await interaction.deferReply(); 

    try {
        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: {
                parts: [{ text: selectedMode.instruction }]
            },
        };
        
        // Add tools for search grounding if in Sensei mode
        if (selectedMode.search) {
            payload.tools = [{ "google_search": {} }];
        }

        const result = await fetchWithRetry(GEMINI_API_URL, payload);

        const candidate = result.candidates?.[0];
        let aiText = "⚠️ I could not generate a response. The AI model returned an empty result.";
        let sources = [];
        let finalColor = selectedMode.color;

        if (candidate && candidate.content?.parts?.[0]?.text) {
          aiText = candidate.content.parts[0].text;
          
          // Extract grounding sources
          const groundingMetadata = candidate.groundingMetadata;
          if (groundingMetadata && groundingMetadata.groundingAttributions) {
              sources = groundingMetadata.groundingAttributions
                  .map(attribution => ({
                      uri: attribution.web?.uri,
                      title: attribution.web?.title,
                  }))
                  .filter(source => source.uri && source.title)
                  .slice(0, 3); // Limit to first 3 unique sources
          }
        } else if (result.error) {
            aiText = `❌ **API Error:** ${result.error.message || 'Unknown error during generation.'}`;
            finalColor = 0xFF0000;
        }

        let footerText = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} | Asked by: ${interaction.user.tag}`;
        
        const embed = new EmbedBuilder()
            .setTitle(`${selectedMode.emoji} Bleck Nephew: ${mode.toUpperCase()} Mode`)
            .setDescription(aiText)
            .addFields(
                { name: 'Your Query', value: `> ${userQuery.substring(0, 1020)}`, inline: false }
            )
            .setColor(finalColor)
            .setTimestamp()
            .setFooter({ text: footerText });
            
        if (sources.length > 0) {
             const sourcesField = sources.map((s, i) => 
                 `[${s.title.substring(0, 60)}...](<${s.uri}>)`
             ).join('\n');
             embed.addFields({ name: '📚 Grounding Sources', value: sourcesField, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Gemini API execution error:', error);
      await interaction.editReply({ 
        content: `❌ **AI System Error:** The AI service encountered a serious problem. Details: \`${error.message.substring(0, 150)}\``, 
        ephemeral: false 
      });
    }
  },
}
