# 独立 HTTP MCP（direct 模式）

状态：MCP 适配代码已实现；凭证校验接口是新增后端契约，尚未确认后端实现/部署。当前 npm 2.0.0 不包含本次改造。不能仅修改环境变量就宣称生产可用。

## 架构与职责

```text
WorkBuddy → HTTPS Ingress → MCP /mcp/ccdb
  首次：MCP 返回 401 + OAuth 资源发现
  授权：WorkBuddy ↔ Auth（授权码 + PKCE）
  每次请求：MCP → 独立 Auth/Management 凭证校验接口
  工具调用：MCP → Management 内部执行接口 → CCDB
```

Ingress 只负责 TLS、路由和入口限流，不需要业务 Gateway 的鉴权/签名逻辑。MCP 不依赖 Gateway，但仍依赖权威认证和业务服务；本方案每个请求远程校验，不是本地 JWT 离线验签。这样 OAuth 撤权、API Key 停用可以即时生效，不缓存认证成功结果。

同一个 npm 包继续支持默认 stdio（device 登录辅助）、gateway HTTP（原模式）和 direct HTTP。没有共享管理员登录，客户端不能提交 userId/companyId 或内部票据来选择身份。公开 Token 仅发给明确配置的凭证校验服务，不透传给业务 API。

MCP 提供 GET `/.well-known/oauth-protected-resource/mcp/ccdb`（以及根资源发现路径）。Auth 仍须提供标准授权服务器元数据、注册/预登记宿主、精确回调、PKCE S256、resource 绑定及授权/换码/刷新。不要在 MCP 模拟用户同意或替 WorkBuddy生成 PKCE verifier。首次权限申请、回调兼容性需要真实宿主联调。

## 配置

保留原 HTTP 配置，额外配置下列环境变量；示例地址均为占位符：

```yaml
CCDB_MCP_AUTH_MODE: direct
CCDB_MCP_RESOURCE: https://mcp.example.com/mcp/ccdb
CCDB_MCP_AUTH_ISSUER: https://auth.example.com/auth
CCDB_MCP_AUTHENTICATE_URL: https://management.internal.example/internal/ccdb/mcp/authenticate
CCDB_MCP_EXECUTION_URL: https://management.internal.example/internal/ccdb/mcp/execute
CCDB_MCP_HOST: 0.0.0.0
CCDB_MCP_PORT: "3000"
CCDB_MCP_ALLOWED_HOSTS: mcp.example.com,127.0.0.1:3000
```

通过 Secret 注入 `CCDB_MCP_AUTH_SERVICE_TOKEN`（认证接口专用服务凭证）和 `CCDB_MCP_CONTEXT_KEYS`（内部票据验证密钥映射）。不在源码、镜像或日志保存真实凭证。启动命令仍为 `ccdb-mcp serve`，默认模式仍为 gateway，以兼容旧部署。公开 URL、issuer 必须与后端注册配置精确一致。校验地址要求 HTTPS，本机测试除外；禁止重定向。不要配置为公共 Gateway。

入口设置 TLS、限流、可信代理策略；限制内部接口网络访问，认证接口使用专用服务凭证并支持轮换。Host 白名单必须匹配代理实际转发 Host；探针使用白名单 Host 访问 `/health`。需要跨域时仅允许真实宿主 Origin。公网仅暴露 MCP 和发现路径，不暴露内部校验/执行接口。

## 待后端实现的凭证校验契约

以下是项目内部协议，不是假设已存在的标准 introspection 接口。路径由 `CCDB_MCP_AUTHENTICATE_URL` 配置。

请求：POST，`Authorization: Bearer <专用服务凭证>`，Content-Type application/json。

```json
{
  "credentialType": "OAUTH",
  "credential": "<本次用户Token或Key>",
  "resource": "https://mcp.example.com/mcp/ccdb",
  "requestId": "<MCP为本次请求生成的UUID>"
}
```

`credentialType` 为 OAUTH 或 API_KEY。MCP 接收 Authorization Bearer 或 X-API-Key，拒绝两者同时提供；不自动降级、不使用本地保存的 OAuth、也不使用进程 CCDB_API_KEY。

后端必须先验证服务凭证，限定该服务允许申请的 resource，然后验证用户凭证：Token 签名/活动状态、issuer、audience/resource、有效期、当前授权/版本、scope、组织成员；API Key 的哈希、状态、版本、CCDB 权限及绑定身份。不能只解析 JWT payload，也不能接受 REST audience 的 Token 来访问 MCP。认证请求不消费因子查询额度。不要记录原始请求体、认证头或返回票据。

成功返回 HTTP 200：`{"executionContext":"<签名JWT>"}`。票据沿用 `src/execution-context.ts` 的严格契约：HS256、kid、aud=ccdb-mcp-execution、最长 60 秒、唯一 jti、精确 sourceResource、原样 requestId、用户/公司字符串 ID、实际 scope、互斥 OAuth 或 Key 身份字段。为兼容既有内部执行接口，iss 保持 ccdb-gateway；这只是历史协议标识，签发者可为该内部认证服务，不能根据这个名字省略签名校验。身份必须从权威存储取得，禁止从调用方传入的字段取得。

MCP 验签并核对资源、时效、requestId 和 authType；只把票据发给内部 execute。Management 继续复核当前权限、版本、单次票据及查询配额，避免认证与执行之间撤权的竞态。若有按客户端 IP 的策略，需另外设计受信任的来源传递；当前适配器不信任外部 X-Forwarded-For，也不声称保存了用户真实 IP。

失败约定：用户凭证无效/撤销 401，无权限 403，服务凭证失效或后端故障 5xx。MCP 对异常、无效票据、超大响应、网络故障返回 503 并拒绝执行，不泄漏后端错误正文。不自动重试校验或执行。服务端设置请求体上限，校验成功响应不得超过 16 KiB。

## 验收边界

自动化测试覆盖无认证发现、401 challenge、官方 SDK 握手/列工具/查询、并发身份隔离、API Key、伪造票据、双凭证、撤销和故障关闭。测试校验服务为 mock，不证明真实 Auth、PKCE、Management 或 WorkBuddy 已接通。

上线前必须完成真实后端契约实现与联调、跨 audience 拒绝、授权撤销/Key 停用、配额、HTTPS 和入口限流验收。参考 [MCP 授权规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)。
