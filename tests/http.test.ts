import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpApplication, type HttpConfig } from '../packages/ccdb-mcp/src/http.js';
import { directAuthConfig } from '../packages/ccdb-mcp/src/direct-auth.js';
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
test('direct OAuth discovery and official SDK calls do not require a gateway', async () => {
  const config = {
    ...settings('https://management.test/internal/ccdb/mcp/execute'),
    directAuth: {
      issuer: 'https://auth.test/auth',
      authenticateUrl: 'https://auth.test/internal/authenticate',
      serviceToken: 'private-service-token',
    },
  };
  const seen: string[] = [];
  const app = createHttpApplication(config, async (url, init) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body));
    if (String(url) === config.directAuth.authenticateUrl) {
      assert.equal(headers.get('Authorization'), 'Bearer private-service-token');
      assert.equal(body.resource, resource);
      const userId = body.credential === 'user-one' ? '100' : '101';
      return Response.json({ executionContext: ticket({ requestId: body.requestId, userId }) });
    }
    assert.equal(String(url), config.endpoint);
    assert.equal(headers.get('Authorization'), null);
    assert.equal(headers.get('X-API-Key'), null);
    seen.push(
      verifyExecutionContext(headers.get('X-CCDB-Execution-Context'), config.keys, resource).userId,
    );
    return Response.json(searchResult('http://factor.test'));
  });
  const metadata = await app(
    new Request(resource.replace('/mcp/ccdb', '/.well-known/oauth-protected-resource/mcp/ccdb')),
  );
  assert.equal(metadata.status, 200);
  assert.deepEqual((await metadata.json()).authorization_servers, ['https://auth.test/auth']);
  const missing = await app(new Request(resource, { method: 'POST' }));
  assert.equal(missing.status, 401);
  assert.match(missing.headers.get('WWW-Authenticate') || '', /resource_metadata=/);
  await Promise.all(
    ['user-one', 'user-two'].map(async (token) => {
      const client = new Client({ name: 'direct-test', version: '1' });
      try {
        await client.connect(
          new StreamableHTTPClientTransport(new URL(resource), {
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
            fetch: async (input, init) => app(new Request(input, init)),
          }),
        );
        assert.equal((await client.listTools()).tools.length, 2);
        assert.deepEqual(
          (await client.callTool({ name: 'search_emission_factors', arguments: { query: '电力' } }))
            .structuredContent,
          searchResult('http://factor.test'),
        );
      } finally {
        await client.close();
      }
    }),
  );
  assert.deepEqual(seen.sort(), ['100', '101']);
});

test('direct authentication fails closed and rejects forged context or ambiguous credentials', async () => {
  const config = {
    ...settings('https://management.test/internal/ccdb/mcp/execute'),
    directAuth: {
      issuer: 'https://auth.test',
      authenticateUrl: 'https://auth.test/check',
      serviceToken: 'service-token',
    },
  };
  let calls = 0;
  let mode = 'ok';
  const app = createHttpApplication(config, async (_url, init) => {
    calls++;
    assert.equal(init?.redirect, 'error');
    if (mode === 'revoked') return new Response('sensitive-server-response', { status: 401 });
    if (mode === 'down') throw new Error('secret error');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.credentialType, 'API_KEY');
    return Response.json({
      executionContext: ticket({
        requestId: mode === 'mismatch' ? 'wrong-id' : body.requestId,
        authType: 'API_KEY',
        clientId: undefined,
        grantId: undefined,
        grantVersion: undefined,
        keyId: 'key-one',
        keyVersion: 'a'.repeat(64),
      }),
    });
  });
  const req = () => {
    const r = request('tools/list', {}, null);
    r.headers.delete('Authorization');
    return r;
  };
  const forged = req();
  forged.headers.set('X-CCDB-Execution-Context', ticket());
  assert.equal((await app(forged)).status, 401);
  const ambiguous = req();
  ambiguous.headers.set('Authorization', 'Bearer token');
  assert.equal((await app(ambiguous)).status, 400);
  assert.equal(calls, 0);
  assert.equal((await app(req())).status, 200);
  mode = 'revoked';
  const revoked = await app(req());
  assert.equal(revoked.status, 401);
  assert.ok(!(await revoked.text()).includes('sensitive-server-response'));
  mode = 'down';
  assert.equal((await app(req())).status, 503);
  mode = 'mismatch';
  assert.equal((await app(req())).status, 503);
  assert.throws(() =>
    directAuthConfig({
      CCDB_MCP_AUTH_ISSUER: 'https://auth.test',
      CCDB_MCP_AUTHENTICATE_URL: 'http://external.test/check',
      CCDB_MCP_AUTH_SERVICE_TOKEN: 'token',
    }),
  );
});
test('official Streamable HTTP client initializes, lists and calls tools without sessions', async () => {
  const f = await fixture((c, r) => {
    if (c.path !== '/internal/ccdb/mcp/execute') return false;
    r.end(JSON.stringify(searchResult('http://factor.test')));
    return true;
  });
  const client = new Client({ name: 'streamable-http-interop', version: '1.0.0' });
  const exchanges: { method: string; status: number }[] = [];
  try {
    const app = createHttpApplication(settings(f.base + '/internal/ccdb/mcp/execute'));
    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      // Simulate the trusted gateway boundary, never distribute signing keys to hosts.
      fetch: async (input, init) => {
        const incoming = new Request(input, init);
        incoming.headers.set('X-CCDB-Execution-Context', ticket());
        const response = await app(incoming);
        exchanges.push({ method: incoming.method, status: response.status });
        assert.equal(response.headers.get('Mcp-Session-Id'), null);
        return response;
      },
    });
    await client.connect(transport);
    const list = await client.listTools();
    assert.equal(list.tools.length, 2);
    const result = await client.callTool({
      name: 'search_emission_factors',
      arguments: { query: '电力' },
    });
    assert.deepEqual(result.structuredContent, searchResult('http://factor.test'));
    assert.equal(f.calls.length, 1);
    assert.ok(exchanges.some((e) => e.method === 'POST' && e.status === 202));
  } finally {
    await client.close();
    await f.close();
  }
});

test('stateless HTTP rejects session operations and acknowledges notifications with no body', async () => {
  const app = createHttpApplication(settings('http://127.0.0.1:1/internal/ccdb/mcp/execute'));
  for (const method of ['GET', 'DELETE']) {
    const response = await app(
      new Request(resource, {
        method,
        headers: { 'X-CCDB-Execution-Context': ticket() },
      }),
    );
    assert.equal(response.status, 405);
    assert.match(response.headers.get('Allow') || '', /POST/);
  }
  const notification = request('notifications/initialized');
  const response = await app(
    new Request(notification, {
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }),
  );
  assert.equal(response.status, 202);
  assert.equal(await response.text(), '');
  const invalidAccept = request('tools/list');
  invalidAccept.headers.set('Accept', 'text/html');
  assert.equal((await app(invalidAccept)).status, 406);
  const invalidVersion = request('tools/list');
  invalidVersion.headers.set('MCP-Protocol-Version', '1900-01-01');
  assert.equal((await app(invalidVersion)).status, 400);
});
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
