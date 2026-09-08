import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchSchema, detailInputSchema } from 'ccdb-client/contracts';

test('remote docs consistently select gateway-first with gateway execution', async () => {
  for (const file of [
    'README.md',
    'packages/ccdb-mcp/README.md',
    'docs/GATEWAY_BACKED_MCP.md',
    'docs/REMOTE_MCP.md',
  ]) {
    const doc = await readFile(file, 'utf8');
    assert.match(doc, /Gateway-first/, file);
    assert.match(doc, /Gateway \/mcp\/ccdb/, file);
    assert.match(doc, /Gateway \/internal\/ccdb\/mcp\/execute/, file);
    assert.doesNotMatch(doc, /唯一目标架构采用|新部署请等待目标模式|仅保留用于已有部署/, file);
  }
  const env = await readFile('deploy/.env.example', 'utf8');
  assert.match(
    env,
    /CCDB_MCP_EXECUTION_URL=https:\/\/gateway-base-test.carbonstop.com\/internal\/ccdb\/mcp\/execute/,
  );
  assert.doesNotMatch(env, /^CCDB_MCP_CONTEXT_KEYS=/m);
});

test('user-facing READMEs install the published MCP package first', async () => {
  const pkg = JSON.parse(await readFile('packages/ccdb-mcp/package.json', 'utf8'));
  for (const file of ['README.md', 'packages/ccdb-mcp/README.md']) {
    const doc = await readFile(file, 'utf8');
    const installTarget = /npm install -g (\S+)/.exec(doc)?.[1];
    assert.ok([pkg.name, `${pkg.name}@latest`].includes(installTarget || ''), file);
    assert.ok(doc.includes(`${Object.keys(pkg.bin)[0]} --version`), file);
  }
});

test('handoff JSON examples match installed tool contracts and stdio startup options', async () => {
  let examples = 0;
  for (const file of ['README.md', 'docs/REMOTE_MCP.md']) {
    const markdown = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    for (const match of markdown.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) {
      const value = JSON.parse(match[1]);
      const tool = value.name || value.tool;
      if (tool === 'search_emission_factors') {
        searchSchema.parse(value.arguments);
        examples++;
      }
      if (tool === 'get_emission_factor_detail') {
        detailInputSchema.parse(value.arguments);
        examples++;
      }
      if (value.mcpServers) {
        const server = value.mcpServers['ccdb-mcp'];
        assert.deepEqual(server.args, ['stdio']);
        assert.ok(['local', 'production'].includes(server.env.CCDB_PROFILE));
        assert.equal(server.command, 'ccdb-mcp');
      }
    }
  }
  assert.equal(examples, 4);
});
