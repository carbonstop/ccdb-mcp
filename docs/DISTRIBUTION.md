# MCP 2.0 distribution

Starting with `2.0.4`, the npm package is `ccdb-mcp`; the executable remains `ccdb-mcp`. This rename does not change authentication, credential storage, tools or transport behavior from `ccdb-mcp-server@2.0.3`. No native executable is needed for this distribution: Node.js 22+ is required locally; remote MCP consumers need no local npm installation.

The earlier migration draft's scoped package `@carbonstop/ccdb-mcp` and `ccdb-connect-mcp` command are superseded; they were not published by this migration. OAuth registration and credential-store identifiers remain unchanged.

Install `npm install -g ccdb-mcp@latest`, explicitly run `ccdb-mcp login` for first-time setup, and configure the host command `ccdb-mcp` with `args: ["stdio"]`. Existing users should uninstall the old global package first to avoid a command-name conflict; no logout or credential deletion is needed. Tools/authentication and `serve` are not drop-in compatible with legacy 1.x; see [MIGRATION.md](MIGRATION.md).

Release only after company/license approval, backend acceptance and package review:

```sh
npm ci
npm run verify
npm login --registry=https://registry.npmjs.org/
npm publish ./dist/releases/ccdb-mcp-2.0.4.tgz --access public --registry=https://registry.npmjs.org/
```

The npm account must be allowed to publish the new package name. Never publish the private development root. The `ccdb-client` npm dependency is bundled during build and released separately from its own repository. This does not deploy the remote gateway/backend. Package publication is not performed by build/test/CI.

After the new package is published, verify installation from the public registry in an isolated directory, including `ccdb-mcp --version` and stdio initialization. Only then deprecate the old package with a message directing users to `ccdb-mcp`; do not unpublish old versions. Update deployment and host configurations that use the old npm package name. Publish the version tag and GitHub Release from the verified source commit so the artifact can be traced to source.
