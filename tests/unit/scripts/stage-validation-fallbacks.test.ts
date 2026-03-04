import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const STAGE_RENDER_SCRIPT = path.resolve(REPO_ROOT, 'scripts/validate-stage-render.mjs');
const STAGE_PACKAGE_SCRIPT = path.resolve(REPO_ROOT, 'scripts/validate-stage-package.mjs');

type ScriptResult = {
  status: number | null;
  output: string;
};

const runScript = (scriptPath: string, env: Record<string, string>): ScriptResult => {
  const result = spawnSync('node', [scriptPath], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  });

  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
};

describe('stage validation scripts - fallback diagnostics', () => {
  it('emits UNCLASSIFIED_STAGE_VALIDATION_ERROR for unmapped render failures', () => {
    const result = runScript(STAGE_RENDER_SCRIPT, {
      VALIDATE_STAGE_RENDER_COMMAND:
        'node -e "process.stderr.write(\'unexpected render failure\\\\n\'); process.exit(1)"',
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('UNCLASSIFIED_STAGE_VALIDATION_ERROR');
    expect(result.output).toContain('stage=stage-render');
    expect(result.output).toContain('command="node -e');
    expect(result.output).toContain('Próxima ação: habilite modo verbose');
  });

  it('preserves mapped render fallback behavior for network errors', () => {
    const result = runScript(STAGE_RENDER_SCRIPT, {
      VALIDATE_STAGE_RENDER_COMMAND:
        'node -e "process.stderr.write(\'Unable to reach the Serverless API\\\\n\'); process.exit(1)"',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      'renderização multi-stage indisponível no ambiente atual (rede)',
    );
    expect(result.output).toContain('Fallback estático no serverless.yml concluído');
    expect(result.output).not.toContain('Falha no fallback estático');
    expect(result.output).not.toContain('UNCLASSIFIED_STAGE_VALIDATION_ERROR');
  });

  it('preserves mapped render fallback behavior for Serverless v4 authentication errors', () => {
    const result = runScript(STAGE_RENDER_SCRIPT, {
      VALIDATE_STAGE_RENDER_COMMAND:
        'node -e "process.stderr.write(\'You must sign in or use a license key with Serverless Framework V.4 and later versions.\\\\n\'); process.exit(1)"',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      'renderização multi-stage indisponível no ambiente atual (autenticação/licença do Serverless v4)',
    );
    expect(result.output).toContain('Fallback estático no serverless.yml concluído');
    expect(result.output).not.toContain('UNCLASSIFIED_STAGE_VALIDATION_ERROR');
  });

  it('emits UNCLASSIFIED_STAGE_VALIDATION_ERROR for unmapped package failures', () => {
    const result = runScript(STAGE_PACKAGE_SCRIPT, {
      VALIDATE_STAGE_PACKAGE_COMMAND:
        'node -e "process.stderr.write(\'unexpected package failure\\\\n\'); process.exit(1)"',
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('UNCLASSIFIED_STAGE_VALIDATION_ERROR');
    expect(result.output).toContain('stage=stage-package');
    expect(result.output).toContain('command="node -e');
    expect(result.output).toContain('Próxima ação: habilite modo verbose');
  });

  it('preserves mapped package fallback behavior for credentials/network errors', () => {
    const result = runScript(STAGE_PACKAGE_SCRIPT, {
      VALIDATE_STAGE_PACKAGE_COMMAND:
        'node -e "process.stderr.write(\'Could not load credentials from any providers\\\\n\'); process.exit(1)"',
      VALIDATE_STAGE_PACKAGE_FALLBACK_COMMAND:
        'node -e "process.stdout.write(\'fallback-build-ok\\\\n\')"',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('empacotamento multi-stage indisponível no ambiente atual');
    expect(result.output).toContain('fallback-build-ok');
    expect(result.output).not.toContain('UNCLASSIFIED_STAGE_VALIDATION_ERROR');
  });

  it('preserves mapped package fallback behavior for Serverless v4 authentication errors', () => {
    const result = runScript(STAGE_PACKAGE_SCRIPT, {
      VALIDATE_STAGE_PACKAGE_COMMAND:
        'node -e "process.stderr.write(\'Please use \\\\\\"serverless login\\\\\\".\\\\n\'); process.exit(1)"',
      VALIDATE_STAGE_PACKAGE_FALLBACK_COMMAND:
        'node -e "process.stdout.write(\'fallback-build-auth-ok\\\\n\')"',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      'empacotamento multi-stage indisponível no ambiente atual (autenticação/licença do Serverless v4)',
    );
    expect(result.output).toContain('fallback-build-auth-ok');
    expect(result.output).not.toContain('UNCLASSIFIED_STAGE_VALIDATION_ERROR');
  });
});
