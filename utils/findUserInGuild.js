// utils/findUserInGuild.js (REPLACED - Converted to CommonJS, basic implementation)

// Finds a user based on various criteria.
async function findUserInGuild(guild, targetIdentifier) {
    if (!guild || !targetIdentifier) return null;

    // Try fetching by ID first
    if (/^\d{17,19}$/.test(targetIdentifier)) {
        try {
            const member = await guild.members.fetch(targetIdentifier);
            if (member) return member;
        } catch (e) { /* Ignore fetch error if ID not found */ }
    }

    // Try fetching by mention
     const mentionMatch = targetIdentifier.match(/^<@!?(\d{17,19})>$/);
     if (mentionMatch) {
         try {
             const member = await guild.members.fetch(mentionMatch[1]);
             if (member) return member;
         } catch (e) { /* Ignore fetch error */ }
     }


    // Try searching by username/nickname (case-insensitive)
     // This can be slow on large guilds
     try {
         const lowerIdentifier = targetIdentifier.toLowerCase();
         const members = await guild.members.fetch({ query: targetIdentifier.split('#')[0], limit: 10 }); // Fetch potential matches

         // Filter more precisely
         const matchedMember = members.find(m =>
             m.user.username.toLowerCase() === lowerIdentifier ||
             m.nickname?.toLowerCase() === lowerIdentifier ||
             m.user.tag.toLowerCase() === lowerIdentifier
         );
         if (matchedMember) return matchedMember;

         // Fallback: Check cache only for username#discriminator
         const cachedMember = guild.members.cache.find(m => m.user.tag.toLowerCase() === lowerIdentifier);
         if (cachedMember) return cachedMember;

     } catch (e) {
         console.error("Error searching members:", e);
     }


    return null; // Not found
}

module.exports = { findUserInGuild };
