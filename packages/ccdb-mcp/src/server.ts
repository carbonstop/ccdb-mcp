import {
  McpServer,
  type McpRequestContext,
  type CallToolResult,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  searchSchema,
  detailInputSchema,
  searchResponseSchema,
  detailResponseSchema,
  asError,
  type FactorClient,
} from '../../ccdb-client/src/index.js';

export const toolErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    httpStatus: z.number().optional(),
    requestId: z.string().optional(),
    retryAfterSeconds: z.number().optional(),
    upstreamCode: z.union([z.string(), z.number()]).optional(),
  }),
});
export async function toolResult(
  fn: () => Promise<Record<string, unknown>>,
): Promise<CallToolResult> {
  try {
    const value = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
  } catch (error) {
    const value = { error: asError(error).toJSON() };
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(value) }],
      structuredContent: value,
    };
  }
}
export function createServer(client: FactorClient, context?: McpRequestContext): McpServer {
  const server = new McpServer(
    { name: 'ccdb-connect', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Search returns candidates, not final recommendations. Verify context, units and boundaries in factor details. Cite the returned detailUrl for each CCDB factor used. Restricted values (******) cannot be calculated or inferred. When guidance.code is ECOINVENT_VALUE_RESTRICTED, convey its message and link to Carbon Agent using the returned actionUrl/detailUrl, once per answer rather than once per factor. Never promise plaintext access after login or recommend replacement factors unless the user requests alternatives.',
    },
  );
  // The serving entry owns protocol-era negotiation. Never hardcode one version.
  void context;
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
  server.registerTool(
    'search_emission_factors',
    {
      title: '查询 CCDB 排放因子',
      description:
        '按具体关键词和可选地区、年份、来源条件检索 CCDB 候选因子。候选不是最终推荐；使用因子时核对详情并引用 detailUrl。不能全库遍历。',
      inputSchema: searchSchema,
      outputSchema: searchResponseSchema
        .partial()
        .extend({ error: toolErrorSchema.shape.error.optional() }),
      annotations,
    },
    (input, ctx) => toolResult(() => client.search(input, ctx.mcpReq.signal)),
  );
  server.registerTool(
    'get_emission_factor_detail',
    {
      title: '读取 CCDB 因子详情',
      description:
        '用搜索返回的字符串 factorId 获取完整 CCDB 详情、单位、来源和适用范围。保留所有扩展字段及受限值；最终引用使用 detailUrl。',
      inputSchema: detailInputSchema,
      outputSchema: detailResponseSchema
        .partial()
        .extend({ error: toolErrorSchema.shape.error.optional() }),
      annotations,
    },
    (input, ctx) =>
      toolResult(() => client.detail(input.factorId, input.language, ctx.mcpReq.signal)),
  );
  return server;
}
