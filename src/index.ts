#!/usr/bin/env node

/**
 * CCDB 碳排放因子搜索 MCP Server — 入口文件
 *
 * 支持两种传输机制：
 *   1. stdio   — 用于 Claude Desktop 等本地客户端
 *   2. Streamable HTTP — 用于远程 / Web 客户端
 *
 * 用法：
 *   node dist/index.js --stdio          # stdio 模式（默认）
 *   node dist/index.js --http           # Streamable HTTP 模式
 *   node dist/index.js --http --port 8080  # 指定端口
 */

import { createCcdbMcpServer } from './server.js';
import { startStdioTransport } from './transport-stdio.js';
import { startHttpTransport } from './transport-http.js';

// ============================================================
// 解析命令行参数
// ============================================================

const args = process.argv.slice(2);

const isHttp = args.includes('--http');
const isStdio = args.includes('--stdio');

// 解析端口号
let port = 3000;
const portIdx = args.indexOf('--port');
if (portIdx !== -1 && args[portIdx + 1]) {
  port = parseInt(args[portIdx + 1], 10);
  if (isNaN(port)) {
    console.error('❌ 无效的端口号');
    process.exit(1);
  }
}

// ============================================================
// 启动服务
// ============================================================

async function main() {
  if (isHttp) {
    // Streamable HTTP 传输模式
    await startHttpTransport(port);
  } else {
    // 默认使用 stdio 传输模式
    const server = createCcdbMcpServer();
    await startStdioTransport(server);
  }
}

main().catch((error) => {
  console.error('❌ 启动 MCP Server 失败:', error);
  process.exit(1);
});
