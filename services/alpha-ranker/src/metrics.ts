import { registerCounter, registerGauge } from '@trenches/metrics';

export const lunarcrushLastEventTs = registerGauge({
  name: 'alpha_lunarcrush_last_event_ts',
  help: 'Unix timestamp when AlphaRanker last ingested a LunarCrush signal'
});

export const lunarcrushEventsTotal = registerCounter({
  name: 'alpha_lunarcrush_events_total',
  help: 'Total LunarCrush signal events ingested by AlphaRanker'
});

export const lunarcrushErrorsTotal = registerCounter({
  name: 'alpha_lunarcrush_errors_total',
  help: 'Total LunarCrush stream errors observed by AlphaRanker'
});

export const lunarcrushActiveTopics = registerGauge({
  name: 'alpha_lunarcrush_active_topics',
  help: 'Count of cached LunarCrush topic signals'
});

export const lunarcrushActiveSymbols = registerGauge({
  name: 'alpha_lunarcrush_active_symbols',
  help: 'Count of cached LunarCrush symbol signals'
});
