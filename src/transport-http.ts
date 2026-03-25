/**
 * Streamable HTTP 传输层
 *
 * 基于 Express + StreamableHTTPServerTransport 实现
 * 支持会话管理、SSE 通知流、会话终止
 */

import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createCcdbMcpServer } from './server.js';

export async function startHttpTransport(port: number): Promise<void> {
  const app = express();
  app.use(express.json());

  // 启用 CORS —— 允许浏览器端及跨域 MCP 客户端访问
  app.use(
    cors({
      exposedHeaders: ['Mcp-Session-Id'],
      origin: '*',
    })
  );

  // ----- 会话存储 -----
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // ===== POST /mcp — 客户端 → 服务端 请求 =====
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // 复用已有会话
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // 新的初始化请求 → 创建新会话
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.log(`📡 新会话已建立: ${sid}`);
            transports[sid] = transport;
          },
        });

        // 会话关闭时清理
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`🔌 会话已关闭: ${sid}`);
            delete transports[sid];
          }
        };

        // 创建独立的 MCP Server 实例并连接
        const server = createCcdbMcpServer();
        await server.connect(transport);
      } else {
        // 无效请求
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: 请提供有效的 mcp-session-id 或发送初始化请求',
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('❌ 处理 POST /mcp 请求失败:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // ===== GET /mcp — SSE 通知流（服务端 → 客户端） =====
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // ===== DELETE /mcp — 会话终止 =====
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    console.log(`🗑️ 收到会话终止请求: ${sessionId}`);

    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('❌ 终止会话失败:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });

  // ===== 健康检查 =====
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      server: 'ccdb-factor-search',
      version: '1.0.0',
      activeSessions: Object.keys(transports).length,
    });
  });

  // ===== 启动 =====
  app.listen(port, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║     CCDB 碳排放因子搜索 MCP Server                  ║');
    console.log('║     Streamable HTTP 模式                             ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  🌐 MCP Endpoint:  http://localhost:${port}/mcp`);
    console.log(`  💚 Health Check:  http://localhost:${port}/health`);
    console.log('');
    console.log('  可用 Tools:');
    console.log('    • search_factors      — 搜索碳排放因子（格式化输出）');
    console.log('    • search_factors_json — 搜索碳排放因子（JSON 输出）');
    console.log('    • compare_factors     — 多因子对比');
    console.log('');
  });

  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n🛑 正在关闭服务...');
    for (const sessionId of Object.keys(transports)) {
      try {
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch {}
    }
    console.log('✅ 服务已关闭');
    process.exit(0);
  });
}
