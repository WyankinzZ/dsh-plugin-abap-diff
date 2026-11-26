import esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const libDir = path.join(root, 'lib');

await fs.mkdir(libDir, { recursive: true });

// 1. Build Host plugin (ESM for Node / Cordis)
await esbuild.build({
  entryPoints: [path.join(root, 'src/host/index.ts')],
  outfile: path.join(libDir, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: [
    '@deepseek-ai/*',
    'node:*',
  ],
  banner: {
    js: '// dsh-plugin-abap-diff host bundle',
  },
});

// 2. Build Client plugin (wrapped for DSH window.__ModuleLoader__.load)
const clientResult = await esbuild.build({
  entryPoints: [path.join(root, 'src/client/index.tsx')],
  write: false,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  jsxImportSource: 'react',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/*',
  ],
});

const clientCode = clientResult.outputFiles[0].text;
const wrappedClient = [
  '// dsh-plugin-abap-diff client bundle',
  'window.__ModuleLoader__.load({',
  '  id: "dsh-plugin-abap-diff",',
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  clientCode,
  '    return module.exports;',
  '  }',
  '});',
  '',
].join('\n');

await fs.writeFile(path.join(libDir, 'client.js'), wrappedClient, 'utf8');
console.log('[build] Built lib/index.js and lib/client.js');
