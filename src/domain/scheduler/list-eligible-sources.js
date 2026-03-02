'use strict';

/**
 * Domain use-case for loading source IDs that can run in the current tick.
 * Infrastructure details are hidden behind the repository contract.
 */
async function listEligibleSources({ sourceRepository, now }) {
  return sourceRepository.listEligibleSourceIds({ now });
}

module.exports = {
  listEligibleSources
};
