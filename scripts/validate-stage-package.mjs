import { execSync } from 'node:child_process';

const DEFAULT_STAGE_PACKAGE_COMMAND = 'npm run sls:package:all';
const DEFAULT_STAGE_PACKAGE_FALLBACK_COMMAND = 'npm run build';

const run = (command) =>
  execSync(command, {
    encoding: 'utf8',
    env: process.env,
    stdio: 'pipe',
  });

const printCapturedOutput = (error) => {
  const stdout = error?.stdout ? String(error.stdout) : '';
  const stderr = error?.stderr ? String(error.stderr) : '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return `${stdout}\n${stderr}`;
};

const emitUnclassifiedFailure = ({ stage, command }) => {
  console.error(`UNCLASSIFIED_STAGE_VALIDATION_ERROR stage=${stage} command="${command}"`);
  console.error(
    'Próxima ação: habilite modo verbose (DEBUG=* ou SLS_DEBUG=*) e revise os logs do comando subjacente.',
  );
};

const stagePackageCommand =
  process.env.VALIDATE_STAGE_PACKAGE_COMMAND ?? DEFAULT_STAGE_PACKAGE_COMMAND;
const stagePackageFallbackCommand =
  process.env.VALIDATE_STAGE_PACKAGE_FALLBACK_COMMAND ?? DEFAULT_STAGE_PACKAGE_FALLBACK_COMMAND;

try {
  const output = run(stagePackageCommand);
  if (output) process.stdout.write(output);
  process.exit(0);
} catch (error) {
  const output = printCapturedOutput(error);
  const credentialsIssue =
    output.includes('AWS credentials missing or invalid') ||
    output.includes('Could not load credentials from any providers');
  const networkIssue =
    output.includes('Unable to reach the Serverless API') ||
    output.includes('core.serverless.com');
  const authIssue =
    output.includes('You must sign in or use a license key with Serverless Framework V.4') ||
    output.includes('Please use "serverless login".');
  const canFallback = credentialsIssue || networkIssue || authIssue;

  if (!canFallback) {
    emitUnclassifiedFailure({
      stage: 'stage-package',
      command: stagePackageCommand,
    });
    process.exit(1);
  }

  const fallbackReason = authIssue
    ? 'autenticação/licença do Serverless v4'
    : credentialsIssue
      ? 'credenciais AWS'
      : 'rede';
  console.warn(
    `\nAviso: empacotamento multi-stage indisponível no ambiente atual (${fallbackReason}). Executando fallback com build local.`,
  );
  execSync(stagePackageFallbackCommand, { stdio: 'inherit', env: process.env });
}
