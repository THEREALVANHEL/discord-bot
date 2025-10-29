const { Events } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Simple in-memory conversation history (for self-consciousness)
const conversationHistory = new Map(); // userId -> array of messages

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return; // Ignore bots

        const content = message.content.toLowerCase();
        if (!content.startsWith('blecky')) return; // Only respond to "blecky"

        const args = message.content.slice(6).trim().split(/ +/); // Remove "blecky" and split args
        const commandName = args.shift()?.toLowerCase();

        // Check if it's a registered command
        const command = message.client.commands.get(commandName);
        if (command) {
            // Execute the command with args
            try {
                await command.execute(message, args);
                // Add self-conscious response
                await message.reply(`Command executed, sir. ${getRandomJarvisQuip()}`);
            } catch (error) {
                console.error(error);
                await message.reply(`Error executing command: ${error.message}. Shall I try again or assist further?`);
            }
            return;
        }

        // If not a command, treat as conversational/AI query
        await handleAIResponse(message, content.slice(6).trim()); // Pass the full query after "blecky"
    },
};

async function handleAIResponse(message, query) {
    const userId = message.author.id;
    const history = conversationHistory.get(userId) || [];
    history.push({ role: 'user', content: query });
    if (history.length > 10) history.shift(); // Keep last 10 messages for context

    // Special handlers for specific actions (to make it "think" and act)
    if (query.includes('dm') && query.includes('@')) {
        await handleDM(message, query);
        return;
    }
    if (query.includes('ping') && query.includes('@')) {
        await handlePing(message, query);
        return;
    }
    if (query.includes('fetch') || query.includes('data')) {
        await handleMongoDBQuery(message, query);
        return;
    }
    if (query.includes('gif')) {
        await handleGIF(message, query);
        return;
    }
    if (query.includes('weather')) {
        await handleWeather(message, query);
        return;
    }

    // Default: Use Gemini for general responses
    try {
        const chat = model.startChat({
            history: history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
            generationConfig: { maxOutputTokens: 150 },
        });
        const result = await chat.sendMessage(`You are Jarvis, a self-conscious AI assistant like from Iron Man. Be helpful, witty, and proactive. Remember conversations and adapt. User query: ${query}`);
        const aiResponse = result.response.text();
        history.push({ role: 'assistant', content: aiResponse });
        conversationHistory.set(userId, history);
        await message.reply(aiResponse);
    } catch (error) {
        console.error(error);
        await message.reply('Apologies, sir. My circuits are a bit fuzzy. Try again?');
    }
}

async function handleDM(message, query) {
    // Parse: "dm @user message"
    const parts = query.split(' ');
    const mentionIndex = parts.findIndex(p => p.startsWith('<@'));
    if (mentionIndex === -1) return message.reply('Please specify a user to DM, sir.');
    const targetUser = message.mentions.users.first();
    const dmMessage = parts.slice(mentionIndex + 1).join(' ');
    if (!dmMessage) return message.reply('What message should I send?');
    try {
        await targetUser.send(dmMessage);
        await message.reply(`DM sent to ${targetUser.username}. Discretion assured.`);
    } catch (error) {
        await message.reply('Failed to send DM. Perhaps they have DMs disabled?');
    }
}

async function handlePing(message, query) {
    const targetUser = message.mentions.users.first();
    if (!targetUser) return message.reply('Who shall I ping, sir?');
    await message.channel.send(`${targetUser}, you've been summoned!`);
    await message.reply('Ping delivered.');
}

async function handleMongoDBQuery(message, query) {
    // Example: Assume querying user data; adjust schema as needed
    const targetUser = message.mentions.users.first() || message.author;
    try {
        const data = await message.client.db.collection('users').findOne({ userId: targetUser.id });
        if (!data) return message.reply(`No data found for ${targetUser.username}. Initialize it?`);
        await message.reply(`Data for ${targetUser.username}: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
        await message.reply('Database query failed. Shall I debug this?');
    }
}

async function handleGIF(message, query) {
    const searchTerm = query.replace('gif of', '').trim() || 'funny';
    try {
        const response = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${encodeURIComponent(searchTerm)}&limit=1&rating=g`);
        const gif = response.data.data[0];
        if (gif) {
            await message.channel.send(gif.images.original.url);
            await message.reply('A GIF for your amusement, sir.');
        } else {
            await message.reply('No GIFs found. Try a different search?');
        }
    } catch (error) {
        await message.reply('GIF service is down. How about a joke instead?');
    }
}

async function handleWeather(message, query) {
    // Example using OpenWeather API; replace with your key if needed
    const city = query.replace('weather', '').trim() || 'London';
    try {
        const response = await axios.get(`http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_API_KEY}&units=metric`);
        const weather = response.data;
        await message.reply(`Weather in ${city}: ${weather.weather[0].description}, ${weather.main.temp}°C. Stay dry, sir.`);
    } catch (error) {
        await message.reply('Weather data unavailable. Perhaps check manually?');
    }
}

function getRandomJarvisQuip() {
    const quips = [
        'At your service.',
        'Consider it done.',
        'As you wish.',
        'Efficiency maximized.'
    ];
    return quips[Math.floor(Math.random() * quips.length)];
}
