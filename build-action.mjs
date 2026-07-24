/**
 * Bundle the GitHub Action entry point to CJS for the Actions runner.
 *
 * The source is compiled to ESM by tsc (for ink v4 compatibility).
 * esbuild re-bundles it to CJS so the GitHub Actions node24 runner
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
  target: 'node24',
  outfile: path.join(outdir, 'index.js'),
  // Replace import.meta.url with a CJS-compatible equivalent
  define: {
    'import.meta.url': '__importMetaUrl',
  },
  banner: {
    js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;',
  },
  // Source maps for debugging action failures. sourcesContent: false keeps
  // the committed map at file/line mappings only (~0.8 MB instead of 2.9 MB
  // with all 227 sources inlined) — the run.cjs shim decodes frames to
  // src/ paths, and nothing ever reads the embedded source text (#168).
  sourcemap: true,
  sourcesContent: false,
});

// CJS package.json — overrides root "type": "module" so Node treats
// dist-action/*.js as CommonJS (required for GitHub Actions runner)
fs.writeFileSync(
  path.join(outdir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n'
);

// Entry shim: enable source maps BEFORE the bundle is compiled, so terminal
// stack traces decode through index.js.map to src/ locations. It must be a
// separate file — a node24 action's `runs:` block has no `env:` key for
// NODE_OPTIONS, and enabling inside the bundle itself is too late because the
// module is already compiled by the time its first line executes (measured;
// see the 2026-07 audit boundaries record). action.yml's `main:` points here.
fs.writeFileSync(
  path.join(outdir, 'run.cjs'),
  ['process.setSourceMapsEnabled(true);', "require('./index.js');", ''].join('\n')
);

console.log(`✓ Action bundled to ${outdir}/index.js (CJS, node24)`);
