# CCDB MCP

将 Carbonstop 碳阻迹 CCDB 排放因子查询能力接入支持 MCP 的 AI 助手。支持因子搜索与详情查询，帮助用户核对单位、地区、年份、系统边界和数据来源。

查询结果中的详情链接可引导用户进入 [Carbon Agent](https://agent.carbonstop.com)，查看对应因子及其适用信息。数据可见范围取决于账号权限与数据许可，登录不代表所有数值均可解锁。

## 快速开始

根据你的 AI 助手支持的接入方式，选择远程连接或本地 stdio，两者任选其一。

### 方式一：远程连接（Streamable HTTP）

适用于支持远程 MCP 的 AI 助手：

1. 向服务方获取当前环境的公开 Gateway MCP URL，路径为 `/mcp/ccdb`，填入宿主的远程 MCP 配置。
2. 按宿主提示在浏览器完成 OAuth 授权。
3. 连接后确认能看到 `search_emission_factors` 和 `get_emission_factor_detail` 两个工具，再提出查询问题。

远程用户不需要在本机安装 Node.js 或 npm 包。API Key 仅在宿主支持安全配置认证头时作为主动选择的备选；OAuth 失败不会自动切换认证方式。

请使用服务方提供的公开入口，不要把内部 `serve` 地址填入连接器。服务部署由管理员负责，见 [远程部署说明](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/REMOTE_MCP.md)。

### 方式二：本地连接（stdio）

#### 1. 安装

需要 Node.js 22+、npm，以及支持启动本地 stdio MCP 的 AI 助手。

```sh
npm install -g ccdb-mcp@latest
ccdb-mcp --version
```

再次执行安装命令可升级。镜像未同步时可追加 `--registry=https://registry.npmjs.org/`。已有旧包安装或跨越不兼容版本时，请先阅读 [迁移说明](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/MIGRATION.md)，避免命令冲突。

#### 2. 登录

首次使用时执行：

```sh
ccdb-mcp login
ccdb-mcp status --json
```

默认使用 device OAuth，由你在浏览器完成登录与授权；已有有效凭证时无需重复登录。无浏览器终端可加 `--no-browser`，在另一设备打开终端显示的授权链接。PKCE 可通过 `--method pkce` 显式选择。

API Key 是主动选择的备选：使用 `ccdb-mcp login --method api-key` 的不回显输入，或通过宿主安全配置注入 `CCDB_API_KEY`。不要在聊天、命令参数、仓库或日志里提供完整 Key。

显式设置的 `CCDB_API_KEY` 优先于已保存的凭证；OAuth 失败不会自动改用 Key，Key 失败也不会自动切换 OAuth。恢复 OAuth 时，需从实际启动 MCP 的环境中移除该变量。查询不会自动启动登录或弹出浏览器。

#### 3. 配置 AI 助手

在宿主的 MCP 设置中添加以下配置（具体字段以宿主说明为准）：

```json
{
  "mcpServers": {
    "ccdb-mcp": {
      "command": "ccdb-mcp",
      "args": ["stdio"],
      "env": { "CCDB_PROFILE": "production" }
    }
  }
}
```

由宿主加载或重启连接，并管理 stdio 常驻进程；不必在安装终端手动运行 stdio 等待退出。登录和宿主运行须使用相同系统用户、profile 及凭证配置。

默认环境为 production。只有使用测试环境时，才执行 `ccdb-mcp login --profile test`，并把宿主的 `CCDB_PROFILE` 同步设为 `test`；检查状态时也使用 `ccdb-mcp status --profile test --json`。显式环境变量仍可覆盖预设地址和客户端 ID，详见 [配置说明](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/CONFIGURATION.md)。

## 可以这样问

- “查找适用于中国生产场景的铝材排放因子，说明单位、来源和系统边界。”
- “比较这两个电力因子的地区、适用年份和边界，判断能否用于同一核算场景。”
- “查看这个因子的详情，并给出 Carbon Agent 链接。”

比较与选择由 AI 助手基于查询结果完成，不是独立的比较接口。是否有匹配结果取决于数据覆盖与访问权限；工具不执行建模写入，也不替代完整核算或合规审核。

## 工具与结果

| 工具 | 用途 |
| --- | --- |
| `search_emission_factors` | 按关键词及筛选条件搜索候选因子 |
| `get_emission_factor_detail` | 使用搜索返回的因子 ID 查询详情 |

以下为 MCP `tools/call` 的 params 示例，不是 HTTP REST 请求正文：

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
  "arguments": { "factorId": "<搜索返回的factorId>", "language": "zh" }
}
```

`factorId` 必须使用搜索响应中的真实字符串 ID，不能原样执行占位符，也不要转为数字。原始数值、单位、来源及 `******` 等受限值保留在文本 JSON 和 `structuredContent` 中；缺失或受限值不是 0。

MCP 会引导 AI 助手保留因子的可点击详情链接，并根据接口返回的安全地址附加链接文本。链接缺失时不编造地址，不承诺登录或付费后一定解锁。最终展示由宿主决定；推荐因子前应核对单位、地区、年份、边界和来源。

## 接入检查与常见问题

- **命令可执行但仍不能查询：** `--version` 仅验证安装，`status --json` 仅检查本地凭证。连接后能列出两个工具代表协议接入成功；实际业务权限需通过用户所需的一次小范围查询确认。空结果或受限数值不等于连接失败，不为验收批量消耗配额。远程用户直接通过宿主检查工具列表与业务响应。
- **宿主找不到命令：** 使用可执行入口的绝对路径，或修正宿主 PATH；不要因此重复登录。Windows 宿主不能执行 npm `.cmd` 时，可使用 `command: "node"`，把已安装包的 `dist/main.mjs` 绝对路径和 `stdio` 作为 args。
- **认证或权限错误：** 401 检查登录或 Key；403 检查权限；429 按返回提示停止请求。不要切换旧接口绕过限制。提供错误码与 requestId 即可，不公开凭证。
- **`invalid_client`：** 请管理员核对目标环境的客户端登记和启用状态；profile 不会自动注册客户端，登录与宿主的配置必须一致。
- **凭证保存提示：** 新身份在系统凭证服务不可用时可自动使用本地加密文件后备；主密钥也在本机，保护弱于系统钥匙串。提示本身不代表登录失败。默认目录为 `~/.config/carbonstop/ccdb/`（支持系统配置根目录覆盖）；已有凭证兼容规则见 [配置说明](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/CONFIGURATION.md)，不要删除凭证或主密钥强制重置。

## 更多文档

- [环境与认证配置](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/CONFIGURATION.md)
- [旧版本迁移](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/MIGRATION.md)
- [因子选择与数据限制](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/FACTOR_GUIDANCE.md)
- 管理员：[远程部署](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/REMOTE_MCP.md) · [Gateway 架构](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/GATEWAY_BACKED_MCP.md)
- 维护者：[开发指南](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/DEVELOPMENT.md) · [发布流程](https://github.com/carbonstop/ccdb-mcp/blob/main/docs/DISTRIBUTION.md)
