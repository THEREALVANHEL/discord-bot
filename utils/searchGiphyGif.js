// utils/searchGiphyGif.js (REPLACED - Converted to CommonJS)
// Searches Giphy for a GIF URL.
// IMPORTANT: Requires GIPHY_API_KEY in .env and node-fetch

const fetch = require('node-fetch'); // Make sure node-fetch is installed
const GIPHY_API_KEY = process.env.GIPHY_API_KEY; // Add this to your .env

async function searchGiphyGif(term) {
    if (!GIPHY_API_KEY) {
        console.error("GIPHY_API_KEY not set in environment variables.");
        return 'https://media.giphy.com/media/l4pTsh45Dg7ClzJny/giphy.gif'; // Default on error
    }

    const searchTerm = encodeURIComponent(term);
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${searchTerm}&limit=1&offset=0&rating=g&lang=en`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Giphy API error: ${response.statusText}`);
        }
        const json = await response.json();
        if (json.data && json.data.length > 0) {
            // Prefer fixed height URL if available
            return json.data[0].images?.fixed_height?.url || json.data[0].images?.original?.url || 'https://media.giphy.com/media/l4pTsh45Dg7ClzJny/giphy.gif';
        } else {
            return 'https://media.giphy.com/media/l4pTsh45Dg7ClzJny/giphy.gif'; // Default if no results
        }
    } catch (error) {
        console.error("Error searching Giphy:", error);
        return 'https://media.giphy.com/media/l4pTsh45Dg7ClzJny/giphy.gif'; // Default on error
    }
}

module.exports = { searchGiphyGif };
