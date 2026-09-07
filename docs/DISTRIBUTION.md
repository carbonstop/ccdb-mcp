# MCP 2.0 distribution

Package name remains `ccdb-mcp-server`; executable remains `ccdb-mcp`. Version `2.0.0` signals breaking tool/authentication changes from published `1.1.0`. No native executable is needed for this distribution: Node.js 22+ is required locally; remote MCP consumers need no local npm installation.

The earlier migration draft's scoped package `@carbonstop/ccdb-mcp` and `ccdb-connect-mcp` command are superseded; they were not published by this migration. OAuth registration and credential-store identifiers remain unchanged.

After release, install `npm install -g ccdb-mcp-server@2.0.0`, explicitly run `ccdb-mcp login`, and configure the host command `ccdb-mcp` with `args: ["stdio"]`. Tools/authentication and `serve` are not drop-in compatible with the legacy package; see [MIGRATION.md](MIGRATION.md).

Release only after company/license approval, backend acceptance and package review:

```sh
npm ci
npm run verify
npm login --registry=https://registry.npmjs.org/
npm publish ./dist/releases/ccdb-mcp-server-2.0.0.tgz --access public --registry=https://registry.npmjs.org/
```

The npm account must own this package (the current registry maintainer is `carbonstop-official`) or have publishing permission. Never publish the private repository root or `ccdb-client` workspace. This does not deploy the remote gateway/backend. Package publication is not performed by build/test/CI.
