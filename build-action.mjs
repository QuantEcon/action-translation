/**
 * Bundle the GitHub Action entry point to CJS for the Actions runner.
 *
 * The source is compiled to ESM by tsc (for ink v4 compatibility).
 * esbuild re-bundles it to CJS so the GitHub Actions node20 runner
 * can load it via require().
 *
 * Glossary JSON files are copied as external assets since they're
 * loaded at runtime via fs.readFileSync().
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const outdir = 'dist-action';

await esbuild.build({
  entryPoints: ['dist/index.js'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: path.join(outdir, 'index.js'),
  // Replace import.meta.url with a CJS-compatible equivalent
  define: {
    'import.meta.url': '__importMetaUrl',
  },
  banner: {
    js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;',
  },
  // Source maps for debugging action failures
  sourcemap: true,
});

// Copy glossary files — loaded at runtime via fs.readFileSync()
const glossaryDir = path.join(outdir, 'glossary');
if (!fs.existsSync(glossaryDir)) fs.mkdirSync(glossaryDir, { recursive: true });
for (const file of fs.readdirSync('glossary')) {
  if (file.endsWith('.json')) {
    fs.copyFileSync(path.join('glossary', file), path.join(glossaryDir, file));
  }
}

// CJS package.json — overrides root "type": "module" so Node treats
// dist-action/*.js as CommonJS (required for GitHub Actions runner)
fs.writeFileSync(
  path.join(outdir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);

console.log(`✓ Action bundled to ${outdir}/index.js (CJS, node20)`);
