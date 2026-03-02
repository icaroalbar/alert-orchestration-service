'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../../../src/handlers/scheduler');

test('scheduler handler returns expected payload', async () => {
  const result = await handler();

  assert.deepEqual(result.sourceIds, []);
  assert.equal(typeof result.generatedAt, 'string');
  assert.equal(Number.isNaN(Date.parse(result.generatedAt)), false);
});
