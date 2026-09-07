# 目标架构：宿主直连 MCP，后端统一经 Gateway

状态：架构调整与联调前置说明，不是已实现的新运行模式。当前 main/npm 的 `serve` 仍采用 Gateway 在 MCP 前面的模式。这是唯一采用的远程目标架构。PR #4 的直接调用内部认证和 Management 方案已关闭，不采用；不得按旧 direct 配置上线。

## 请求链路

```text
用户授权：WorkBuddy → Gateway/Auth 的现有 OAuth 服务
工具请求：WorkBuddy → MCP 的公开 HTTPS 地址 → Gateway → Management / CCDB
```

MCP 独立提供 Streamable HTTP 端点及资源发现。Gateway 继续作为唯一后端访问入口，集中承载认证接口、业务 API、权限、额度和审计。Management 不对 MCP 部署环境或公网开放，不要求 MCP 配置 Management Service 地址。

一套仓库仍维护两种传输：本地 stdio（默认 device OAuth，API Key 为用户主动选择的备选）和远程 HTTP（宿主 OAuth + PKCE）。远程 MCP 不登录共享管理员账号，不使用本地 CLI 的凭证文件。PKCE 是宿主和现有 OAuth 服务间的流程，MCP 不重新实现登录页、授权页或发 Token。

## 已知可复用能力与未确认部分

测试 Gateway 的 `/.well-known/oauth-authorization-server/auth` 已公布：

- issuer: `https://gateway-base-test.carbonstop.com/auth`
- authorization_endpoint: `https://agenttest.carbonstop.com/oauth/authorize`
- token_endpoint: `https://gateway-base-test.carbonstop.com/auth/oauth/token`
- revocation_endpoint 和 device_authorization_endpoint
- authorization_code、refresh_token、device_code、PKCE S256

当前客户端代码使用下列 Gateway REST 路径；这里只是源码契约，不代表本次已完成真实授权调用：

- `POST /management/api/ccdb/v1/factors/search`
- `GET /management/api/ccdb/v1/factors/{factorId}?language=zh`

已查到的公开 OAuth metadata 没有公布 introspection/JWKS 或 Token Exchange 能力。未公布不代表没有实现，必须向后端确认。不能凭空假定 `/check_token` 或某个自定义认证 URL 存在。

## Token 边界：实现前必须选定一种后端支持的方式

MCP 的 resource 是自己的公开 HTTPS 地址；现有 CLI REST resource 是 Gateway `/management/api/ccdb/v1`。不能为了少一个接口就把这两个资源当成相同，不能把未经验证的 MCP Token 直接交给 REST API，也不能只解析 JWT payload 来认定身份。

后端需要说明现有受支持路径：

1. MCP 验证面向自己的 Token，再经现有 Token Exchange/委托机制取得面向 REST 的短时用户凭证，使用 Gateway REST API；或
2. Gateway 已有面向 MCP resource 的受保护业务适配能力，验证同一逻辑 MCP 资源的凭证并执行原有业务。需明确 Gateway 在该资源中的信任边界、适配路由和鉴权契约；不能把独立资源之间的 Token 透传称作适配。

这些是待核对选项，不是要求后端新增两套接口，也不是默认两者都已存在。若现有后端两种都不支持，需先明确最小后端改造，再实现远程模式。

API Key 同样需要校验状态、CCDB 权限、用户/组织和配额；HTTP 初始化/列工具也不能靠无效 Key 放行。必须明确已有校验能力，不通过查询因子来消耗额度进行“试探认证”。

## 实现约束

- 所有认证/业务 HTTP 出站仅发向配置且受信任的 Gateway 地址，不从工具参数、Token 的任意 URL 或发现响应动态选择业务目标。
- Token 校验包含 issuer、签名或权威活动状态、audience/resource、有效期、scope、撤权策略；API Key 由权威后端验证。
- 如需换取下游 Token，按用户/授权隔离并校验目标资源，不退回服务端管理员 Key；不复用本地凭证文件，不自动切换认证身份。
- 凭证请求禁止重定向；错误及日志不得回显 Token、Key 或客户端密钥。
- 保留 Gateway 的 401/403/429、Retry-After 和业务响应结构；实际权限、额度及审计继续由后端执行。
- MCP 对外提供 HTTPS、精确 Host/Origin 白名单和入口限流。内部服务无需公开。

## 部署说明变更

PR #4 引入的 `CCDB_MCP_AUTHENTICATE_URL`、`CCDB_MCP_AUTH_SERVICE_TOKEN`、直连 Management 的 `CCDB_MCP_EXECUTION_URL` **不是目标直连模式的部署前提**。不要把 `/auth/oauth/token` 填到一个自定义校验接口位置，也不要只将内部地址替换成 Gateway 域名后假定协议兼容。

但当前已有 gateway-first 运行模式仍需要它原来的内部配置；本文没有删除或修改该模式。新的运行模式及环境变量须在上述认证契约明确后实现、测试和发布，不能在现有 npm 2.0.0 上只改变量启用。

## 后端需要提供的信息

1. Gateway/Auth 源码位置，或实际 Token 校验、Key 校验接口契约（含服务间认证，不包含真实密钥）。
2. MCP 独立域名对应的 resource 配置，以及凭证进入 Gateway 业务 API 的受支持方式。
3. Gateway 现有查询/详情接口的授权要求，撤权与配额行为。
4. WorkBuddy 客户端登记、精确回调及可联调环境。

## 合并/发布前验收

实现并验证：无认证发现、真实 PKCE 授权、初始化/列工具/查询、刷新、错误 audience 拒绝、撤权、Key 停用、跨用户隔离、限流。通过调用记录确认工具链路为 MCP → Gateway，MCP 没有调用 Management 内部地址。Mock 测试不能替代以上真实联调。

参考：[MCP 授权与 Token audience 规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)。
