import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
// Optional existing build toolchain; normal installs use the pinned devDependency.
const esbuild = process.env.DSH_BUILD_DEPS
  ? require(join(resolve(process.env.DSH_BUILD_DEPS), 'esbuild')) : require('esbuild');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await mkdir(join(root, 'lib'), { recursive: true });
const result = await esbuild.build({
  entryPoints: [join(root, 'plugin/client.jsx')], bundle: true, write: false,
  format: 'cjs', platform: 'browser', target: 'es2020', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
  loader: { '.css': 'text' }, legalComments: 'inline', minify: true,
});
const body = result.outputFiles[0].text;
await writeFile(join(root, 'lib/client.js'), `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{\nvar module={exports:{}};var exports=module.exports;\n${body}\nreturn module.exports;\n}});\n`);
await esbuild.build({
  entryPoints: [join(root, 'plugin/host.mjs')], outfile: join(root, 'lib/index.js'),
  bundle: true, format: 'esm', platform: 'node', target: 'node20',
  nodePaths: process.env.DSH_BUILD_DEPS ? [resolve(process.env.DSH_BUILD_DEPS)] : [],
  loader: { '.md': 'text' }, legalComments: 'inline',
});
await writeFile(join(root, 'lib/ELK-LICENSE.md'), await readFile(join(root, 'node_modules/elkjs/LICENSE.md')));
await writeFile(join(root, 'lib/HTML-TO-IMAGE-LICENSE.txt'), await readFile(join(root, 'node_modules/html-to-image/LICENSE')));
await writeFile(join(root, 'lib/SCHEMASTERY-LICENSE.txt'), await readFile(join(root, 'node_modules/@deepseek-ai/schemastery/LICENSE')));
await writeFile(join(root, 'lib/COSMOKIT-LICENSE.txt'), await readFile(join(root, 'node_modules/@deepseek-ai/cosmokit/LICENSE')));
await writeFile(join(root, 'lib/THIRD-PARTY-NOTICES.txt'), [
  'Original dsh-intelligent-ui code is licensed under MIT (see ../LICENSE).',
  'Bundled third-party code remains under its respective license:',
  '',
  'elkjs 0.11.0 — Eclipse Public License 2.0',
  'Copyright its contributors. Full license: ELK-LICENSE.md',
  'Unmodified source: https://github.com/kieler/elkjs/tree/v0.11.0',
  '',
  'html-to-image 1.11.13 — MIT',
  'Copyright (c) 2017-2025 W.Y. Full license: HTML-TO-IMAGE-LICENSE.txt',
  'Source: https://github.com/bubkoo/html-to-image',
  '',
  '@deepseek-ai/schemastery 3.18.4 — MIT',
  'Full license: SCHEMASTERY-LICENSE.txt',
  'Source: https://github.com/deepseek-ai/deepseek-harness/tree/master/vendor/schemastery',
  '',
  '@deepseek-ai/cosmokit 1.8.6 — MIT',
  'Full license: COSMOKIT-LICENSE.txt',
  'Source: https://github.com/deepseek-ai/deepseek-harness/tree/master/vendor/cosmokit',
  '',
].join('\n'));
console.log(`Built ${pkg.name}@${pkg.version}: client ${Math.round(Buffer.byteLength(body) / 1024)} KB + host tools and prompt.`);
