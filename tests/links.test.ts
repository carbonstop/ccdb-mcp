import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolResult } from '../packages/ccdb-mcp/src/server.js';
import { factorLinks } from '../packages/ccdb-mcp/src/links.js';

test('supplemental links preserve JSON and structured data for search and detail', async () => {
  for (const value of [
    {
      items: [
        { name: '电力', detailUrl: 'https://example.com/factor/1' },
        { name: '热力', detailUrl: 'https://example.com/factor/2' },
      ],
    },
    { data: { name: { zh: '电力' }, detailUrl: 'https://example.com/factor/1', cValue: '******' } },
  ]) {
    const before = JSON.stringify(value);
    const result = await toolResult(async () => value);
    assert.deepEqual(result.structuredContent, value);
    assert.equal((result.content[0] as any).text, before);
    assert.equal(JSON.stringify(value), before);
    assert.match(
      (result.content[1] as any).text,
      /\[电力 — 在 Carbon Agent 查看该因子\]\(<https:\/\/example.com\/factor\/1>\)/,
    );
  }
});

test('missing or unsafe links are not fabricated; labels cannot inject Markdown links', () => {
  for (const detailUrl of [
    undefined,
    'javascript:alert(1)',
    'https://user:pass@example.com',
    'https://example.com/?token=secret',
    'https://example.com/#token=secret',
    'https://example.com/\nspoof',
  ]) {
    assert.equal(factorLinks({ data: { name: 'test', detailUrl } }), '');
  }
  const text = factorLinks({
    data: { name: '[fake](https://evil.example)', detailUrl: 'https://example.com/1' },
  });
  assert.ok(!text.includes('[fake]('));
  assert.ok(text.includes('(<https://example.com/1>)'));
  assert.equal(factorLinks({ items: [] }), '');
});

test('restricted guidance adds a returned action link without inventing access promises', () => {
  const text = factorLinks({
    guidance: { code: 'ECOINVENT_VALUE_RESTRICTED', actionUrl: 'https://example.com/details' },
  });
  assert.ok(text.includes('(<https://example.com/details>)'));
  assert.match(text, /不承诺/);
});
