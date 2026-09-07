# 开发指南

在仓库根目录运行：

```sh
npm ci
npm run verify
npm install -g ./dist/releases/ccdb-mcp-server-2.0.0.tgz
```

最后一行安装刚构建的本地开发包，不是 npm registry 安装。构建不会自动发布 npm。

## 本地调试

设置 `CCDB_PROFILE=local` 时，默认网关端口为 8880、Agent 为 3100。OAuth 客户端默认 `ccdb-connect-local`，需在对应环境登记。

```sh
ccdb-mcp login --profile local
ccdb-mcp status --profile local --json
```

宿主配置使用相同的环境和客户端 ID。调试源码构建时可将宿主入口指向仓库中的 `packages/ccdb-mcp/dist/main.mjs`，参数为 `stdio`。
