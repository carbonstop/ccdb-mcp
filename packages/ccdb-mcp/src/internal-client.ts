import {
  jsonRequest,
  searchSchema,
  searchResponseSchema,
  detailInputSchema,
  detailResponseSchema,
  type FactorClient,
  type SearchRequest,
  CcdbError,
} from 'ccdb-client';
/** Only the current signed context is forwarded. No external Key/Bearer or shared admin identity. */
export class InternalFactorClient implements FactorClient {
  constructor(
    readonly endpoint: string,
    readonly ticket: string,
    readonly timeoutMs: number,
    readonly onTransportFailure: (error: CcdbError) => void,
    readonly fetcher: typeof fetch = fetch,
  ) {}
  private async execute(tool: string, args: unknown, signal?: AbortSignal) {
    try {
      return await jsonRequest(
        this.fetcher,
        this.endpoint,
        {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CCDB-Execution-Context': this.ticket,
          },
          body: JSON.stringify({ tool, arguments: args }),
        },
        this.timeoutMs,
      );
    } catch (e) {
      if (e instanceof CcdbError && [401, 403, 429].includes(e.httpStatus || 0))
        this.onTransportFailure(e);
      throw e;
    }
  }
  async search(input: SearchRequest, signal?: AbortSignal) {
    const raw = await this.execute('search_emission_factors', searchSchema.parse(input), signal);
    const result = searchResponseSchema.safeParse(raw);
    if (!result.success) throw new CcdbError('INVALID_RESPONSE', '内部搜索响应不符合 CCDB 契约');
    return result.data;
  }
  async detail(factorId: string, language: 'zh' | 'en' = 'zh', signal?: AbortSignal) {
    const input = detailInputSchema.parse({ factorId, language });
    const raw = await this.execute('get_emission_factor_detail', input, signal);
    const result = detailResponseSchema.safeParse(raw);
    if (!result.success || result.data.data.factorId !== factorId)
      throw new CcdbError('INVALID_RESPONSE', '内部详情响应不符合 CCDB 契约');
    return result.data;
  }
}
