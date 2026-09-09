# CCDB Connect MCP

npm 包：`ccdb-mcp`；命令：`ccdb-mcp`。升级前请阅读仓库中的迁移说明，旧工具接口可能不兼容。

独立 Node.js 22+ MCP 包，提供 stdio、包内登录和诊断。无需另外安装 CLI 或 ccdb-client。

## 从 npm 安装

```sh
npm install -g ccdb-mcp@latest
ccdb-mcp --version
```

再次执行上述命令可升级到 npm latest。镜像未同步时追加 `--registry=https://registry.npmjs.org/`。数据库访问仍需有效授权和可用后端。

从旧包迁移：先执行 `npm uninstall -g ccdb-mcp-server`，再安装新包，避免同名命令冲突。无需执行 logout 或删除凭证；命令、凭证位置和 OAuth client ID 不变。使用 `npx` 的宿主和部署配置需将包名改为 `ccdb-mcp@latest`。

## 本地 stdio：默认 device OAuth，API Key 为备选

仅本地 stdio 用户执行以下登录；远程连接器用户不需要在本机安装或登录此包。

```sh
ccdb-mcp login
ccdb-mcp status --json
```

`stdio` 是由 MCP 宿主启动并管理的常驻进程，不是安装完成后等待退出的一条检查命令。登录完成后配置宿主的 `command: "ccdb-mcp"`、`args: ["stdio"]`，由宿主负责启动。

`ccdb-mcp login` 默认使用 device OAuth，等价于 `ccdb-mcp login --method device`。用户在浏览器完成登录和授权；无浏览器终端可加 `--no-browser`，在另一台设备打开显示的授权链接。设备码登录不是 CLI 专属，这里是本地 MCP 的登录辅助命令，不是宿主通过 stdio 自动进行 OAuth 协商。

API Key 是用户主动选择的备选：使用 `ccdb-mcp login --method api-key` 安全输入，或通过宿主 Secret 配置 `CCDB_API_KEY`。不要在聊天、命令参数或日志里粘贴完整 Key。

默认推荐顺序不改变显式配置：`CCDB_API_KEY` 存在时仍优先于保存的凭证；要恢复 OAuth，用户需从实际启动 MCP 的环境中移除该变量并完成登录。没有环境 Key 时使用已保存的凭证；OAuth 失败不会自动改用 API Key，Key 失败也不会切换 OAuth。查询不会自动发起 device 登录。

业务工具只有 search_emission_factors 和 get_emission_factor_detail。成功返回原始 CCDB JSON 和 structuredContent；不依赖大模型 Key，不自动做建模写入，不将原始候选铺成最终推荐卡片。

链接展示：工具描述和 Server instructions 会引导宿主在搜索、详情及比较结果中保留因子的可点击详情链接；工具结果也会附加基于返回地址生成的 Markdown 链接文本，原始 JSON 不变。缺失或明显包含凭证的地址不生成附加链接，不承诺受限数值可解锁。最终是否渲染链接由宿主决定，无需额外安装 Skill 才能收到这些指引。

环境与 OAuth 客户端配置见 [配置说明](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/CONFIGURATION.md)。

遇到 401/403/429 不切到旧免授权接口。登录只由用户显式执行命令发起，不在 tools/call 时后台弹浏览器。

### 测试环境：登录和宿主保持一致

```sh
ccdb-mcp login --profile test
ccdb-mcp status --profile test --json
```

然后在宿主配置中使用相同的 profile（具体字段以宿主设置为准）：

```json
{
  "mcpServers": {
    "ccdb-mcp": {
      "command": "ccdb-mcp",
      "args": ["stdio"],
      "env": { "CCDB_PROFILE": "test" }
    }
  }
}
```

由宿主加载/重启该连接，不要在安装终端另行启动 stdio。登录与宿主须使用相同系统用户；若显式设置 client ID 或其他凭证配置，两边也必须一致。图形宿主找不到命令时，使用已安装可执行入口的绝对路径，或修正宿主 PATH，不要仅因命令找不到就重复登录。

### 如何确认接入成功

1. `ccdb-mcp --version` 成功：仅证明程序可执行。
2. `ccdb-mcp status --profile test --json`：检查本地 test 凭证，不证明远程权限。
3. 宿主连接后能列出 `search_emission_factors` 和 `get_emission_factor_detail`：证明协议接入成功。
4. 用户需要查询时，完成一次小范围搜索，并按需要用其真实 ID 查询详情：验证业务链路。空结果或受限数值不等于接入失败，不为验收批量查询或额外消耗配额。

远程连接器跳过本地安装和 status，由宿主完成授权后检查工具列表和业务响应。

## 远程连接器：Streamable HTTP

当前采用 Gateway-first 架构：

```text
用户授权：WorkBuddy → Gateway/Auth（OAuth + PKCE）
协议请求：WorkBuddy → Gateway /mcp/ccdb → 内网 MCP
工具执行：MCP → Gateway /internal/ccdb/mcp/execute → Management → CCDB
```

宿主填写 Gateway 的公开 MCP URL，不连接内部 Node。Gateway 每次校验 OAuth Token 或 API Key，生成短时签名票据；MCP 验票并仅向 Gateway 发出工具执行请求。MCP 不直接调用 Management，不另建登录页、Token 签发或 Token Exchange。API Key 为宿主支持认证头时的显式备选，不自动降级。

远程用户只需使用服务方提供的公开 Gateway MCP URL，并在宿主中完成 OAuth；宿主支持认证头时可显式选择 API Key。内部 `serve` 服务的部署由管理员负责，不应直接暴露公网。

见 [当前架构](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/GATEWAY_BACKED_MCP.md) 和 [部署配置](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/REMOTE_MCP.md)。


默认凭证目录为 `~/.config/carbonstop/ccdb/`（支持系统配置根目录覆盖）。旧目录已有的身份继续沿用原文件和锁，不复制 Token；新身份写入新目录。`CCDB_CONFIG_DIR` 可显式指定独立目录。
