import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const run = promisify(execFile);

// Playwright loads this file as CommonJS, so `import.meta.url` is unavailable.
// Its working directory is the one holding playwright.config.ts (frontend/).
const backendDir = resolve(process.cwd(), '../backend');

/**
 * Reseeds the database before the E2E run.
 *
 * These tests place real bids and let an admin close a real lot, so they mutate
 * shared state. Reseeding first makes the suite repeatable instead of passing
 * once and then failing on prices left behind by the previous run.
 *
 * Spawned as a child process rather than imported: the seed script lives in the
 * backend package and resolves `pg`/`bcryptjs` from that package's own
 * node_modules.
 */
export default async function globalSetup() {
  process.stdout.write('[e2e] reseeding database…\n');
  try {
    const { stdout } = await run('npm', ['run', 'seed'], {
      cwd: backendDir,
      shell: process.platform === 'win32',
      timeout: 120_000,
    });
    const summary = stdout
      .split('\n')
      .filter((l) => l.includes('[seed]'))
      .join('\n');
    process.stdout.write(`${summary}\n[e2e] ready\n`);
  } catch (err) {
    process.stderr.write(
      '[e2e] seeding failed — is DATABASE_URL set in backend/.env?\n' +
        `${(err as Error).message}\n`
    );
    throw err;
  }
}
