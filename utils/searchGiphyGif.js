// utils/searchGiphyGif.js (REPLACED - Implemented Giphy Search)
const fetch = require('node-fetch'); // Ensure node-fetch@2 is installed
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
const DEFAULT_GIF = 'https://media.giphy.com/media/l4pTsh45Dg7ClzJny/giphy.gif'; // Fallback GIF

async function searchGiphyGif(term) {
    if (!GIPHY_API_KEY) {
        console.error("GIPHY_API_KEY not set in environment variables.");
        return DEFAULT_GIF;
    }
    if (!term || typeof term !== 'string' || term.trim() === '') {
        console.warn("searchGiphyGif called with invalid term.");
        return DEFAULT_GIF;
    }

    const searchTerm = encodeURIComponent(term.trim());
    // Using the Giphy search endpoint
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${searchTerm}&limit=5&offset=0&rating=g&lang=en`;

    try {
        const response = await fetch(url, { timeout: 10000 }); // 10 second timeout
        if (!response.ok) {
            console.error(`Giphy API error: ${response.status} ${response.statusText}`);
             const errorBody = await response.text();
             console.error("Giphy Error Body:", errorBody);
            return DEFAULT_GIF;
        }
        const json = await response.json();

        if (json.data && json.data.length > 0) {
            // Pick a random GIF from the first few results
            const randomIndex = Math.floor(Math.random() * json.data.length);
            const gifData = json.data[randomIndex];
            // Prefer a downsized or fixed_height version for Discord embeds
            const gifUrl = gifData.images?.fixed_height?.url
                        || gifData.images?.downsized?.url
                        || gifData.images?.original?.url;
            return gifUrl || DEFAULT_GIF;
        } else {
             console.log(`No Giphy results found for term: "${term}"`);
            return DEFAULT_GIF; // Return default if no results
        }
    } catch (error) {
        console.error("Error searching Giphy:", error);
        return DEFAULT_GIF; // Return default on any fetch error
    }
}

module.exports = { searchGiphyGif };
