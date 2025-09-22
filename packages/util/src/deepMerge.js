"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepMerge = deepMerge;
function deepMerge(target, source) {
    const output = Array.isArray(target) ? [...target] : { ...target };
    if (!source)
        return output;
    for (const [key, value] of Object.entries(source)) {
        if (Array.isArray(value)) {
            output[key] = Array.isArray(output[key]) ? [...output[key], ...value] : [...value];
        }
        else if (value && typeof value === 'object') {
            output[key] = deepMerge((output[key] && typeof output[key] === 'object' ? output[key] : {}), value);
        }
        else {
            output[key] = value;
        }
    }
    return output;
}
//# sourceMappingURL=deepMerge.js.map