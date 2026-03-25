/**
 * CCDB 碳排放因子搜索 MCP Server
 *
 * 核心逻辑：注册 MCP Tools / Resources / Prompts
 * 传输层由 index.ts 选择 (stdio / Streamable HTTP)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  searchFactors,
  formatFactorRows,
  type CcdbApiResponse,
  type FactorRow,
} from './ccdb-api.js';

// ============================================================
// 创建 MCP Server
// ============================================================

export function createCcdbMcpServer(): McpServer {
  const server = new McpServer({
    name: 'ccdb-factor-search',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  });

  // ----------------------------------------------------------
  // Tool 1: search_factors — 碳排放因子搜索（核心工具）
  // ----------------------------------------------------------
  server.tool(
    'search_factors',
    '搜索 CCDB 碳排放因子数据库。可根据关键词（如"电力"、"水泥"、"钢铁"等）搜索碳排放因子，返回排放因子值、适用地区、年份、数据来源等详细信息。',
    {
      name: z.string().describe('搜索关键词，如"电力"、"水泥"、"钢铁"、"天然气"等'),
      lang: z
        .enum(['zh', 'en'])
        .default('zh')
        .describe('搜索语言: zh=中文, en=英文'),
    },
    async ({ name, lang }) => {
      try {
        const result = await searchFactors({ name, lang });
        const summary = `共找到 ${result.total} 条碳排放因子数据（以下展示前 ${result.rows.length} 条）：\n\n`;
        const formatted = formatFactorRows(result.rows);

        return {
          content: [
            {
              type: 'text' as const,
              text: summary + formatted,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ 搜索失败: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ----------------------------------------------------------
  // Tool 2: search_factors_json — 碳排放因子搜索（结构化 JSON）
  // ----------------------------------------------------------
  server.tool(
    'search_factors_json',
    '搜索 CCDB 碳排放因子数据库，返回原始 JSON 格式数据。适用于需要精确数值计算的场景。',
    {
      name: z.string().describe('搜索关键词'),
      lang: z
        .enum(['zh', 'en'])
        .default('zh')
        .describe('搜索语言: zh=中文, en=英文'),
    },
    async ({ name, lang }) => {
      try {
        const result = await searchFactors({ name, lang });

        // 只保留核心字段，减少 token 消耗
        const simplified = result.rows.map((row: FactorRow) => ({
          id: row.id,
          name: row.name,
          nameEn: row.nameEn,
          cValue: row.cValue,
          unit: row.unit,
          countries: row.countries,
          area: row.area,
          applyYear: row.applyYear,
          applyYearEnd: row.applyYearEnd,
          institution: row.institution,
          source: row.source,
          specification: row.specification,
          sourceLevel: row.sourceLevel,
          business: row.business,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { total: result.total, rows: simplified },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ----------------------------------------------------------
  // Tool 3: compare_factors — 多因子对比
  // ----------------------------------------------------------
  server.tool(
    'compare_factors',
    '对比多个关键词的碳排放因子数据。例如对比"电力"和"天然气"的排放因子，支持最多5个关键词同时对比。',
    {
      keywords: z
        .array(z.string())
        .min(1)
        .max(5)
        .describe('要对比的搜索关键词列表，如 ["电力", "天然气", "煤炭"]'),
      lang: z
        .enum(['zh', 'en'])
        .default('zh')
        .describe('搜索语言'),
    },
    async ({ keywords, lang }) => {
      try {
        const results: { keyword: string; data: CcdbApiResponse }[] = [];

        for (const keyword of keywords) {
          const data = await searchFactors({ name: keyword, lang });
          results.push({ keyword, data });
        }

        const lines: string[] = ['╔══════════════════════════════════════╗',
          '║       碳排放因子多关键词对比结果       ║',
          '╚══════════════════════════════════════╝\n'];

        for (const { keyword, data } of results) {
          lines.push(`\n🔍 「${keyword}」 — 共 ${data.total} 条结果`);
          lines.push('─'.repeat(40));

          if (data.rows.length === 0) {
            lines.push('  ⚠️ 未找到匹配数据\n');
            continue;
          }

          // 展示前 3 条核心信息
          const top = data.rows.slice(0, 3);
          for (const row of top) {
            lines.push(`  📊 ${row.cValue} ${row.unit}`);
            lines.push(`     ${row.specification || row.name} | ${row.countries} | ${row.applyYear}`);
            lines.push(`     来源: ${row.institution}`);
            lines.push('');
          }
          if (data.rows.length > 3) {
            lines.push(`  ... 还有 ${data.rows.length - 3} 条结果\n`);
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: lines.join('\n'),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ 对比查询失败: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ----------------------------------------------------------
  // Prompt 1: factor_search — 因子搜索提示模板
  // ----------------------------------------------------------
  server.prompt(
    'factor_search',
    '引导 LLM 进行碳排放因子搜索',
    { keyword: z.string().describe('搜索关键词') },
    ({ keyword }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `请在 CCDB 碳排放因子数据库中搜索「${keyword}」相关的排放因子数据。

请按照以下步骤处理：
1. 使用 search_factors 工具搜索「${keyword}」
2. 分析搜索结果，重点关注：
   - 排放因子值及其单位
   - 数据的适用地区和年份
   - 数据发布机构的权威性
3. 如果有多条结果，请推荐最适用于中国大陆地区、最新年份的因子数据
4. 说明该排放因子的典型应用场景`,
          },
        },
      ],
    })
  );

  // ----------------------------------------------------------
  // Prompt 2: carbon_calculation — 碳排放计算提示模板
  // ----------------------------------------------------------
  server.prompt(
    'carbon_calculation',
    '引导 LLM 进行碳排放量计算',
    {
      activity: z.string().describe('活动类型，如"用电"、"燃气"'),
      quantity: z.string().describe('活动量，如"1000kWh"、"500m³"'),
    },
    ({ activity, quantity }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `请帮我计算以下活动的碳排放量：

活动类型: ${activity}
活动量: ${quantity}

请按照以下步骤处理：
1. 使用 search_factors 工具搜索该活动对应的排放因子
2. 选择最适用于中国大陆、最新年份的排放因子
3. 计算碳排放量 = 活动量 × 排放因子
4. 输出计算过程、结果及所用因子的来源
5. 如适用，给出减排建议`,
          },
        },
      ],
    })
  );

  return server;
}
