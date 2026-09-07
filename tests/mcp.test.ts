import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, SdkError, SdkErrorCode } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
import { EventEmitter, once } from 'node:events';
import { fixture, factorId, searchResult, detailResult } from './helpers.js';
test('built standalone MCP initializes/lists/calls using SDK; only two business tools', async () => {
  const f = await fixture();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('packages/ccdb-mcp/dist/main.mjs'), 'stdio'],
    env: {
      ...(process.env as Record<string, string>),
      CCDB_PROFILE: 'local',
      CCDB_API_BASE: f.base,
      CCDB_AGENT_WEB: f.base,
      CCDB_API_KEY: 'sk-cs-fixture-key',
    },
    stderr: 'pipe',
  });
  let log = '';
  transport.stderr?.on('data', (chunk) => {
    log += chunk;
  });
  const client = new Client({ name: 'integration-tests', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
      'get_emission_factor_detail',
      'search_emission_factors',
    ]);
    const search = await client.callTool({
      name: 'search_emission_factors',
      arguments: { query: '电力', limit: 5 },
    });
    assert.deepEqual(search.structuredContent, searchResult(f.base));
    assert.equal(search.isError, undefined);
    assert.deepEqual(JSON.parse((search.content as any)[0].text), search.structuredContent);
    const detail = await client.callTool({
      name: 'get_emission_factor_detail',
      arguments: { factorId },
    });
    assert.deepEqual(detail.structuredContent, detailResult(f.base));
    const invalid = await client.callTool({
      name: 'search_emission_factors',
      arguments: { query: '*' },
    });
    assert.equal(invalid.isError, true);
    await assert.rejects(client.callTool({ name: 'unknown', arguments: {} }), { code: -32602 });
    assert.equal(f.calls.length, 2);
    assert.ok(!log.includes('sk-cs-fixture-key'));
  } finally {
    await client.close();
    await f.close();
  }
});

test('stdio cancellation aborts the active upstream request and leaves the server usable', async () => {
  const events = new EventEmitter();
  let held = false;
  const f = await fixture((call, response) => {
    if (call.path.endsWith('/factors/search') && !held) {
      held = true;
      response.once('close', () => events.emit('closed'));
      events.emit('started');
      return true; // Intentionally hold the first response until cancellation.
    }
    return false;
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('packages/ccdb-mcp/dist/main.mjs'), 'stdio'],
    env: {
      ...(process.env as Record<string, string>),
      CCDB_PROFILE: 'local',
      CCDB_API_BASE: f.base,
      CCDB_AGENT_WEB: f.base,
      CCDB_API_KEY: 'sk-cs-fixture-key',
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'cancellation-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const started = once(events, 'started', { signal: AbortSignal.timeout(4000) });
    const closed = once(events, 'closed', { signal: AbortSignal.timeout(4000) });
    // Attach rejection handlers immediately, including when an earlier assertion fails.
    void started.catch(() => {});
    void closed.catch(() => {});
    const controller = new AbortController();
    const pending = client.callTool(
      { name: 'search_emission_factors', arguments: { query: 'electricity' } },
      { signal: controller.signal },
    );
    void pending.catch(() => {});
    await started;
    controller.abort();
    // SDK 2.0 wraps local cancellation as RequestTimeout with the abort reason.
    await assert.rejects(
      pending,
      (error: unknown) =>
        error instanceof SdkError &&
        error.code === SdkErrorCode.RequestTimeout &&
        error.message.includes('AbortError'),
    );
    await closed;
    assert.equal(f.calls.length, 1);
    assert.equal((await client.listTools()).tools.length, 2);
    const next = await client.callTool({
      name: 'get_emission_factor_detail',
      arguments: { factorId },
    });
    assert.deepEqual(next.structuredContent, detailResult(f.base));
    assert.equal(f.calls.length, 2);
  } finally {
    await client.close();
    await f.close();
  }
});
