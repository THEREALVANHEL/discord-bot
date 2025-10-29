// utils/delay.js (REPLACED - Converted to CommonJS)

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { delay };
