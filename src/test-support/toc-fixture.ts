/**
 * A `_toc.yml` for a test fixture's docs folder.
 *
 * `init` and the CLI's bulk modes take their lectures from the docs folder's
 * lecture set: the documents its `_toc.yml` lists and the `.md` files they
 * include (#449). A folder without a ToC has no lecture set, and a bulk run
 * there fails, so a fixture that runs one writes a ToC beside its files.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Write `<docsDir>/_toc.yml`, a `jb-book` listing `files` in order: the first
 * as its root, the rest as chapters. Each file is named by its docs-relative
 * path, with or without `.md`, and the entry drops the suffix, as a Jupyter
 * Book ToC does. The files themselves are not written: a name with no file
 * behind it is an entry the reader reports as missing.
 */
export function writeToc(docsDir: string, files: readonly string[]): void {
  if (files.length === 0) {
    throw new Error('writeToc: a jb-book ToC needs a root, so name at least one file');
  }
  const [root, ...chapters] = files.map((file) => file.replace(/\.md$/, ''));
  const lines = ['format: jb-book', `root: ${root}`];
  if (chapters.length > 0) {
    lines.push('chapters:', ...chapters.map((chapter) => `  - file: ${chapter}`));
  }
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, '_toc.yml'), `${lines.join('\n')}\n`, 'utf-8');
}
