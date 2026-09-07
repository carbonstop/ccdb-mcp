# CCDB Connect MCP

独立 Node.js 22+ MCP 包，当前提供 stdio、包内登录和诊断。无需另外安装 CLI 或 ccdb-client。开发包尚未发布到 npm。

```sh
ccdb-connect-mcp login --method device --no-browser
ccdb-connect-mcp status --json
ccdb-connect-mcp stdio
```

宿主以 stdio 启动本命令，并设置 CCDB_PROFILE 和可选 CCDB_API_KEY。API Key 与已保存 OAuth 凭证二选一使用，显式环境 Key 优先。

业务工具只有 search_emission_factors 和 get_emission_factor_detail。成功返回原始 CCDB JSON 和 structuredContent；不依赖大模型 Key，不自动做建模写入，不将原始候选铺成最终推荐卡片。

本地默认端口仅在 CCDB_PROFILE=local 时生效：网关 8880、Agent 3100。OAuth 客户端默认 ccdb-connect-local，需在对应环境登记。

遇到 401/403/429 不切到旧免授权接口。登录只由用户显式执行命令发起，不在 tools/call 时后台弹浏览器。

远程 HTTP 入口仍需完成并验证后端 audience、鉴权和内部执行适配，stdio 通过不代表远程入口可发布。

## Development

```sh
npm ci
npm run verify
```

Node.js 22+. Build and pack are local; no npm publication is performed.

## 只安装 MCP

```powershell
npm install -g ./dist/releases/carbonstop-ccdb-mcp-0.1.0.tgz
ccdb-connect-mcp login --profile local
ccdb-connect-mcp status --profile local --json
```

在支持 stdio MCP 的宿主中配置（通用配置示例，宿主具体字段以其设置为准）：

```json
{
  "mcpServers": {
    "ccdb-connect": {
      "command": "ccdb-connect-mcp",
      "args": ["stdio"],
      "env": { "CCDB_PROFILE": "local", "CCDB_CLIENT_ID": "ccdb-connect-local" }
    }
  }
}
```

Windows 上宿主不能直接执行 npm `.cmd` 时，可改为 `command: "node"`，`args` 使用已安装包的 `dist/main.mjs` 绝对路径再跟 `stdio`，环境使用 `CCDB_PROFILE=local`。stdio 不接收额外命令参数。开发中可直接指向本仓库 `packages/ccdb-mcp/dist/main.mjs`。不要把 Key 写入聊天、仓库或公开配置。

MCP 仅公开两个只读工具：

```json
{
  "name": "search_emission_factors",
  "arguments": {
    "query": "电力",
    "language": "zh",
    "accountingType": "product",
    "filters": { "country": ["中国"], "year": [2024], "sourceLevel": ["国家排放因子"] },
    "limit": 5
  }
}
```

```json
{
  "name": "get_emission_factor_detail",
  "arguments": { "factorId": "1234567890123456789", "language": "zh" }
}
```

以上是 `tools/call` 的 params 示例，不是 HTTP REST 请求正文。两个工具的 `structuredContent` 与文本 JSON 保留搜索/详情各自原始结构，不把详情压缩成搜索项；原服务 `detailUrl`、扩展字段、`******` 脱敏值原样保留。候选结果不冒充最终推荐；模型选择因子时应核对地区、年份、单位、边界和来源，并引用原链接。

stdio 启动不自动弹浏览器，也不向协议 stdout 打印日志；未登录时返回可操作的认证错误，需先显式执行 `login`。

See [configuration](docs/CONFIGURATION.md), [migration](docs/MIGRATION.md), and [factor guidance](docs/FACTOR_GUIDANCE.md).

Remote deployment: [gateway and internal adapter](docs/REMOTE_MCP.md). Do not expose `serve` directly to the public Internet.
