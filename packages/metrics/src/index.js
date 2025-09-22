"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCounter = registerCounter;
exports.registerGauge = registerGauge;
exports.registerHistogram = registerHistogram;
exports.getRegistry = getRegistry;
exports.startMetricsServer = startMetricsServer;
const http_1 = __importDefault(require("http"));
const prom_client_1 = require("prom-client");
const config_1 = require("@trenches/config");
const logger_1 = require("@trenches/logger");
const registry = new prom_client_1.Registry();
(0, prom_client_1.collectDefaultMetrics)({ register: registry });
function registerCounter(opts) {
    const counter = new prom_client_1.Counter({ ...opts, registers: [registry] });
    return counter;
}
function registerGauge(opts) {
    const gauge = new prom_client_1.Gauge({ ...opts, registers: [registry] });
    return gauge;
}
function registerHistogram(opts) {
    const histogram = new prom_client_1.Histogram({ ...opts, registers: [registry] });
    return histogram;
}
function getRegistry() {
    return registry;
}
function startMetricsServer() {
    const { services } = (0, config_1.getConfig)();
    const port = services.metrics.port;
    const logger = (0, logger_1.createLogger)('metrics');
    const server = http_1.default.createServer(async (req, res) => {
        if (!req.url) {
            res.writeHead(400);
            res.end('Bad Request');
            return;
        }
        if (req.url !== '/metrics') {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        try {
            const metrics = await registry.metrics();
            res.writeHead(200, { 'Content-Type': registry.contentType });
            res.end(metrics);
        }
        catch (err) {
            const error = err;
            logger.error({ err: error }, 'failed to scrape metrics');
            res.writeHead(500);
            res.end('Internal Error');
        }
    });
    server.listen(port, () => {
        logger.info({ port }, 'metrics server listening');
    });
    server.on('error', (err) => {
        logger.error({ err }, 'metrics server error');
    });
    return server;
}
//# sourceMappingURL=index.js.map