# 历史兼容模式：Gateway-first 部署

本文是当前 Gateway → MCP 模式的部署说明。后续 WorkBuddy → MCP → Gateway 方案尚待实现，见 [架构调整与联调前置条件](GATEWAY_BACKED_MCP.md)；不要混用两种方案的配置。

本文仅供已有 Gateway-first 部署维护，不是新部署推荐方案。唯一目标架构见 [PR #5 方案](GATEWAY_BACKED_MCP.md)：WorkBuddy → MCP → Gateway → 业务服务。目标模式尚未实现，不能套用本文的 Management 内部地址配置。PR #4 已关闭。

状态：Node 已实现无状态 Streamable HTTP。本文末尾的历史本地验收不代表生产已部署；WorkBuddy OAuth 和生产 Gateway → Node → Management → CCDB 仍需在目标环境验收。

## Streamable HTTP 协议与 WorkBuddy 接入

- 启动：配置下文的环境变量后运行 `ccdb-mcp serve`。保留默认 `stdio` 模式，不需要另一个 MCP 仓库或二进制。
- 宿主连接的是公共 HTTPS 网关 `/mcp/ccdb`，不是内部 Node 地址。WorkBuddy 选择 Streamable HTTP，用户无需先安装 npm 包。OAuth 重定向 URI 和授权方式必须按实际宿主配置核对。
- `POST /mcp/ccdb` 支持 initialize、tools/list、tools/call。客户端发送 `Accept: application/json, text/event-stream`；初始化后的请求携带协商得到的 `MCP-Protocol-Version`。
- 通知返回 HTTP 202 空正文；不生成 `Mcp-Session-Id`，不要求会话粘滞。GET/DELETE 返回 405 是无状态模式的预期行为，不表示没有支持 Streamable HTTP。
- 响应由 SDK 编码为 JSON 或 SSE；当前适配层收集完整结果后返回，以保留内部鉴权失败和限流的 HTTP 401/403/429、Retry-After。当前不提供实时进度推送、服务端订阅、断线事件重放，也不提供旧版 `/sse` + `/messages`。
- 网关须保留 Accept、Content-Type、MCP-Protocol-Version 以及 SDK 使用的 MCP-Method/MCP-Name 协议头，正确转发响应正文、Content-Type、状态码和 Retry-After。每个请求重新验证用户身份并签发内部上下文；签名密钥不得给宿主或浏览器。
- 公共未认证请求的 401、WWW-Authenticate 和 `/.well-known/oauth-protected-resource/mcp/ccdb` 发现由网关负责。仅启动 Node 不构成完整的 OAuth 连接器。

自动化验收：`tests/http.test.ts` 使用官方 `StreamableHTTPClientTransport`，通过 Fetch 适配层完成初始化、通知、列工具和查询；另测 405、406、无效协议版本以及按请求身份隔离、撤权、限流。这里不是 WorkBuddy UI、公共 TLS 或真实 OAuth 联调。

协议依据：[MCP Streamable HTTP 传输规范](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)。

## 请求链路

```text
外部宿主 → Gateway /mcp/ccdb
  校验 MCP audience 的 OAuth Token 或 CCDB_AGENT Key
  删除外部凭证和身份头，生成最长 60 秒内部签名票据
    → Node ccdb-mcp serve
      验签；握手/列工具不调用 Management
      tools/call → Management /internal/ccdb/mcp/execute
        验签、当前授权/Key、AgentBase 成员、scope、单次票据、资源配额
          → 复用原 CCDB 搜索/详情服务 → 原响应字段返回
```

REST 资源为 `<网关>/management/api/ccdb/v1`；MCP 资源为 `<网关>/mcp/ccdb`。二者不互通 Token。授权码、设备码和 Refresh Token 绑定申请时的资源；换码/刷新不能切换资源。旧 Refresh Token 的 resource_uri 为空时按原 REST 资源处理。

节点仅接受配置的 Management 内部 URL。它不会把外部 Bearer 或 Key 转发到另一个资源服务器。Management 不接受正文 userId/companyId 覆盖身份，也不接受 `from-source: inner` 代替签名。公开网关明确拦截 `/management/internal/ccdb/mcp/**` 及 `/internal/ccdb/mcp/**`。

## 本地准备顺序

1. 先对现有 Management 数据库执行 `carbon260311/sql/ccdb_oauth_resource_binding_20260907.sql`。这是新增 resource_uri 字段的 MySQL 5.7 幂等脚本，不删除存量数据。本轮未代为执行。
2. 配好 Auth/Gateway/Management 的资源 URI。三者必须一致。MCP 开关默认 false；未完成新版本和迁移前不要开启。
3. 为 Gateway、Node 和 Management 配置同一组内部签名密钥；只放本地私密配置/环境，不放 npm 包、前端或公开仓库。
4. 编译/重启相关服务以加载新代码和 SQL 映射，再启动 Node。这里只给顺序，不自动停止用户已启动的服务。
5. 验证内部节点 health、Gateway 公共发现、未认证 401、OAuth 资源绑定，再做工具查询及限流。

### 后端配置示例

三个服务的配置中合并以下字段（不要重复创建同名 YAML 根节点）：

```yaml
agent:
  oauth:
    issuer: http://127.0.0.1:8880/auth
    web-url: http://127.0.0.1:3100
    resource: http://127.0.0.1:8880/management/api/ccdb/v1
    mcp-resource: http://127.0.0.1:8880/mcp/ccdb
    mcp-enabled: false # 全部服务、SQL 和 Node 就绪后才开启
```

Gateway 和 Management 额外配置（Auth 不需要签名密钥）：

```yaml
ccdb:
  mcp:
    context-keys: '${CCDB_MCP_CONTEXT_KEYS:}' # JSON：kid → 至少 32 字节 Base64 密钥
    signing-key-id: local-v1 # Gateway 签发用；Management 只读取 keys
    target: http://127.0.0.1:3400 # 仅 Gateway，内部 Node 根地址
    transport-qps: 20 # 仅 Gateway，独立 IP 传输桶，不是因子额度
    allowed-origins: http://127.0.0.1:3100 # 仅 Gateway；空值表示不允许浏览器跨域，非浏览器不受影响
```

禁止使用文档中公开的固定测试密钥。用密码学随机生成至少 32 字节，作为 JSON 字符串存入三个运行进程的环境。密钥 ID 可轮换：先让三方同时接受新旧 kid，再让 Gateway 改用新 kid，等旧票据最长 60 秒过期后移除旧 kid。

### Node 进程配置

```powershell
$env:CCDB_MCP_RESOURCE='http://127.0.0.1:8880/mcp/ccdb'
$env:CCDB_MCP_EXECUTION_URL='http://127.0.0.1:你的Management实际端口/internal/ccdb/mcp/execute'
$env:CCDB_MCP_HOST='127.0.0.1'
$env:CCDB_MCP_PORT='3400'
$env:CCDB_MCP_ALLOWED_HOSTS='127.0.0.1:3400'
$env:CCDB_MCP_ALLOWED_ORIGINS='http://127.0.0.1:3100'
# CCDB_MCP_CONTEXT_KEYS 由私密环境注入，不在此粘贴密钥。
node ./packages/ccdb-mcp/dist/main.mjs serve
```

Management 端口必须读取本地真实启动配置，不能照抄占位符。不要将内部 execute URL 配成公开网关，否则会被 404 拦截。非本机内部 HTTP 默认拒绝；受控内网确需 HTTP 时须显式 `CCDB_MCP_ALLOW_INSECURE_INTERNAL_HTTP=true`，生产优先 HTTPS/mTLS 和网络访问控制。

Gateway 转发后的 Host 应为内部 Node 主机；若网关配置了 PreserveHost，需去掉该选项或在 Node 精确 Host 白名单配置实际值，不允许 `*`。Origin 白名单只填真实需要的浏览器来源。

## 公开接口与内部接口

| 接口                                                 | 用途                                                  |
| ---------------------------------------------------- | ----------------------------------------------------- |
| GET `/.well-known/oauth-protected-resource/mcp/ccdb` | MCP 独立资源发现，关闭时 404                          |
| POST `/mcp/ccdb`                                     | MCP JSON-RPC / 协议传输入口，公共凭证止于网关         |
| POST `/auth/oauth/token`                             | 沿用原端点；resource 必须与本次授权一致               |
| POST `/internal/ccdb/mcp/execute`                    | 仅 Management 内网，Node 调用；绝不供外部宿主直接调用 |

MCP 未认证返回 HTTP 401 和 `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp/ccdb"`。权限不足为 403；配额不足为 429 和 Retry-After。已有 REST 的 discovery、Token audience、响应结构不改变。

工具业务配额的 429 也保留为 HTTP 429，不包装成 HTTP 200；内部服务提供的 Retry-After 和 requestId 会保留。Node 不自动重试工具请求，不复用已执行的内部票据。调用方应按 Retry-After 等待后再发起新请求，不能切换凭证绕过额度。

内部 execute 正文示例：

```json
{
  "tool": "search_emission_factors",
  "arguments": {
    "query": "电力",
    "language": "zh",
    "accountingType": "product",
    "filters": { "country": ["中国"], "year": [2024] },
    "limit": 5
  }
}
```

```json
{
  "tool": "get_emission_factor_detail",
  "arguments": { "factorId": "1234567890123456789", "language": "zh" }
}
```

必须携带网关签发的 `X-CCDB-Execution-Context`，不能由对接同事手工拼造用户身份。一张票据只能执行一次，重复执行拒绝；业务超时也不要重发同一票据。客户端重新发公共 MCP 请求时由网关重新鉴权签发。

内部票据不含原 Token、原 Key 或 Secret Hash。`keyVersion` 是 Secret Hash 的二次摘要，只用于核对 Key 是否重置，不能用于公共认证。用户 ID 和组织 ID 使用字符串，Java/Node 不经 Number 转换。

## 验收门槛

- 握手、tools/list：无因子业务调用，不消耗因子日额度；仍受独立传输限流。
- 每次 tools/call：按当前生效策略的 CREDENTIAL/USER 等维度各计一次；沿用 REST 相同 Redis 维度键，不能多入口绕过总额度。
- 两个用户交错调用：票据、用户、组织、授权均独立，不使用全局 OAuth/Key 单例。
- OAuth 撤销、Key 停用/重置：Management 在工具调用时查当前状态，旧内部票据也被拒绝。
- 成功的 MCP Key 工具调用通过审计事务更新 Key 最近使用时间/IP 和调用次数；requestId 去重，审计重试不重复计数，乱序事件不倒退最近使用时间。握手、列工具、失败及拒绝请求不计入 Key 的成功使用次数，失败审计仍保留。
- 旧业务 Key、REST Token、错误 audience、伪造/过期/重放票据：均不得得到因子业务响应。
- 原因子脱敏、详情字段、detailUrl 和搜索限制由同一业务实现负责。
- 在本地真实三服务和 CCDB 可访问后，补全真实授权 → 调用 → 撤销、双用户、计数和审计验证；现有模拟测试不是该项的替代品。

外部宿主是否支持手工 client_id、远程 OAuth、设备码及安装格式，需要逐个宿主验证。不能因为 SDK 测试通过就声明 Codex、豆包、WorkBuddy 全部已兼容。

## 本机可重现启动配置

原开发工作区的本地配置与启动脚本在独立的 `ccdb-integration-lab/config` 目录，不随本仓库分发。新开发者请按本文配置示例建立自己的本地配置和私密签名密钥，不复制或索要他人凭证。2026-09-07 本地已完成资源绑定迁移、开启 MCP 并重启服务，设备码授权和真实搜索/详情链路通过；范围及剩余验收见 [VERIFICATION.md](VERIFICATION.md)。这不表示预发或生产已启用。
