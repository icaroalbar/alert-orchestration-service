'use strict';

module.exports.handler = async () => {
  return {
    sourceIds: [],
    generatedAt: new Date().toISOString()
  };
};
