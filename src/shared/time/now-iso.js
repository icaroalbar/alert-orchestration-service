'use strict';

function nowIso(clock = () => new Date()) {
  return clock().toISOString();
}

module.exports = {
  nowIso
};
