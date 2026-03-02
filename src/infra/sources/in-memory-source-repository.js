'use strict';

function createInMemorySourceRepository(seed = []) {
  return {
    async listEligibleSourceIds() {
      return seed.map((source) => source.sourceId);
    }
  };
}

module.exports = {
  createInMemorySourceRepository
};
