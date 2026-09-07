# CCDB Connect MCP

npm 包：`ccdb-mcp-server@2.0.0`；命令：`ccdb-mcp`。与旧 1.x 保持名称，不保证工具接口兼容。

独立 Node.js 22+ MCP 包，提供 stdio、包内登录和诊断。无需另外安装 CLI 或 ccdb-client。

## 从 npm 安装

```sh
npm install -g ccdb-mcp-server
ccdb-mcp --version
ccdb-mcp login --method device --no-browser
ccdb-mcp status --json
ccdb-mcp stdio
```

固定版本：`npm install -g ccdb-mcp-server@2.0.0`。镜像未同步时追加 `--registry=https://registry.npmjs.org/`。数据库访问仍需有效授权和可用后端。

宿主以 stdio 启动本命令，并设置 CCDB_PROFILE 和可选 CCDB_API_KEY。API Key 与已保存 OAuth 凭证二选一使用，显式环境 Key 优先。

业务工具只有 search_emission_factors 和 get_emission_factor_detail。成功返回原始 CCDB JSON 和 structuredContent；不依赖大模型 Key，不自动做建模写入，不将原始候选铺成最终推荐卡片。

本地默认端口仅在 CCDB_PROFILE=local 时生效：网关 8880、Agent 3100。OAuth 客户端默认 ccdb-connect-local，需在对应环境登记。

遇到 401/403/429 不切到旧免授权接口。登录只由用户显式执行命令发起，不在 tools/call 时后台弹浏览器。

远程 HTTP 入口仍需完成并验证后端 audience、鉴权和内部执行适配，stdio 通过不代表远程入口可发布。
