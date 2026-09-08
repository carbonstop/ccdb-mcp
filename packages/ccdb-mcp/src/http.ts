import { createServer as nodeServer } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { CcdbError, asError, validUrl } from 'ccdb-client';
import {
  verifyExecutionContext,
  parseVerificationKeys,
  type ExecutionContext,
} from './execution-context.js';
import { InternalFactorClient } from './internal-client.js';
import { createServer } from './server.js';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export interface HttpConfig {
  resource: string;
  endpoint: string;
  keys: Record<string, Buffer>;
  hosts: string[];
  origins: string[];
  timeoutMs: number;
  maxConcurrent: number;
  host: string;
  port: number;
}
export function httpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const resource = validUrl(env.CCDB_MCP_RESOURCE || '').href;
  const endpoint = new URL(env.CCDB_MCP_EXECUTION_URL || '');
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.pathname !== '/internal/ccdb/mcp/execute'
  )
    throw new CcdbError(
      'INVALID_CONFIG',
      '内部执行 URL 必须为配置的 /internal/ccdb/mcp/execute，不能含账号或 Query',
    );
  if (
    endpoint.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) &&
    env.CCDB_MCP_ALLOW_INSECURE_INTERNAL_HTTP !== 'true'
  )
    throw new CcdbError(
      'INVALID_CONFIG',
      '非本机内部执行地址需要 HTTPS；受控内网 HTTP 必须显式开启',
    );
  const port = Number(env.CCDB_MCP_PORT || 3400),
    timeoutMs = Number(env.CCDB_TIMEOUT_MS || 30000),
    maxConcurrent = Number(env.CCDB_MCP_MAX_CONCURRENT || 100);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 120000 ||
    !Number.isInteger(maxConcurrent) ||
    maxConcurrent < 1 ||
    maxConcurrent > 1000
  )
    throw new CcdbError('INVALID_CONFIG', '远程 MCP 端口、超时或并发配置无效');
  if (new URL(resource).pathname !== '/mcp/ccdb' || new URL(resource).search)
    throw new CcdbError('INVALID_CONFIG', 'MCP resource 路径必须为 /mcp/ccdb');
  const hosts = (env.CCDB_MCP_ALLOWED_HOSTS || `127.0.0.1:${port}`)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origins = (env.CCDB_MCP_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    hosts.some((s) => s.includes('*') || /[\s/]/.test(s)) ||
    origins.some((s) => validUrl(s).origin !== s)
  )
    throw new CcdbError('INVALID_CONFIG', 'Host/Origin 白名单需填写精确地址，不能用通配');
  return {
    resource,
    endpoint: endpoint.href,
    keys: parseVerificationKeys(env.CCDB_MCP_CONTEXT_KEYS),
    hosts,
    origins,
    timeoutMs,
    maxConcurrent,
    host: env.CCDB_MCP_HOST || '127.0.0.1',
    port,
  };
}
async function readLimited(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new CcdbError('PAYLOAD_TOO_LARGE', '请求或响应超出大小限制', 413);
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
/** 仅提前检查已知工具的 scope；JSON-RPC 格式和未知方法仍由 SDK 校验。 */
function requiredToolScope(raw: Uint8Array): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
  } catch {
    parsed = undefined;
  }
  // Scope failure is an HTTP authentication response, before tool execution.
  const rpc = parsed as { method?: string; params?: { name?: string } } | undefined;
  const required =
    rpc?.method === 'tools/call'
      ? (
          {
            search_emission_factors: 'ccdb.factor.search',
            get_emission_factor_detail: 'ccdb.factor.read',
          } as Record<string, string>
        )[rpc.params?.name || '']
      : undefined;
  return required;
}

/** 每个请求独立创建客户端和 SDK handler，避免不同用户共享身份或错误状态。 */
async function executeProtocolRequest(
  request: Request,
  raw: Uint8Array,
  ticket: string,
  claims: ExecutionContext,
  settings: HttpConfig,
  fetcher: typeof fetch,
  errorResponse: (error: CcdbError) => Response,
): Promise<Response> {
  const origin = request.headers.get('origin');
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(settings.timeoutMs)]);
  let transportError: CcdbError | undefined;
  const client = new InternalFactorClient(
    settings.endpoint,
    ticket,
    settings.timeoutMs,
    (e) => {
      transportError = e;
    },
    fetcher,
  );
  const handler = createMcpHandler((context) => createServer(client, context), {
    legacy: 'stateless',
    maxSubscriptions: 0,
  });
  try {
    const headers = new Headers(request.headers);
    headers.delete('Authorization');
    headers.delete('X-API-Key');
    headers.delete('X-CCDB-Execution-Context');
    const sdkRequest = new Request(request.url, {
      method: 'POST',
      headers,
      body: Buffer.from(raw),
      signal,
    });
    const response = await handler.fetch(sdkRequest);
    const bytes = await readLimited(response.body, MAX_RESPONSE_BYTES);
    // Consume legacy SSE before returning so revoked grants and quotas remain
    // HTTP 401/403/429, including Retry-After. Never retry the signed execution.
    if (transportError) return errorResponse(transportError);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('X-Request-Id', claims.requestId);
    if (origin) {
      responseHeaders.set('Access-Control-Allow-Origin', origin);
      responseHeaders.set('Vary', 'Origin');
      responseHeaders.set(
        'Access-Control-Expose-Headers',
        'WWW-Authenticate, Retry-After, X-Request-Id, MCP-Protocol-Version',
      );
    }
    return new Response(bytes.length ? Buffer.from(bytes) : null, {
      status: response.status,
      headers: responseHeaders,
    });
  } finally {
    await handler.close();
  }
}

