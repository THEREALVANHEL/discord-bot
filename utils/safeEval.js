// utils/safeEval.js (REPLACED - Use mathjs for security)
// Note: Changed from 'export function' to 'module.exports' assuming CommonJS environment like the rest of the bot
const { evaluate } = require('mathjs');

function safeEval(expr) {
    try {
        // Configure evaluate to prevent potentially harmful functions if needed
        const limitedEvaluate = evaluate; // Use default evaluate for now, customize if needed

        const result = limitedEvaluate(expr);

        // Ensure the result is a type you expect (e.g., number or BigNumber)
        if (typeof result === 'object' && result.isBigNumber) {
            // Handle BigNumber if necessary, maybe convert to number if safe
            if (result.toNumber() > Number.MAX_SAFE_INTEGER || result.toNumber() < Number.MIN_SAFE_INTEGER) {
                // Potentially too large to represent safely as standard number
                return result.toString();
            }
            return result.toNumber();
        } else if (typeof result !== 'number' || !isFinite(result)) {
            // Check if it's a non-finite number or not a number at all
            throw new Error("Invalid or non-finite result.");
        }
        return result;
    } catch (error) {
        // Log the error for debugging?
        console.error(`safeEval error for expression "${expr}":`, error.message);
        throw new Error("Invalid math expression."); // Throw a generic error to the user
    }
}

module.exports = { safeEval }; // Export for CommonJS
