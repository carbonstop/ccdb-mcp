/**
 * CCDB 碳排放因子搜索 API 客户端
 * 
 * 封装对 CCDB 后端接口的调用，包含 MD5 签名生成逻辑
 */

import { createHash } from 'node:crypto';

// ============================================================
// 类型定义
// ============================================================

/** 单条因子记录 */
export interface FactorRow {
  sourceId: number;
  area: string | null;
  factorPattern: string;
  applyYear: string;
  gwp: string | null;
  business: string | null;
  year: string;
  documentType: string | null;
  description: string;
  specification: string | null;
  sourceLevel: string | null;
  countries: string;
  nameEn: string | null;
  source: string;
  applyYearEnd: string;
  parentId: string;
  isEncryption: string;
  institution: string;
  unit: string;
  cValue: string;
  name: string;
  factorClassify: string | null;
  id: string;
}

/** API 响应体 */
export interface CcdbApiResponse {
  total: number;
  rows: FactorRow[];
  code: number;
  msg: string;
  queryKey: string | null;
  sumTotal: number;
  waitDealTotal: number;
  institutionsList: unknown;
  searchId: string | null;
  versionId: string | null;
  selectionSuggestion: string | null;
  flowingCount: number;
  completeCount: number;
  cancelCount: number;
  backCount: number;
}

/** 搜索参数 */
export interface SearchParams {
  name: string;
  lang?: string;
}

// ============================================================
// 常量
// ============================================================

const CCDB_API_URL =
  'https://gateway-base-test.carbonstop.com/management/system/website/searchFactorDataMcp';

/** 用于 MD5 签名的 business 盐值 */
const SIGN_BUSINESS = 'mcp_ccdb_search';

// ============================================================
// 工具函数
// ============================================================

/**
 * 生成 sign 字段：md5(business + name)
 */
function generateSign(name: string): string {
  return createHash('md5').update(`${SIGN_BUSINESS}${name}`).digest('hex');
}

// ============================================================
// 请求头
// ============================================================

function getHeaders(): Record<string, string> {
  return {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://website-test.carbonstop.com',
    'referer': 'https://website-test.carbonstop.com/',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  };
}

// ============================================================
// 核心搜索方法
// ============================================================

/**
 * 搜索 CCDB 碳排放因子
 *
 * @param params.name - 搜索关键词（如"电力"、"水泥"）
 * @param params.lang - 语言，默认 "zh"
 * @returns 查询结果
 */
export async function searchFactors(params: SearchParams): Promise<CcdbApiResponse> {
  const { name, lang = 'zh' } = params;
  const sign = generateSign(name);

  const body = JSON.stringify({ sign, name, lang });

  const response = await fetch(CCDB_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body,
  });

  if (!response.ok) {
    throw new Error(
      `CCDB API request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as CcdbApiResponse;

  if (data.code !== 200) {
    throw new Error(`CCDB API error: ${data.msg} (code: ${data.code})`);
  }

  return data;
}

// ============================================================
// 格式化工具
// ============================================================

/**
 * 将因子列表格式化为可读文本
 */
export function formatFactorRows(rows: FactorRow[]): string {
  if (rows.length === 0) {
    return '未找到匹配的碳排放因子数据。';
  }

  return rows
    .map((row, idx) => {
      const lines: string[] = [
        `━━━ 因子 #${idx + 1} ━━━`,
        `📌 名称: ${row.name}${row.nameEn ? ` (${row.nameEn})` : ''}`,
        `📊 排放因子值: ${row.cValue} ${row.unit}`,
        `🌍 适用国家/地区: ${row.countries}${row.area ? ` - ${row.area}` : ''}`,
        `📅 适用年份: ${row.applyYear}${row.applyYearEnd !== '不限' ? ` ~ ${row.applyYearEnd}` : ' ~ 至今'}`,
        `🏛️ 发布机构: ${row.institution}`,
        `📑 数据来源: ${row.source}`,
      ];

      if (row.specification) {
        lines.push(`📋 规格说明: ${row.specification}`);
      }
      if (row.business) {
        lines.push(`🏢 所属行业: ${row.business}`);
      }
      if (row.sourceLevel) {
        lines.push(`📊 因子级别: ${row.sourceLevel}`);
      }
      if (row.documentType) {
        lines.push(`📄 文件类型: ${row.documentType}`);
      }
      if (row.description) {
        lines.push(`💡 描述: ${row.description}`);
      }

      lines.push(`🔗 因子ID: ${row.id}`);
      return lines.join('\n');
    })
    .join('\n\n');
}
