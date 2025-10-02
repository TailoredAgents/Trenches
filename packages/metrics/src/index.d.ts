import http from 'http';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
export type { Counter, Gauge, Histogram } from 'prom-client';
export type CounterOpts = {
    name: string;
    help: string;
    labelNames?: string[];
};
export declare function registerCounter(opts: CounterOpts): Counter<string>;
export type GaugeOpts = CounterOpts;
export declare function registerGauge(opts: GaugeOpts): Gauge<string>;
export type HistogramOpts = CounterOpts & {
    buckets?: number[];
};
export declare function registerHistogram(opts: HistogramOpts): Histogram<string>;
export declare function getRegistry(): Registry;
export declare function startMetricsServer(): http.Server;
