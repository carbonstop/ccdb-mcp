# CCDB Connect MCP

npm 包保持 `ccdb-mcp-server`，命令保持 `ccdb-mcp`，新版为 2.0.0。仅提供普通 npm 包，不需要另装 CLI。发布流程见 [分发说明](docs/DISTRIBUTION.md)。

独立 Node.js 22+ MCP 包，提供 stdio、包内登录和诊断。无需另外安装 CLI 或 ccdb-client。已发布 [ccdb-mcp-server@2.0.0](https://www.npmjs.com/package/ccdb-mcp-server)。

## 从 npm 安装（推荐）

```sh
npm install -g ccdb-mcp-server
ccdb-mcp --version
```

需要固定版本时使用 `npm install -g ccdb-mcp-server@2.0.0`。镜像未同步时可追加 `--registry=https://registry.npmjs.org/`。2.x 的认证与工具接口不兼容旧 1.x，升级前请阅读 [迁移说明](docs/MIGRATION.md)。

## 本地 stdio：默认 device OAuth，API Key 为备选

仅本地 stdio 用户执行以下登录；远程连接器用户不需要在本机安装或登录此包。

```sh
ccdb-mcp login
ccdb-mcp status --json
ccdb-mcp stdio
```

`ccdb-mcp login` 默认使用 device OAuth，等价于 `ccdb-mcp login --method device`。用户在浏览器完成登录和授权；无浏览器终端可加 `--no-browser`，在另一台设备打开显示的授权链接。设备码登录不是 CLI 专属，这里是本地 MCP 的登录辅助命令，不是宿主通过 stdio 自动进行 OAuth 协商。

API Key 是用户主动选择的备选：使用 `ccdb-mcp login --method api-key` 安全输入，或通过宿主 Secret 配置 `CCDB_API_KEY`。不要在聊天、命令参数或日志里粘贴完整 Key。

默认推荐顺序不改变显式配置：`CCDB_API_KEY` 存在时仍优先于保存的凭证；要恢复 OAuth，用户需从实际启动 MCP 的环境中移除该变量并完成登录。没有环境 Key 时使用已保存的凭证；OAuth 失败不会自动改用 API Key，Key 失败也不会切换 OAuth。查询不会自动发起 device 登录。

业务工具只有 search_emission_factors 和 get_emission_factor_detail。成功返回原始 CCDB JSON 和 structuredContent；不依赖大模型 Key，不自动做建模写入，不将原始候选铺成最终推荐卡片。

本地默认端口仅在 CCDB_PROFILE=local 时生效：网关 8880、Agent 3100。OAuth 客户端默认 ccdb-connect-local，需在对应环境登记。

遇到 401/403/429 不切到旧免授权接口。登录只由用户显式执行命令发起，不在 tools/call 时后台弹浏览器。

## 远程连接器：Streamable HTTP

新增 **direct 模式**允许 WorkBuddy 直接连接 MCP 的公开 HTTPS 地址：MCP 提供 OAuth 发现，调用独立 Auth/Management 校验凭证，再调用内部业务接口，不经过业务 Gateway。后端校验契约尚需实现/联调，当前 npm 2.0.0 尚不包含此改造。见 [独立 HTTP 配置与接口契约](docs/DIRECT_HTTP.md)。同仓库保留 stdio，以下 Gateway 说明仅适用于默认的 gateway 模式。

远程优先由宿主发起 OAuth 授权（通常为授权码 + PKCE，取决于宿主支持），不是执行本地 device 登录；API Key 是宿主支持配置认证请求头时的手动备选。OAuth 失败时提示用户处理授权，不自动降级为 Key。部署人员不要先执行 device 登录来给所有远程用户共用身份。

`ccdb-mcp serve` 已提供无状态 **Streamable HTTP**，端点为 `/mcp/ccdb`。本地 stdio 与远程 HTTP 共用两个业务工具；不提供旧版 HTTP+SSE 的 `/sse`、`/messages` 双端点。

服务部署方安装 npm 包，按 [远程部署说明](docs/REMOTE_MCP.md) 配置内部执行地址、签名密钥和 Host 白名单，然后运行：

```sh
ccdb-mcp serve
```

WorkBuddy 等远程宿主选择 **Streamable HTTP**，填写部署后的 `https://<你的网关域名>/mcp/ccdb`，无需在每个用户电脑安装此 npm 包。该地址是占位示例，不是已上线服务。

必须通过网关完成 OAuth/API Key 鉴权、按用户签发内部上下文，再转发给 Node；不能直接公开 Node 端口，也不能让所有用户共用服务进程的一份登录凭证。OAuth 发现和授权由网关/Auth 提供，不由 `serve` 独立提供。协议互操作测试不等于 WorkBuddy 或生产后端已联调完成。

## 从源码开发（仅开发人员）

在克隆的仓库根目录运行，普通用户不需要这些步骤：

```sh
npm ci
npm run verify
npm install -g ./dist/releases/ccdb-mcp-server-2.0.0.tgz
```

最后一行安装刚构建的本地开发包，不是 npm registry 安装。构建不会自动发布 npm。

## 配置本地 stdio MCP 宿主

```powershell
ccdb-mcp login
ccdb-mcp status --json
```

在支持 stdio MCP 的宿主中配置（通用配置示例，宿主具体字段以其设置为准）：

```json
{
  "mcpServers": {
    "ccdb-mcp": {
      "command": "ccdb-mcp",
      "args": ["stdio"],
      "env": { "CCDB_PROFILE": "production", "CCDB_CLIENT_ID": "ccdb-connect-local" }
    }
  }
}
```

OAuth 客户端需在目标环境登记；如管理员提供不同 client_id，登录和宿主配置必须使用同一值。本地后端联调才使用 `CCDB_PROFILE=local`，并先执行 `ccdb-mcp login --profile local`。

Windows 上宿主不能直接执行 npm `.cmd` 时，可改为 `command: "node"`，`args` 使用已安装包的 `dist/main.mjs` 绝对路径再跟 `stdio`，保持登录与宿主环境一致。stdio 不接收额外命令参数。开发中可直接指向本仓库 `packages/ccdb-mcp/dist/main.mjs`。不要把 Key 写入聊天、仓库或公开配置。

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

Remote deployment: [gateway 模式](docs/REMOTE_MCP.md) / [direct 模式](docs/DIRECT_HTTP.md)。仅完成 direct 模式的认证与入口防护配置后，才对外提供 MCP HTTPS 地址。
