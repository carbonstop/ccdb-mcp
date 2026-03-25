# CCDB 碳排放因子搜索 MCP Server

基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 构建的碳排放因子数据库搜索服务，支持 **Streamable HTTP** 和 **stdio** 双传输机制。

## ✨ 功能

| 工具名称 | 描述 |
| --- | --- |
| `search_factors` | 搜索碳排放因子（格式化可读输出） |
| `search_factors_json` | 搜索碳排放因子（结构化 JSON 输出，适合计算） |
| `compare_factors` | 多关键词碳排放因子对比（最多 5 个） |

| 提示模板 | 描述 |
| --- | --- |
| `factor_search` | 引导 LLM 进行因子搜索 |
| `carbon_calculation` | 引导 LLM 进行碳排放量计算 |

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 编译

```bash
npm run build
```

### 运行

#### 1. stdio 模式（默认，用于 Claude Desktop / Cursor 等本地客户端）

```bash
npm start
# 或
node dist/index.js --stdio
```

#### 2. Streamable HTTP 模式（用于远程/Web 客户端）

```bash
node dist/index.js --http
# 指定端口
node dist/index.js --http --port 8080
```

### 开发模式（无需编译）

```bash
# HTTP 模式
npm run dev

# stdio 模式
npm run dev:stdio
```

## 🔌 集成配置

### Claude Desktop (stdio 模式)

在 `~/Library/Application Support/Claude/claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "ccdb-factor-search": {
      "command": "node",
      "args": ["/Users/lijihua/Desktop/ccdb-mcp/dist/index.js", "--stdio"]
    }
  }
}
```

### Claude Desktop (Streamable HTTP 模式)

先启动 HTTP 服务：

```bash
node dist/index.js --http --port 3000
```

然后在 Claude Desktop 配置中添加：

```json
{
  "mcpServers": {
    "ccdb-factor-search": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Cursor (stdio 模式)

在 Cursor 设置的 MCP 配置中添加：

```json
{
  "ccdb-factor-search": {
    "command": "node",
    "args": ["/Users/lijihua/Desktop/ccdb-mcp/dist/index.js", "--stdio"]
  }
}
```

## 📡 API 端点

### Streamable HTTP 模式

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/mcp` | MCP 请求（初始化/工具调用） |
| `GET` | `/mcp` | SSE 通知流 |
| `DELETE` | `/mcp` | 会话终止 |
| `GET` | `/health` | 健康检查 |

## 🏗️ 项目结构

```
ccdb-mcp/
├── src/
│   ├── index.ts            # 入口 — CLI 参数解析与传输层分发
│   ├── server.ts           # MCP Server 核心 — Tools / Prompts 注册
│   ├── ccdb-api.ts         # CCDB API 客户端 — 请求封装与类型定义
│   ├── transport-stdio.ts  # stdio 传输层
│   └── transport-http.ts   # Streamable HTTP 传输层
├── package.json
├── tsconfig.json
└── README.md
```

## 📝 使用示例

通过 MCP 客户端调用 `search_factors` 工具：

```json
{
  "name": "search_factors",
  "arguments": {
    "name": "电力",
    "lang": "zh"
  }
}
```

返回格式化的碳排放因子数据，包含因子值、单位、适用地区、年份、来源机构等详细信息。

## License

MIT
