// utils/levelSystem.js (Placeholder)
// Mock implementation to simplify leveling check
export function generateUserLevel(user) {
    // Check if user should level up based on the hardcoded formula in /commands/work.js
    const getNextLevelXp = (level) => Math.floor(150 * Math.pow(level + 1, 1.8));
    const nextLevelXp = getNextLevelXp(user.level);
    
    let leveledUp = false;
    while (user.xp >= nextLevelXp) {
        user.level++;
        user.xp -= nextLevelXp;
        leveledUp = true;
    }
    return leveledUp;
}
