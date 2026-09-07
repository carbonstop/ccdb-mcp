import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CcdbError } from 'ccdb-client/errors';

/** Gateway-issued internal ticket. This is NOT a public OAuth access token. */
const claimsSchema = z
  .object({
    iss: z.literal('ccdb-gateway'),
    aud: z.literal('ccdb-mcp-execution'),
    iat: z.number().int(),
    exp: z.number().int(),
    jti: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
    sourceResource: z.string(),
    requestId: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
    userId: z.string().regex(/^\d{1,19}$/),
    companyId: z.string().regex(/^\d{1,19}$/),
    authType: z.enum(['OAUTH', 'API_KEY']),
    scopes: z.array(z.enum(['ccdb.factor.search', 'ccdb.factor.read', 'offline_access'])).max(10),
    clientId: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,128}$/)
      .optional(),
    grantId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    grantVersion: z.number().int().nonnegative().optional(),
    keyId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    keyVersion: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    channel: z.string().max(128).optional(),
    clientIp: z.string().regex(/^[0-9A-Fa-f:.]{1,64}$/),
  })
  .passthrough();
export type ExecutionContext = z.infer<typeof claimsSchema>;
export function parseVerificationKeys(raw: string | undefined): Record<string, Buffer> {
  try {
    const parsed = JSON.parse(raw || '{}');
    const keys: Record<string, Buffer> = Object.create(null);
    for (const [id, value] of Object.entries(parsed)) {
      if (
        !/^[A-Za-z0-9_-]{1,64}$/.test(id) ||
        typeof value !== 'string' ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
      )
        throw Error();
      const key = Buffer.from(value, 'base64');
      if (key.length < 32) throw Error();
      keys[id] = key;
    }
    if (!Object.keys(keys).length) throw Error();
    return keys;
  } catch {
    throw new CcdbError(
      'INVALID_CONFIG',
      'CCDB_MCP_CONTEXT_KEYS 必须配置 kid → Base64 签名密钥映射，每个密钥至少 32 字节',
    );
  }
}
export function verifyExecutionContext(
  ticket: string | null,
  keys: Record<string, Buffer>,
  resource: string,
  now = Math.floor(Date.now() / 1000),
): ExecutionContext {
  try {
    if (
      !ticket ||
      ticket.length > 8192 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket)
    ) {
      throw Error();
    }
    const body = verifiedPayload(ticket, keys);
    const claims = claimsSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')));
    validateClaims(claims, resource, now);
    return claims;
  } catch {
    // 对外统一 401，不泄漏 kid、签名或具体身份校验失败的细节。
    throw new CcdbError('invalid_token', '缺少有效的网关执行上下文', 401);
  }
}

/** 必须先验签，再读取并信任正文中的用户、资源和权限。 */
function verifiedPayload(ticket: string, keys: Record<string, Buffer>): string {
  const [head, body, signature] = ticket.split('.');
  const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
  if (
    header.alg !== 'HS256' ||
    header.typ !== 'JWT' ||
    typeof header.kid !== 'string' ||
    header.crit
  ) {
    throw Error();
  }
  const key = Object.hasOwn(keys, header.kid) ? keys[header.kid] : undefined;
  if (!key) throw Error();
  const expected = createHmac('sha256', key).update(`${head}.${body}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw Error();
  }
  return body;
}

/** 保持资源、时效、Long ID 和互斥身份字段校验集中可审查。 */
function validateClaims(claims: ExecutionContext, resource: string, now: number): void {
  if (
    claims.sourceResource !== resource ||
    claims.exp <= now ||
    claims.iat > now + 5 ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 60
  ) {
    throw Error();
  }
  // 不转成 Number，避免 Java Long 用户/组织 ID 在 JavaScript 中丢失精度。
  for (const id of [claims.userId, claims.companyId]) {
    if (BigInt(id) <= 0n || BigInt(id) > 9223372036854775807n) {
      throw Error();
    }
  }
  if (
    claims.authType === 'OAUTH' &&
    (!claims.grantId ||
      !claims.clientId ||
      claims.grantVersion === undefined ||
      claims.keyId !== undefined ||
      claims.keyVersion !== undefined)
  ) {
    throw Error();
  }
  if (
    claims.authType === 'API_KEY' &&
    (!claims.keyId ||
      claims.keyVersion === undefined ||
      claims.clientId !== undefined ||
      claims.grantId !== undefined ||
      claims.grantVersion !== undefined)
  ) {
    throw Error();
  }
}
