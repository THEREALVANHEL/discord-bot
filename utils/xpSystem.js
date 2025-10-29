// utils/xpSystem.js (REPLACED - Converted to CommonJS)

const XP_COOLDOWN = 60000; // 1 minute cooldown (60000ms)
const generateXP = () => Math.floor(Math.random() * (25 - 10 + 1)) + 10; // 10-25 XP

module.exports = {
    XP_COOLDOWN,
    generateXP,
};
