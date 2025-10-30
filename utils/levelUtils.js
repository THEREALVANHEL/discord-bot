// utils/levelUtils.js (REWORK - Moderate Formula)

// Function to calculate XP needed for the next level (MODERATE formula)
const getNextLevelXp = (level) => {
    // Ensure level is not negative
    const currentLevel = Math.max(0, level);
    // Formula: 100 * (level + 1)^1.5
    return Math.floor(100 * Math.pow(currentLevel + 1, 1.5));
};

module.exports = {
    getNextLevelXp,
};
