# Gateway-first 远程 MCP 部署

这是当前采用的架构，不再是历史兼容方案。见 [架构说明](GATEWAY_BACKED_MCP.md)。本地 stdio 不变，远程用户无需安装 CLI/MCP 包。

```text
WorkBuddy → Gateway /mcp/ccdb → 内网 MCP
                              MCP → Gateway /internal/ccdb/mcp/execute → Management
```

## 地址与路由

| 配置 | 测试环境示例 | 用途 |
| --- | --- | --- |
| 宿主 URL / CCDB_MCP_RESOURCE | https://gateway-base-test.carbonstop.com/mcp/ccdb | 公开 MCP 入口和 OAuth resource |
| CCDB_MCP_EXECUTION_URL | https://gateway-base-test.carbonstop.com/internal/ccdb/mcp/execute | MCP 执行回程，只携带票据 |
| Gateway ccdb.mcp.target | http://ccdb-mcp:3400 | Gateway 可达的内网 MCP 根地址，按部署调整 |
| OAuth issuer | https://gateway-base-test.carbonstop.com/auth | 授权服务器 |

回程由 Gateway 固定转发 Management，不返回 MCP，不形成循环。不要将 token/register URL、Management 地址或公共 `/mcp/ccdb` 填到执行 URL。出站目标仅由运维配置，不接受工具参数指定 URL。

## 发布顺序

1. 后端提交并发布 Gateway 执行路由，确认无票据请求被拒绝（功能关闭可能为 404）。本次回程调整据后端说明不新增 SQL；旧环境已有的 OAuth/resource 迁移仍需后端确认。
2. 确认 Gateway/Auth/Management 的 MCP resource 一致，Gateway target 指向 MCP，签名配置通过 Secret 系统管理。
3. 将 MCP 执行目标改为 Gateway，再重启 MCP。仅切环境变量不会替你发布后端。
4. 配置 Gateway 公共 HTTPS、证书、资源发现、宿主客户端登记，完成端到端验收。

## MCP 部署

使用 [Compose 模板](../deploy/docker-compose.yml)，将 [环境模板](../deploy/.env.example) 复制为 deploy/.env 并核对环境。通过部署平台注入 CCDB_MCP_CONTEXT_KEYS（JSON kid → Base64，至少 32 字节随机密钥）；模板不提供可用密钥，不能将密钥粘贴到聊天、Git 或命令参数。

```sh
docker compose config --quiet
docker compose up -d
```

以上在 deploy 目录执行。不要将展开 Secret 的完整 compose config 输出作为公开排障材料。模板不发布宿主端口，仅供同 Docker 网络的 Gateway 访问 `ccdb-mcp:3400`；其他网络或 Kubernetes 要配置实际可达地址。生产建议构建固定版本的内部镜像；模板固定 npm 2.0.0，首次启动仍需访问 npm。

| 环境变量 | 说明 |
| --- | --- |
| CCDB_MCP_RESOURCE | Gateway 完整公开 /mcp/ccdb URL |
| CCDB_MCP_EXECUTION_URL | Gateway 完整 /internal/ccdb/mcp/execute URL，不允许 Query |
| CCDB_MCP_CONTEXT_KEYS | Secret 注入的验签密钥，不公开 |
| CCDB_MCP_HOST | 容器用 0.0.0.0，本机可用 127.0.0.1 |
| CCDB_MCP_PORT | 示例和默认均为 3400 |
| CCDB_MCP_ALLOWED_HOSTS | 精确白名单，包含探针 Host 和 Gateway 转发后的实际 Host |
| CCDB_MCP_ALLOWED_ORIGINS | 精确浏览器来源；空值禁止浏览器跨域，不影响无 Origin 请求 |
| CCDB_TIMEOUT_MS | 默认 30000，范围 100–120000 毫秒 |
| CCDB_MCP_MAX_CONCURRENT | 默认 100 |

Gateway 若保留公共 Host，应将该 Host 精确加入白名单，不用 `*`。Origin 只填真实需要的来源，不能凭 OAuth 授权页域名推断宿主 Origin。非本机出站 HTTP 默认拒绝；受控内网确需时显式设置 CCDB_MCP_ALLOW_INSECURE_INTERNAL_HTTP=true，优先 HTTPS。本地执行回程为 `http://127.0.0.1:8880/internal/ccdb/mcp/execute`，不是 Management 端口。

启动使用 `ccdb-mcp serve`，不需要 --http/--port；地址端口使用环境变量。不传命令默认 stdio。

## 协议与 Gateway 要求

- 公共 POST /mcp/ccdb 支持 initialize、notifications/initialized、tools/list、tools/call；保留 Accept、Content-Type、MCP-Protocol-Version、MCP-Method/MCP-Name。
- Accept 包含 application/json 和 text/event-stream。通知为 HTTP 202 空正文；无 Mcp-Session-Id，不需要会话粘滞。GET/DELETE 不提供独立流（有效身份下 405），没有旧 /sse + /messages。
- 当前适配器缓冲完整结果后返回 JSON 或 SSE，以保留 401/403/429；没有实时进度、订阅或断线重放。代理须保留正文、Content-Type、HTTP 状态与 Retry-After，设置匹配超时。
- Gateway 提供 `/.well-known/oauth-protected-resource/mcp/ccdb` 和公共未认证 401 的 WWW-Authenticate。Node 仅提供内部 /health 和票据保护的 /mcp/ccdb，不是用户认证入口。
- Gateway 每次验证用户身份，清除原 Token/Key 和伪造内部身份头后签发票据；执行入口再次验票但不提前消费。Management 消费票据、校验当前授权、执行配额和审计。
- 只开放有票据校验的精确 POST 执行路由，不放开 /management/internal/ccdb/mcp/** 或整个 /internal/**。宿主不调用执行接口。

## 执行协议

POST {gateway}/internal/ccdb/mcp/execute，携带 X-CCDB-Execution-Context、Content-Type、Accept；不附 Authorization/X-API-Key、Query 或正文用户/组织/下游地址。

```json
{
  "tool": "search_emission_factors",
  "arguments": { "query": "电力", "language": "zh", "limit": 2 }
}
```

```json
{
  "tool": "get_emission_factor_detail",
  "arguments": { "factorId": "1234567890123456789", "language": "zh" }
}
```

详情 ID 必须替换为搜索实际返回的字符串。搜索裸对象、详情 code/msg/data 包装、guidance、掩码值和 detailUrl 保留。

MCP 验票据签名、有效期、issuer/audience、sourceResource。票据最长 60 秒，每请求独立，一张最多执行一个工具。初始化/列工具不调用执行接口。执行不自动重试，超时不表示未执行，不复用票据或切共享 Key。401/403/429 保持 HTTP 错误及可用 Retry-After，不返回成功空数组。

## 上线验收

- metadata resource/issuer 与实际环境一致；预注册或已启用且公布的 DCR。
- 真实宿主 PKCE、初始化、通知、列工具、搜索、详情、刷新和撤权。
- 无效/错误 audience/过期凭证，伪造/重放票据、Key 停用、双用户隔离、权限和限流。
- 初始化/列工具不消耗因子额度，工具调用不重复计费，保留 requestId 审计。
- MCP 出站仅到 Gateway，不直接访问 Management，两个路由不循环。

自动测试使用模拟后端，不替代真实 WorkBuddy/TLS/后端验收。后端报告通过部分本地真实测试，但当时修改未提交或发布测试环境，不能标记为生产可用。