export function createHttpApplication(settings: HttpConfig, fetcher: typeof fetch = fetch) {
  let active = 0;
  const metadataUrl = `${
    new URL(settings.resource).origin
  }/.well-known/oauth-protected-resource/mcp/ccdb`;
  const errorResponse = (error: CcdbError) => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    if (error.httpStatus === 401 || error.httpStatus === 403)
      headers.set(
        'WWW-Authenticate',
        `Bearer resource_metadata="${metadataUrl}", error="${
          error.httpStatus === 403 ? 'insufficient_scope' : 'invalid_token'
        }"`,
      );
    if (error.retryAfterSeconds !== undefined)
      headers.set('Retry-After', String(error.retryAfterSeconds));
    return new Response(
      JSON.stringify({
        error: error.code,
        error_description: error.message,
        requestId: error.requestId,
      }),
      { status: error.httpStatus || 500, headers },
    );
  };
  const handle = async (request: Request): Promise<Response> => {
    const host = request.headers.get('host') || new URL(request.url).host,
      origin = request.headers.get('origin');
    if (!settings.hosts.includes(host) || (origin && !settings.origins.includes(origin)))
      return errorResponse(new CcdbError('FORBIDDEN_ORIGIN', 'Host 或 Origin 不在白名单', 403));
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET')
      return Response.json({ status: 'ok', service: 'ccdb-mcp', version: '2.0.2' });
    if (path !== '/mcp/ccdb') return errorResponse(new CcdbError('NOT_FOUND', '接口不存在', 404));
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers':
            'Authorization, X-API-Key, Content-Type, MCP-Protocol-Version, MCP-Method, MCP-Name',
          Vary: 'Origin',
        },
      });
    if (active >= settings.maxConcurrent)
      return errorResponse(new CcdbError('SERVER_BUSY', '连接数达到上限', 429, undefined, 1));
    active++;
    try {
      const ticket = request.headers.get('X-CCDB-Execution-Context');
      const claims = verifyExecutionContext(ticket, settings.keys, settings.resource);
      if (request.method !== 'POST')
        return new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
      if (
        !(request.headers.get('content-type') || '')
          .split(';')[0]
          .trim()
          .toLowerCase()
          .endsWith('/json')
      )
        return errorResponse(new CcdbError('INVALID_REQUEST', '需要 application/json', 415));
      const raw = await readLimited(request.body, MAX_REQUEST_BYTES);
      const required = requiredToolScope(raw);
      if (required && !claims.scopes.some((scope) => scope === required))
        return errorResponse(
          new CcdbError('insufficient_scope', '缺少工具所需权限', 403, claims.requestId),
        );
      return await executeProtocolRequest(
        request,
        raw,
        ticket!,
        claims,
        settings,
        fetcher,
        errorResponse,
      );
    } catch (error) {
      return errorResponse(asError(error));
    } finally {
      active--;
    }
  };
  return async (request: Request) => {
    const response = await handle(request);
    const origin = request.headers.get('origin');
    if (origin && settings.origins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Vary', 'Origin');
      response.headers.set(
        'Access-Control-Expose-Headers',
        'WWW-Authenticate, Retry-After, X-Request-Id, MCP-Protocol-Version',
      );
    }
    return response;
  };
}
export async function startHttp(env: NodeJS.ProcessEnv = process.env) {
  const settings = httpConfig(env);
  const app = createHttpApplication(settings);
  const server = nodeServer(async (req, res) => {
    const controller = new AbortController();
    res.once('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_REQUEST_BYTES) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      const request = new Request(`http://${headers.get('host') || 'invalid'}${req.url || '/'}`, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : Buffer.concat(chunks),
        signal: controller.signal,
      });
      const result = await app(request);
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxConnections = settings.maxConcurrent * 2;
  await new Promise<void>((yes, no) => {
    server.once('error', no);
    server.listen(settings.port, settings.host, yes);
  });
  process.stderr.write(
    `CCDB MCP internal adapter listening on ${settings.host}:${settings.port}; requires signed gateway context.\n`,
  );
  const close = () => {
    server.close();
    server.closeAllConnections();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  return server;
}
