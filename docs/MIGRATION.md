# OAuth MCP migration

Source snapshot: `carbonstop/ccdb-integrations` commit `b69f46b5b6f44c70067032a01edaafd13aa790d4`.
This PR replaces the legacy implementation without rewriting history or removing existing published releases.

## Breaking changes

| Legacy                                       | New                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| npm `ccdb-mcp-server`, executable `ccdb-mcp` | npm `ccdb-mcp-server`, executable `ccdb-mcp` (not published by this PR)                     |
| `--stdio`                                    | `stdio` (also the default)                                                                  |
| `--http --port`                              | Internal `serve` adapter behind the authenticated gateway; not a drop-in public HTTP server |
| `search_factors`, `search_factors_json`      | `search_emission_factors`                                                                   |
| `compare_factors`, old prompts               | No direct replacement; Agent compares search/detail results using Skill instructions        |
| Old search response                          | Original CCDB JSON plus structuredContent; detail tool `get_emission_factor_detail`         |

Node.js 22+ and backend OAuth/API Key permission are required. Update host configurations and tool names together. Do not expose `serve` publicly: see [REMOTE_MCP.md](REMOTE_MCP.md) for gateway authentication, resource/audience and signed execution context requirements. The migration does not deploy the backend or implement front-end authorization pages.

## Independent maintenance

This repo builds and packs without CLI, integrations or client checkouts. Shared authentication, HTTP, contracts and credential storage are maintained in `carbonstop/ccdb-client` and consumed from the public npm package [`ccdb-client`](https://www.npmjs.com/package/ccdb-client). The root build dependency is pinned to `0.1.0`; private GitHub source access is not required. There is no vendored client workspace to synchronize. The login runner/output helpers remain in `packages/ccdb-mcp/src`; they are not an external CLI dependency.

Fix shared logic in the client repository and publish a client version first. Update the dependency and lockfile in MCP and CLI through linked upgrade PRs, then run both complete verification suites. Keep consumer authentication, callback, contract and error-redaction tests against the published package. Runner/output changes affecting login or JSON behavior must still be compared because those helpers remain consumer-owned.

The build bundles the pinned client and includes its MIT license in third-party notices. End users do not install the client separately. MCP and CLI releases remain independent; publishing client alone does not update already installed consumers. Client extraction does not change the HTTP deployment or OAuth architecture.

Run `npm ci` and `npm run verify`. CI tests mock services, real SDK stdio exchange, signed internal HTTP context, and isolated offline tarball installation. This does not substitute for real-host, production OAuth, keychain, revocation or two-user quota/audit acceptance.

Publish only the built `packages/ccdb-mcp` package after confirming npm scope permission and company/license approval. Source integrations has no LICENSE; the old README's MIT statement is not a license review of this new code. Existing public visibility is unchanged. No npm release, secrets or deployment are included in this PR.
