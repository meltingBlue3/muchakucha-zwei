import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const generatedPath = 'packages/api-client';

function run(command, arguments_, options = {}) {
  const executable = process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;
  const result = spawnSync(executable, arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === 'pnpm',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

const generation = run('pnpm', ['--filter', 'api', 'openapi:generate']);
if (generation.status !== 0) {
  throw new Error(`OpenAPI generation failed with exit code ${generation.status}.`);
}

const diff = run('git', ['diff', '--exit-code', 'HEAD', '--', generatedPath]);
if (diff.status !== 0) {
  throw new Error(`OpenAPI drift detected under '${generatedPath}'. Regenerate and commit the client.`);
}

const untracked = run('git', ['ls-files', '--others', '--exclude-standard', '--', generatedPath], { capture: true });
if (untracked.status !== 0) {
  throw new Error(`Unable to inspect untracked OpenAPI output under '${generatedPath}'.`);
}
if (untracked.stdout.trim() !== '') {
  throw new Error(`OpenAPI generation produced untracked files under '${generatedPath}':\n${untracked.stdout.trim()}`);
}

process.stdout.write(`PASS: generated OpenAPI client matches the committed '${generatedPath}' tree.\n`);
