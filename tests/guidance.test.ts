import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanOutput } from '../packages/ccdb-mcp/src/output.js';
import { toolResult } from '../packages/ccdb-mcp/src/server.js';
import {
  searchResponseSchema,
  detailResponseSchema,
} from '../packages/ccdb-client/src/contracts.js';
import { searchResult, detailResult } from './helpers.js';

const guidance = {
  code: 'ECOINVENT_VALUE_RESTRICTED' as const,
  message: 'ecoinvent 因子当前不提供明文，请前往 Carbon Agent 查看来源与适用范围。',
  actionLabel: '前往 Carbon Agent 查看因子详情',
  actionUrl: 'http://127.0.0.1:3100/factors/123',
};

test('mixed candidates preserve values and links with one batch guidance in MCP and CLI', async () => {
  const original = searchResult('http://127.0.0.1:3100');
  const value = searchResponseSchema.parse({
    ...original,
    guidance,
    items: [
      original.items[0],
      {
        ...original.items[0],
        factorId: '123',
        sourceName: 'Ecoinvent',
        value: '******',
        detailUrl: guidance.actionUrl,
      },
      {
        ...original.items[0],
        factorId: '456',
        sourceName: 'Ecoinvent',
        value: '******',
        detailUrl: 'http://127.0.0.1:3100/factors/456',
      },
    ],
  });
  const result = await toolResult(async () => value);
  assert.deepEqual(result.structuredContent, value);
  assert.deepEqual(JSON.parse((result.content as any)[0].text), value);
  assert.equal(result.isError, undefined);
  const output = humanOutput(value);
  assert.equal(output.split(guidance.message).length - 1, 1);
  assert.ok(output.includes(guidance.actionUrl));
  assert.ok(output.includes('/factors/456'));
  assert.equal(value.items.length, 3); // No extra recommendations.
  assert.equal(value.items[1].value, '******');
  assert.deepEqual(value.items[0], original.items[0]);
});

test('detail guidance survives the original CCDB envelope and CLI rendering', async () => {
  const original = detailResult('http://127.0.0.1:3100');
  const value = detailResponseSchema.parse({ ...original, data: { ...original.data, guidance } });
  assert.deepEqual((await toolResult(async () => value)).structuredContent, value);
  const output = humanOutput(value);
  assert.equal(output.split(guidance.message).length - 1, 1);
  assert.ok(output.includes(guidance.actionUrl));
});

test('ordinary and older responses without guidance remain compatible', () => {
  const value = searchResponseSchema.parse(searchResult('http://127.0.0.1:3100'));
  assert.equal(value.guidance, undefined);
  assert.ok(!humanOutput(value).includes(guidance.message));
  assert.ok(!humanOutput(detailResult('http://127.0.0.1:3100')).includes(guidance.message));
});
