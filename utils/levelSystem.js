// utils/levelSystem.js (REPLACED - Converted to CommonJS, assuming placeholder)

// Mock implementation to simplify leveling check
function generateUserLevel(user) {
    // Use the moderate formula
    const getNextLevelXp = (level) => Math.floor(100 * Math.pow(level + 1, 1.5));

    let leveledUp = false;
     // Need to check repeatedly in case of multiple level ups
     let nextLevelXp = getNextLevelXp(user.level);
     while (user.xp >= nextLevelXp) {
         user.level++;
         user.xp -= nextLevelXp;
         leveledUp = true;
         nextLevelXp = getNextLevelXp(user.level); // Recalculate for the new level
     }

    // This function only checks, it doesn't save or send messages.
    // The calling code (e.g., messageCreate or commands) should handle saving and notifications.
    return leveledUp;
}

module.exports = { generateUserLevel };
