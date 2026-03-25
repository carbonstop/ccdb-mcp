/**
 * stdio 传输层
 *
 * 适用于 Claude Desktop / Cursor / 命令行工具等本地客户端
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export async function startStdioTransport(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdio 下不输出到 stdout（会干扰 JSON-RPC 消息），使用 stderr
  console.error('✅ CCDB MCP Server 已启动 (stdio 模式)');
}
