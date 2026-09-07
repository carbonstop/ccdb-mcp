import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchSchema, detailInputSchema } from '../packages/ccdb-client/src/contracts.js';

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
        const server = value.mcpServers['ccdb-connect'];
        assert.deepEqual(server.args, ['stdio']);
        assert.equal(server.env.CCDB_PROFILE, 'local');
      }
    }
  }
  assert.equal(examples, 4);
});
