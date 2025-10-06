#!/usr/bin/env tsx
import { getLunarSummary } from '@trenches/persistence';

const windowMinutes = Number(process.env.LUNAR_SMOKE_WINDOW ?? 60);
const summary = getLunarSummary(windowMinutes);
console.log('lunar-smoke', summary);

