/**
 * Runtime path derivation for the Action entry point.
 *
 * This is the one module allowed to contain `import.meta.url` (#169 F123):
 * ts-jest compiles tests to CJS, where `import.meta` is a parse-time error,
 * so nothing testable may import this file. The entry shim computes paths
 * here and threads them into the extracted mode runners as arguments.
 */
import * as path from 'path';
import { fileURLToPath } from 'url';

/** Directory of the running module (src/ in dev, dist-action/ in the bundle). */
export function getModuleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * The built-in glossary directory that ships beside the bundle:
 * <moduleDir>/../glossary is the repo-root glossary/ both in dev
 * (src/../glossary) and in the shipped Action (dist-action/../glossary).
 */
export function getBuiltInGlossaryDir(): string {
  return path.join(getModuleDir(), '..', 'glossary');
}
