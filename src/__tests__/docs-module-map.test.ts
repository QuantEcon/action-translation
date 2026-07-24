/**
 * Module-map completeness guard (#168 — audit F132).
 *
 * Two module maps existed and both omitted every module added since v0.21 —
 * 27 files changed across two releases and neither map moved. There is now
 * ONE map, in docs/developer/architecture.md, and this test fails when a
 * source module is missing from it, so the map cannot silently drift again.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

/** Production source files, recursively — tests and test support excluded. */
function sourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'test-support') {
        results.push(...sourceFiles(full));
      }
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe('the architecture module map', () => {
  it('names every production source module', () => {
    const map = fs.readFileSync(path.join(ROOT, 'docs', 'developer', 'architecture.md'), 'utf8');
    const missing = sourceFiles(path.join(ROOT, 'src'))
      .map((f) => path.basename(f))
      .filter((name) => !map.includes(name));
    expect(missing).toEqual([]);
  });
});
