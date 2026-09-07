import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createHttpApplication, type HttpConfig } from '../packages/ccdb-mcp/src/http.js';
import { verifyExecutionContext } from '../packages/ccdb-mcp/src/execution-context.js';
import { fixture, searchResult } from './helpers.js';
const key = randomBytes(32),
  resource = 'http://127.0.0.1:3400/mcp/ccdb';
test('Java-signed internal context interoperates with Node without Long precision loss', async () => {
  // Exported by CcdbMcpContextInteropTest: fixed test key and a token expired in 2023, never a real credential.
  const fixture = JSON.parse(
    await readFile(new URL('./fixtures/java-execution-context.json', import.meta.url), 'utf8'),
  );
  const keys = { [fixture.kid]: Buffer.from(fixture.key, 'base64') };
  const claims = verifyExecutionContext(fixture.ticket, keys, fixture.resource, fixture.now);
  assert.equal(claims.userId, '9007199254740993');
  assert.equal(claims.companyId, '9223372036854775806');
  assert.equal(claims.authType, 'API_KEY');
  assert.equal(typeof claims.keyVersion, 'string');
  assert.equal(claims.keyVersion!.length, 64);
  assert.throws(() => verifyExecutionContext(fixture.ticket, keys, fixture.resource));
});
function ticket(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'ccdb-gateway',
    aud: 'ccdb-mcp-execution',
    iat: now,
    exp: now + 60,
    jti: 'fixture-ticket-unique',
    sourceResource: resource,
    requestId: 'request-test',
    userId: '100',
    companyId: '200',
    clientIp: '127.0.0.1',
    authType: 'OAUTH',
    clientId: 'fixture',
    grantId: 'grant-100',
    grantVersion: 1,
    scopes: ['ccdb.factor.search', 'ccdb.factor.read'],
    ...overrides,
  };
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'v1' })).toString(
      'base64url',
    ),
    body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${head}.${body}.${createHmac('sha256', key)
    .update(`${head}.${body}`)
    .digest('base64url')}`;
}
function settings(endpoint: string): HttpConfig {
  return {
    resource,
    endpoint,
    keys: { v1: key },
    hosts: ['127.0.0.1:3400'],
    origins: [],
    timeoutMs: 5000,
    maxConcurrent: 10,
    host: '127.0.0.1',
    port: 3400,
  };
}
function request(method: string, args: unknown = {}, auth: string | null = ticket()) {
  return new Request(resource, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
      ...(auth ? { 'X-CCDB-Execution-Context': auth } : {}),
      Authorization: 'Bearer external-token-must-not-forward',
      'X-API-Key': 'external-key-must-not-forward',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: args }),
  });
}
function parseResponse(text: string) {
  if (text.trim().startsWith('{')) return JSON.parse(text);
  const data = text.split('\n').find((line) => line.startsWith('data:'));
  assert.ok(data, text);
  return JSON.parse(data.slice(5));
}
test('remote rejects unsigned/expired/wrong-resource/tampered context before any tool call', async () => {
  const f = await fixture();
  try {
    const app = createHttpApplication(settings(f.base + '/internal/ccdb/mcp/execute'));
    const bad = [
      null,
      ticket({ exp: 1 }),
      ticket({ sourceResource: 'http://127.0.0.1:3400/management/api/ccdb/v1' }),
      ticket({ aud: 'another-service' }),
      ticket({ exp: Math.floor(Date.now() / 1000) + 500 }),
      ticket() + 'x',
    ];
    for (const t of bad) {
      const r = await app(request('tools/list', {}, t));
      assert.equal(r.status, 401);
      assert.ok(
        r.headers
          .get('WWW-Authenticate')
          ?.includes('/.well-known/oauth-protected-resource/mcp/ccdb'),
      );
    }
    assert.equal(f.calls.length, 0);
  } finally {
    await f.close();
  }
});
test('remote handshake/list do not consume factor quota; calls pass only per-request internal context', async () => {
  const seen: string[] = [];
  const f = await fixture((c, r) => {
    if (c.path === '/internal/ccdb/mcp/execute') {
      assert.equal(c.headers.authorization, undefined);
      assert.equal(c.headers['x-api-key'], undefined);
      const claims = verifyExecutionContext(
        String(c.headers['x-ccdb-execution-context']),
        { v1: key },
        resource,
      );
      seen.push(claims.userId);
      r.end(JSON.stringify(searchResult('http://factor.test')));
      return true;
    }
    return false;
  });
  try {
    const app = createHttpApplication(settings(f.base + '/internal/ccdb/mcp/execute'));
    const init = await app(
      request('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'fixture', version: '1' },
      }),
    );
    assert.equal(init.status, 200);
    assert.ok(parseResponse(await init.text()).result.serverInfo);
    const list = await app(request('tools/list'));
    assert.equal(list.status, 200);
    assert.equal(parseResponse(await list.text()).result.tools.length, 2);
    assert.equal(f.calls.length, 0);
    const results = await Promise.all(
      ['100', '101'].map((id) =>
        app(
          request(
            'tools/call',
            { name: 'search_emission_factors', arguments: { query: '电力' } },
            ticket({ userId: id, grantId: 'grant-' + id }),
          ),
        ),
      ),
    );
    for (const result of results) {
      assert.equal(result.status, 200);
      assert.deepEqual(
        parseResponse(await result.text()).result.structuredContent,
        searchResult('http://factor.test'),
      );
    }
    assert.deepEqual(seen.sort(), ['100', '101']);
    assert.equal(f.calls.length, 2);
  } finally {
    await f.close();
  }
});
test('remote scope and backend revocation remain HTTP auth errors', async () => {
  const f = await fixture((c, r) => {
    r.writeHead(401).end('{"error":"invalid_token","error_description":"revoked"}');
    return true;
  });
  try {
    const app = createHttpApplication(settings(f.base + '/internal/ccdb/mcp/execute'));
    const denied = await app(
      request(
        'tools/call',
        { name: 'search_emission_factors', arguments: { query: '电力' } },
        ticket({ scopes: ['ccdb.factor.read'] }),
      ),
    );
    assert.equal(denied.status, 403);
    assert.equal(f.calls.length, 0);
    const revoked = await app(
      request('tools/call', { name: 'search_emission_factors', arguments: { query: '电力' } }),
    );
    assert.equal(revoked.status, 401);
    assert.equal(f.calls.length, 1);
  } finally {
    await f.close();
  }
});
test('remote rejects DNS rebinding hosts and unapproved browser origins', async () => {
  const app = createHttpApplication(settings('http://127.0.0.1:9999/internal/ccdb/mcp/execute'));
  for (const [name, value] of [
    ['Host', 'evil.example'],
    ['Origin', 'https://evil.example'],
  ]) {
    const r = request('tools/list');
    r.headers.set(name, value);
    assert.equal((await app(r)).status, 403);
  }
});

test('remote preserves business quota HTTP 429 and Retry-After without retrying execution', async () => {
  for (const body of [
    JSON.stringify({ error: 'rate_limit_exceeded', error_description: 'quota reached' }),
    '',
  ]) {
    const f = await fixture((_c, r) => {
      r.writeHead(429, { 'Retry-After': '60' }).end(body);
      return true;
    });
    try {
      const app = createHttpApplication(settings(f.base + '/internal/ccdb/mcp/execute'));
      const limited = await app(
        request('tools/call', {
          name: 'search_emission_factors',
          arguments: { query: 'electricity' },
        }),
      );
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get('Retry-After'), '60');
      assert.equal(limited.headers.get('WWW-Authenticate'), null);
      const result = await limited.json();
      assert.equal(result.requestId, 'fixture-request');
      assert.equal(result.error, body ? 'rate_limit_exceeded' : 'RATE_LIMITED');
      assert.equal(f.calls.length, 1);
    } finally {
      await f.close();
    }
  }
});
