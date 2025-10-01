#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

const r = spawnSync('pnpm', ['ope', '--from', '2025-01-01', '--to', '2025-01-02', '--policy', 'fee'], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);

