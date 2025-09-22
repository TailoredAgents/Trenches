"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rootLogger = void 0;
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("@trenches/config");
const PID = process.pid;
const destination = pino_1.default.destination({
    sync: false
});
function resolveLevel(defaultLevel) {
    const cfg = (0, config_1.getConfig)();
    return process.env.LOG_LEVEL ?? cfg.logging.level ?? defaultLevel ?? 'info';
}
function createLogger(scope, options) {
    const level = resolveLevel(options?.level);
    const baseLogger = (0, pino_1.default)({
        level,
        base: { pid: PID, scope },
        formatters: {
            level: (label) => ({ level: label })
        },
        timestamp: pino_1.default.stdTimeFunctions.isoTime
    }, destination);
    return baseLogger;
}
exports.rootLogger = createLogger('root');
//# sourceMappingURL=index.js.map