// utils/truncateText.js (REPLACED - Converted to CommonJS)

function truncateText(text, maxLength) {
    if (!text) return ''; // Handle null/undefined input
    if (text.length <= maxLength) {
        return text;
    }
    // Subtract 3 for the '...'
    return text.substring(0, maxLength - 3) + '...';
}

module.exports = { truncateText };
