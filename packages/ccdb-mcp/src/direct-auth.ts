import { randomUUID } from 'node:crypto';
import { CcdbError, validUrl } from '../../ccdb-client/src/index.js';
import { verifyExecutionContext } from './execution-context.js';

export interface DirectAuthConfig {
  issuer: string;
  authenticateUrl: string;
  serviceToken: string;
}

export function directAuthConfig(env: NodeJS.ProcessEnv): DirectAuthConfig {
  const issuer = env.CCDB_MCP_AUTH_ISSUER || '';
  validUrl(issuer);
  const authenticateUrl = validUrl(env.CCDB_MCP_AUTHENTICATE_URL || '').href;
  for (const value of [issuer, authenticateUrl]) {
    const url = new URL(value);
    if (
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    )
      throw new CcdbError(
        'INVALID_CONFIG',
        '直连认证地址必须使用 HTTPS（本机测试除外），不能含凭证、Query 或 fragment',
      );
  }
  const serviceToken = env.CCDB_MCP_AUTH_SERVICE_TOKEN || '';
  if (!serviceToken || /\s/.test(serviceToken))
    throw new CcdbError('INVALID_CONFIG', '直连模式必须配置私密的后端认证服务凭证');
  return { issuer, authenticateUrl, serviceToken };
}

/** Credential validation only: never pass the public token to a business API. */
export async function authenticateDirect(
  request: Request,
  config: DirectAuthConfig,
  resource: string,
  keys: Record<string, Buffer>,
  timeoutMs: number,
  fetcher: typeof fetch,
): Promise<string> {
  if (request.headers.has('X-CCDB-Execution-Context'))
    throw new CcdbError('invalid_token', '直连入口不接受外部身份票据', 401);
  const authorization = request.headers.get('Authorization');
  const apiKey = request.headers.get('X-API-Key');
  if (authorization && apiKey)
    throw new CcdbError('invalid_request', '只能选择 OAuth 或 API Key 一种凭证', 400);
  const bearer = authorization?.match(/^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i)?.[1];
  const credential = authorization ? bearer : apiKey;
  if (!credential || credential.length > 8192 || /[\s,]/.test(credential))
    throw new CcdbError('invalid_token', '需要有效的 Bearer Token 或 X-API-Key', 401);
  const requestId = randomUUID();
  let response: Response;
  try {
    response = await fetcher(config.authenticateUrl, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
      headers: {
        Authorization: `Bearer ${config.serviceToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        credentialType: authorization ? 'OAUTH' : 'API_KEY',
        credential,
        resource,
        requestId,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      // Do not echo a trusted service's response: it may contain credentials.
      if (response.status === 401 || response.status === 403)
        throw new CcdbError('invalid_token', '凭证无效、已撤销或无访问权限', response.status);
      throw new CcdbError('AUTH_UNAVAILABLE', '认证服务暂不可用', 503);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('empty response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 16384) {
          await reader.cancel();
          throw new Error('response too large');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof body.executionContext !== 'string') throw new Error('missing ticket');
    let claims;
    try {
      claims = verifyExecutionContext(body.executionContext, keys, resource);
    } catch {
      throw new Error('invalid internal ticket');
    }
    if (claims.requestId !== requestId || claims.authType !== (authorization ? 'OAUTH' : 'API_KEY'))
      throw new Error('mismatched identity response');
    return body.executionContext;
  } catch (error) {
    if (error instanceof CcdbError && ['invalid_token', 'AUTH_UNAVAILABLE'].includes(error.code))
      throw error;
    throw new CcdbError('AUTH_UNAVAILABLE', '认证服务响应无效或不可用', 503);
  }
}
