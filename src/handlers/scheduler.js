'use strict';

const { listEligibleSources } = require('../domain/scheduler/list-eligible-sources');
const {
  createInMemorySourceRepository
} = require('../infra/sources/in-memory-source-repository');
const { nowIso } = require('../shared/time/now-iso');

module.exports.handler = async (event = {}) => {
  const sourceRepository = createInMemorySourceRepository();
  const sourceIds = await listEligibleSources({
    sourceRepository,
    now: event.now
  });

  return {
    sourceIds,
    generatedAt: nowIso()
  };
};
