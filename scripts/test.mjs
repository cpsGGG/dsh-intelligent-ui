import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const dependencies = ['react', 'react-dom/client', 'esbuild', 'jsdom', 'katex', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots'];
for (const name of dependencies) {
  try { require.resolve(process.env.DSH_BUILD_DEPS ? join(process.env.DSH_BUILD_DEPS, name) : name); }
  catch { throw new Error(`Missing test dependency ${name}. Run npm ci before npm test.`); }
}
const files = (await readdir(join(root, 'tests'))).filter(name => name.endsWith('.test.mjs')).sort().map(name => join(root, 'tests', name));
const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, stdio: ['inherit', 'pipe', 'inherit'] });
let output = '';
child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  const skipped = /^# skipped (\d+)\s*$/m.exec(output);
  if (!skipped || Number(skipped[1]) !== 0) {
    console.error('A complete test run with zero skipped tests is required. Install all development dependencies with npm ci.');
    process.exitCode = 1;
  } else process.exitCode = code ?? 1;
});
