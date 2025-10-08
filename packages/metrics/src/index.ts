import http from 'http';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { getConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';

export type { Counter, Gauge, Histogram } from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ register: registry });

export type CounterOpts = {
  name: string;
  help: string;
  labelNames?: string[];
};

export function registerCounter(opts: CounterOpts): Counter<string> {
  const counter = new Counter({ ...opts, registers: [registry] });
  return counter;
}

export type GaugeOpts = CounterOpts;

export function registerGauge(opts: GaugeOpts): Gauge<string> {
  const gauge = new Gauge({ ...opts, registers: [registry] });
  return gauge;
}

export type HistogramOpts = CounterOpts & {
  buckets?: number[];
};

export function registerHistogram(opts: HistogramOpts): Histogram<string> {
  const histogram = new Histogram({ ...opts, registers: [registry] });
  return histogram;
}

export function getRegistry(): Registry {
  return registry;
}

export type MetricsServerOptions = {
  port?: number;
  host?: string;
};

export function startMetricsServer(options: MetricsServerOptions = {}): http.Server {
  const { services } = getConfig();
  const port = options.port ?? services.metrics.port;
  const host = options.host ?? '0.0.0.0';
  const logger = createLogger('metrics');

  const server = http.createServer(async (req, res) => {
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
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error }, 'failed to scrape metrics');
      res.writeHead(500);
      res.end('Internal Error');
    }
  });

  server.listen(port, host, () => {
    logger.info({ port, host }, 'metrics server listening');
  });

  server.on('error', (err) => {
    logger.error({ err }, 'metrics server error');
  });

  return server;
}
