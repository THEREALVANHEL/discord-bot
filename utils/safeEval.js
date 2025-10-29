// utils/safeEval.js (Placeholder)
// Utility to safely evaluate math expressions.
export function safeEval(expr) {
    // WARNING: Using eval() directly is highly insecure. This is a placeholder.
    // The original code likely used a safer math library.
    const result = eval(expr);
    if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error("Invalid result.");
    }
    return result;
}
