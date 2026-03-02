import assert from 'node:assert/strict';
import test from 'node:test';

import { handler } from '../../../src/handlers/scheduler';

void test('scheduler handler returns expected payload', async () => {
  const result = await handler();

  assert.deepEqual(result.sourceIds, []);
  assert.equal(typeof result.generatedAt, 'string');
  assert.equal(Number.isNaN(Date.parse(result.generatedAt)), false);
});
