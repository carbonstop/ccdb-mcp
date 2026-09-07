# OAuth MCP migration

Source snapshot: `carbonstop/ccdb-integrations` commit `b69f46b5b6f44c70067032a01edaafd13aa790d4`.
This PR replaces the legacy implementation without rewriting history or removing existing published releases.

## Breaking changes

| Legacy                                       | New                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| npm `ccdb-mcp-server`, executable `ccdb-mcp` | npm `@carbonstop/ccdb-mcp`, executable `ccdb-connect-mcp` (not published by this PR)        |
| `--stdio`                                    | `stdio` (also the default)                                                                  |
| `--http --port`                              | Internal `serve` adapter behind the authenticated gateway; not a drop-in public HTTP server |
| `search_factors`, `search_factors_json`      | `search_emission_factors`                                                                   |
| `compare_factors`, old prompts               | No direct replacement; Agent compares search/detail results using Skill instructions        |
| Old search response                          | Original CCDB JSON plus structuredContent; detail tool `get_emission_factor_detail`         |

Node.js 22+ and backend OAuth/API Key permission are required. Update host configurations and tool names together. Do not expose `serve` publicly: see [REMOTE_MCP.md](REMOTE_MCP.md) for gateway authentication, resource/audience and signed execution context requirements. The migration does not deploy the backend or implement front-end authorization pages.

## Independent maintenance

This repo builds and packs without CLI or integrations checkouts. `packages/ccdb-client` is private vendored source bundled into the published artifact. The login runner/output helpers now live in `packages/ccdb-mcp/src`; they are not an external CLI dependency.
Authentication, HTTP, contract and credential-store fixes must be ported to `carbonstop/ccdb-cli` with linked PRs and full verification on both repositories. Runner/output changes affecting login or JSON behavior must also be compared. Keeping two copies is an explicit maintenance tradeoff, not automatic synchronization.

Run `npm ci` and `npm run verify`. CI tests mock services, real SDK stdio exchange, signed internal HTTP context, and isolated offline tarball installation. This does not substitute for real-host, production OAuth, keychain, revocation or two-user quota/audit acceptance.

Publish only the built `packages/ccdb-mcp` package after confirming npm scope permission and company/license approval. Source integrations has no LICENSE; the old README's MIT statement is not a license review of this new code. Existing public visibility is unchanged. No npm release, secrets or deployment are included in this PR.
