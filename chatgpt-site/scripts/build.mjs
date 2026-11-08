// Builds dist/server/index.js (Worker with the frontend embedded) and dist/.openai/hosting.json.
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { build as buildClient } from 'vite';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const clientDir = join(root, '.build/client');
const distDir = join(root, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const TEXT = new Set(['.html', '.js', '.css', '.svg', '.json', '.txt']);

async function collectAssets(dir) {
  const assets = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    const extension = extname(entry.name);
    const type = TYPES[extension];
    if (!type) throw new Error(`No content type for ${file}`);
    const bytes = await readFile(file);
    const key = `/${relative(dir, file).split(sep).join('/')}`;
    assets[key] = TEXT.has(extension)
      ? { type, encoding: 'utf8', body: bytes.toString('utf8') }
      : { type, encoding: 'base64', body: bytes.toString('base64') };
  }
  return assets;
}

process.chdir(root);
await buildClient({ root, logLevel: 'warn' });
const assets = await collectAssets(clientDir);
if (!assets['/index.html']) throw new Error('Frontend build produced no index.html');

await rm(distDir, { recursive: true, force: true });
await mkdir(join(distDir, '.openai'), { recursive: true });

const embedAssets = {
  name: 'embed-assets',
  setup(build) {
    build.onResolve({ filter: /^virtual:assets$/ }, (args) => ({ path: args.path, namespace: 'assets' }));
    build.onLoad({ filter: /.*/, namespace: 'assets' }, () => ({
      contents: `export const ASSETS = ${JSON.stringify(assets)};`,
      loader: 'js',
    }));
  },
};

const { metafile } = await bundle({
  entryPoints: [join(root, 'worker/index.ts')],
  outfile: join(distDir, 'server/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  conditions: ['worker', 'browser'],
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  metafile: true,
  plugins: [embedAssets],
  logLevel: 'warning',
});
await cp(join(root, '.openai/hosting.json'), join(distDir, '.openai/hosting.json'));

const bytes = Object.values(metafile.outputs).reduce((sum, output) => sum + output.bytes, 0);
console.log(`Built dist/server/index.js (${(bytes / 1024).toFixed(0)} KiB, ${Object.keys(assets).length} embedded assets)`);
