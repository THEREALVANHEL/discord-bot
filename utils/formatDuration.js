// utils/formatDuration.js (REPLACED - Converted to CommonJS)
// Note: The 'ms' package you already use might be better for this

function formatDuration(ms) {
    if (ms < 0) ms = -ms; // Handle negative durations if necessary
    const time = {
        d: Math.floor(ms / 86400000),
        h: Math.floor(ms / 3600000) % 24,
        m: Math.floor(ms / 60000) % 60,
        s: Math.floor(ms / 1000) % 60,
    };
    // Create a string like "1d 2h 3m 4s"
    return Object.entries(time)
        .filter(val => val[1] !== 0)
        .map(([key, val]) => `${val}${key}`)
        .join(' ');
}

module.exports = { formatDuration };
