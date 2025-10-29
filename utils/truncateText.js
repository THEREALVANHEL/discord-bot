// utils/truncateText.js
export function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }
    // Subtract 3 for the '...'
    return text.substring(0, maxLength - 3) + '...';
}
