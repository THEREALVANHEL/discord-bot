// utils/findUserInGuild.js (REPLACED - Improved Search Order + Display Name)
const { GuildMember } = require('discord.js'); // For type hinting (optional)

/**
 * Finds a GuildMember based on mention, ID, username#discriminator, username, or display name (nickname).
 * @param {import('discord.js').Guild} guild The guild to search in.
 * @param {string} targetIdentifier The identifier (mention, ID, name, nickname).
 * @returns {Promise<GuildMember|null>} The found GuildMember or null.
 */
async function findUserInGuild(guild, targetIdentifier) {
    if (!guild || !targetIdentifier) return null;

    targetIdentifier = targetIdentifier.trim(); // Remove leading/trailing whitespace

    // 1. Try fetching by mention (<@...> or <@!...>)
    const mentionMatch = targetIdentifier.match(/^<@!?(\d{17,19})>$/);
    if (mentionMatch) {
        try {
            const member = await guild.members.fetch(mentionMatch[1]);
            if (member) return member;
        } catch (e) { /* Ignore fetch error if ID from mention not found */ }
    }

    // 2. Try fetching by ID
    if (/^\d{17,19}$/.test(targetIdentifier)) {
        try {
            const member = await guild.members.fetch(targetIdentifier);
            if (member) return member;
        } catch (e) { /* Ignore fetch error if ID not found */ }
    }

    // --- Search by Name (requires fetching members or using cache) ---
    // Make search case-insensitive
    const lowerIdentifier = targetIdentifier.toLowerCase();

    // 3. Try searching cache by username#discriminator (Exact tag match)
    let foundMember = guild.members.cache.find(m => m.user.tag.toLowerCase() === lowerIdentifier);
    if (foundMember) return foundMember;

    // 4. Try searching cache by username (Case-insensitive)
    foundMember = guild.members.cache.find(m => m.user.username.toLowerCase() === lowerIdentifier);
    if (foundMember) return foundMember;

    // 5. Try searching cache by display name (nickname) (Case-insensitive)
    foundMember = guild.members.cache.find(m => m.displayName.toLowerCase() === lowerIdentifier);
    if (foundMember) return foundMember;

    // 6. If not found in cache, try fetching with query (less reliable, searches username/nickname startsWith)
    try {
         // console.log(`Searching via fetch query for: ${targetIdentifier}`); // Optional debug log
        const fetchedMembers = await guild.members.search({ query: targetIdentifier, limit: 10 });

        // Filter fetched results more precisely
        const matchedMember = fetchedMembers.find(m =>
            m.user.tag.toLowerCase() === lowerIdentifier || // Exact tag
            m.user.username.toLowerCase() === lowerIdentifier || // Exact username
            m.displayName.toLowerCase() === lowerIdentifier // Exact display name
        );
        if (matchedMember) return matchedMember;

        // If still no exact match from fetched, maybe return the first result if only one? (Optional, can be ambiguous)
        // if (fetchedMembers.size === 1) return fetchedMembers.first();

    } catch (e) {
        console.error("Error searching members via API:", e);
    }

    return null; // Not found after all attempts
}

module.exports = { findUserInGuild };
