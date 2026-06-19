#!/usr/bin/env node
// Portable local-Postgres control. Replaces the previous package.json scripts
// that used "%USERPROFILE%", which only expands in cmd.exe and breaks when npm
// runs scripts through PowerShell or Git Bash ("filename syntax incorrect").
// Resolves the home dir via os.homedir() so it works in any shell.
//
// Usage: node scripts/pg.mjs <start|stop|status>

import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const PORT = process.env.PGPORT || '5432';
const home = homedir();
const base = join(home, 'pglocal');
const pgCtl = join(base, 'pgsql', 'bin', process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
const dataDir = join(base, 'data');
const logFile = join(base, 'pg.log');

const action = (process.argv[2] || 'start').toLowerCase();

if (!existsSync(pgCtl)) {
  console.error(`pg_ctl not found at: ${pgCtl}`);
  console.error('Expected a local Postgres under ~/pglocal. Adjust scripts/pg.mjs if yours lives elsewhere.');
  process.exit(1);
}

const argsByAction = {
  start: ['-D', dataDir, '-l', logFile, '-o', `-p ${PORT}`, '-w', 'start'],
  stop: ['-D', dataDir, '-m', 'fast', 'stop'],
  status: ['-D', dataDir, 'status'],
};

const args = argsByAction[action];
if (!args) {
  console.error(`Unknown action "${action}". Use: start | stop | status`);
  process.exit(1);
}

// For start, skip if the server is already running (avoids a noisy log-file lock error).
if (action === 'start') {
  const check = spawnSync(pgCtl, ['-D', dataDir, 'status'], { stdio: 'ignore' });
  if (check.status === 0) {
    console.log(`Postgres already running on port ${PORT}.`);
    process.exit(0);
  }
}

const res = spawnSync(pgCtl, args, { stdio: 'inherit' });
process.exit(res.status ?? 1);
