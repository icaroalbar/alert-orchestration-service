import { execSync } from 'node:child_process';

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

try {
  const output = run('npm run sls:package:all');
  if (output) process.stdout.write(output);
  process.exit(0);
} catch (error) {
  const output = printCapturedOutput(error);
  const canFallback =
    output.includes('AWS credentials missing or invalid') ||
    output.includes('Could not load credentials from any providers') ||
    output.includes('Unable to reach the Serverless API') ||
    output.includes('core.serverless.com');

  if (!canFallback) {
    process.exit(1);
  }

  console.warn(
    '\nAviso: empacotamento multi-stage indisponível no ambiente atual (credenciais/rede). Executando fallback com build local.'
  );
  execSync('npm run build', { stdio: 'inherit', env: process.env });
}
