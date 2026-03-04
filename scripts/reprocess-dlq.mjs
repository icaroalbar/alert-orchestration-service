import path from 'node:path';
import { pathToFileURL } from 'node:url';

import core from './reprocess-dlq-core.cjs';

export const {
  INTEGRATIONS,
  parseArgs,
  parseIsoToMs,
  resolveIntegrations,
  resolveQueueUrls,
  isWithinWindow,
  buildAuditFilePath,
  createDlqReprocessor,
  runCli,
} = core;

const isMainModule = () => {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    return false;
  }

  return import.meta.url === pathToFileURL(path.resolve(scriptPath)).href;
};

if (isMainModule()) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
