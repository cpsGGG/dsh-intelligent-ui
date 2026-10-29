import { build } from 'esbuild';
import { mkdir, copyFile, cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)), out = join(root, 'assets/readme');
await mkdir(out, { recursive: true });
await build({
  entryPoints: [join(root, 'docs/demo.jsx')], outfile: join(out, 'demo.mjs'),
  bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  loader: { '.css': 'text' },
  alias: { '@deepseek-ai/dsh-client-ui-primitives': join(root, 'docs/demo-markdown.jsx') },
});
await copyFile(join(root, 'node_modules/katex/dist/katex.min.css'), join(out, 'katex.css'));
await cp(join(root, 'node_modules/katex/dist/fonts'), join(out, 'fonts'), { recursive: true });
await writeFile(join(out, 'demo.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IUI component preview</title><link rel="stylesheet" href="/assets/readme/katex.css"></head><body><div id="root"></div><script type="module" src="/assets/readme/demo.mjs"></script></body></html>');
console.log('Built component demo. Run npm start, then open /assets/readme/demo.html.');
