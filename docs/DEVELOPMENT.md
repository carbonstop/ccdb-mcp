# 开发指南

## PKCE 授权结果页

已同步 ccdb-integrations 提交 `2fb30a5`：本地 PKCE 回调在完成授权码换取和凭证保存后，返回 Carbon Agent 授权页面，并通过 URL fragment 携带 success、error 或 cancelled 结果。返回地址取自已校验的授权页，不接受回调参数指定跳转目标，不携带 code、Token 或 verifier。Agent 前端需要配套支持结果展示并停止再次自动跳转；默认 device 登录和 API Key 不变。

对应回归测试位于 `tests/callback.test.ts`。此修复仅涉及本地登录，不代表远程 MCP 架构已实现或完成联调。

在仓库根目录运行：

```sh
npm ci
npm run verify
npm install -g ./dist/releases/ccdb-mcp-server-2.0.1.tgz
```

最后一行安装刚构建的本地开发包，不是 npm registry 安装。构建不会自动发布 npm。

## 本地调试

设置 `CCDB_PROFILE=local` 时，默认网关端口为 8880、Agent 为 3100。OAuth 客户端默认 `ccdb-connect-local`，需在对应环境登记。

```sh
ccdb-mcp login --profile local
ccdb-mcp status --profile local --json
```

宿主配置使用相同的环境和客户端 ID。调试源码构建时可将宿主入口指向仓库中的 `packages/ccdb-mcp/dist/main.mjs`，参数为 `stdio`。
