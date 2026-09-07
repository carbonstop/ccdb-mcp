import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('MCP owns help and status commands without a CLI installation', () => {
  const executable = resolve('packages/ccdb-mcp/dist/main.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'ccdb-mcp-commands-'));
  const env = {
    ...process.env,
    CCDB_PROFILE: 'local',
    CCDB_CONFIG_DIR: directory,
    CCDB_AUTH_STORE: 'file',
    CCDB_API_KEY: 'fixture-mcp-secret',
  };
  const help = spawnSync(process.execPath, [executable, '--help'], { env, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /login/);
  const status = spawnSync(process.execPath, [executable, 'status', '--json'], {
    env,
    encoding: 'utf8',
  });
  assert.equal(status.status, 0, status.stderr);
  assert.doesNotThrow(() => JSON.parse(status.stdout));
  assert.ok(!(status.stdout + status.stderr).includes(env.CCDB_API_KEY));
});
