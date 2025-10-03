#!/usr/bin/env node
const { existsSync } = require('fs');
const { spawnSync } = require('child_process');

const hasAudit = existsSync('tools/audit/audit-repo.ts');
if (!hasAudit) {
  console.log('audit:repo not present (skipping)');
  process.exit(0);
}
const res = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['audit:repo'], { stdio: 'inherit' });
process.exit(res.status === null ? 0 : res.status);
