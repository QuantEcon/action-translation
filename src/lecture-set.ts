/**
 * The lecture set: which `.md` files of a docs folder are lectures (#449).
 *
 * A lecture is a document the folder's ToC lists, or a `.md` file that one of
 * them includes with an `{include}` directive, followed through further
 * includes. Everything else under the folder (a draft, a `README.md`, an entry
 * commented out of the ToC) is not. "Published" means listed, not built: an
 * edition built without `only_build_toc_files` also builds unlisted files, and
 * they are still outside the set. Ruled 2026-11-16 (@mmcky), on #449
 * (D-2026-11-16-the-lecture-set-is-the-toc-and-its-includes).
 *
 * One reader serves `init`, sync and the CLI's bulk modes. It reads through a
 * `LectureSetSource`: a list of the folder's files and a way to read one, so
 * the CLI drives it from the filesystem and the action from the GitHub API at
 * one commit. ToC entries are resolved against that file list, since a Jupyter
 * Book `file:` entry normally has no extension: an entry is a lecture only
 * when a `.md` is behind it, and one backed by a notebook is left out.
 *
 * The ToC is read by a front end. `_toc.yml` (`jb-book` and `jb-article`) is
 * built. `myst.yml` is named, so the shape is fixed, but it is refused until
 * the first edition moves to mystmd, when its front end is to be built with a
 * test against lecture-wasm's ToC.
 *
 * It lives outside `src/index.ts`, which cannot be imported (#169).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/** A docs folder's files, and a way to read one. Paths are docs-relative, with `/`. */
export interface LectureSetSource {
  /** Every file under the docs folder, subfolders included, such as `_admonition/gpu.md`. */
  files: readonly string[];
  /** One file's text. Rejects when it cannot be read. */
  read(file: string): Promise<string>;
}

/** A ToC entry, as a front end reads it, in document order. */
export type TocEntry =
  | { kind: 'file'; value: string }
  | { kind: 'glob'; value: string }
  | { kind: 'url'; value: string };

/** Turns one kind of ToC into entries. */
export interface TocFrontEnd {
  /** The ToC's file name in the docs folder. */
  file: string;
  /** False for a front end that is named but not built yet. */
  built: boolean;
  /** The entries, in document order. Throws on a ToC it cannot read. */
  entries(text: string): TocEntry[];
}

/** A ToC the reader cannot use: missing, malformed, or of a kind not built yet. */
export class LectureSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LectureSetError';
  }
}

/** A file the reader needed and could not read. */
export class LectureReadError extends Error {
  constructor(
    readonly file: string,
    readonly cause: unknown
  ) {
    super(`${file} could not be read: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'LectureReadError';
  }
}

// =============================================================================
// FRONT ENDS
// =============================================================================

/**
 * Every entry of a parsed `_toc.yml`, in document order, at any depth: the
 * `root`, then `chapters:` and `sections:` under the root (a `jb-book`'s
 * chapters, a `jb-article`'s sections), under a part, or nested under an
 * entry. The walk visits an entry's own `file:`, `glob:` or `url:`, then its
 * `chapters:`, then its `sections:`.
 */
export function tocYmlEntries(doc: unknown): TocEntry[] {
  const out: TocEntry[] = [];
  const visit = (entries: unknown): void => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.file === 'string') out.push({ kind: 'file', value: e.file });
      else if (typeof e.glob === 'string') out.push({ kind: 'glob', value: e.glob });
      else if (typeof e.url === 'string') out.push({ kind: 'url', value: e.url });
      visit(e.chapters);
      visit(e.sections);
    }
  };
  if (!doc || typeof doc !== 'object') return out;
  const root = doc as Record<string, unknown>;
  if (typeof root.root === 'string') out.push({ kind: 'file', value: root.root });
  visit(root.chapters);
  visit(root.sections);
  if (Array.isArray(root.parts)) {
    for (const part of root.parts) {
      if (typeof part === 'object' && part !== null) {
        visit((part as Record<string, unknown>).chapters);
      }
    }
  }
  return out;
}

/**
 * Every `file:` value in a parsed TOC, in document order, at any depth —
 * `chapters:` and `sections:` under the root, under a part, or nested under
 * an entry.  The `root` is not included.  Sync uses it on the ToC it delivers
 * (`removeTocFileEntries`).
 */
export function collectTocFiles(doc: unknown): string[] {
  const rootFile =
    doc && typeof doc === 'object' ? (doc as Record<string, unknown>).root : undefined;
  const entries = tocYmlEntries(doc);
  // `tocYmlEntries` puts a string `root` first; this list never held it.
  const rest = typeof rootFile === 'string' ? entries.slice(1) : entries;
  return rest.filter((e) => e.kind === 'file').map((e) => e.value);
}

/** The `_toc.yml` formats the walk reads. */
const TOC_YML_FORMATS = ['jb-book', 'jb-article'];

/** Jupyter Book 1's `_toc.yml`: `jb-book` and `jb-article`. Any other `format` is refused. */
export const TOC_YML: TocFrontEnd = {
  file: '_toc.yml',
  built: true,
  entries(text: string): TocEntry[] {
    let doc: unknown;
    try {
      doc = yaml.load(text);
    } catch (e) {
      throw new LectureSetError(
        `_toc.yml is not valid YAML: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      throw new LectureSetError('_toc.yml is empty or not a YAML mapping');
    }
    // A layout the walk does not know would read as an empty book, so every
    // lecture would fall outside the set in silence. Refuse it instead.
    const { format, root } = doc as Record<string, unknown>;
    if (format !== undefined && !TOC_YML_FORMATS.includes(String(format))) {
      throw new LectureSetError(
        `_toc.yml has format '${String(format)}'; the lecture set reads ${TOC_YML_FORMATS.join(' and ')}`
      );
    }
    if (typeof root !== 'string') {
      throw new LectureSetError('_toc.yml has no root: jb-book and jb-article both name one');
    }
    return tocYmlEntries(doc);
  },
};

/**
 * mystmd's `myst.yml`, whose ToC is `project.toc`: `file:` (with or without
 * the extension), `title:` with `children:`, `pattern:` and `url:`. Without a
 * `toc`, mystmd builds every Markdown and notebook file in the folder and
 * below. Not built yet: no edition is on mystmd (#449, ruling 8).
 */
export const MYST_YML: TocFrontEnd = {
  file: 'myst.yml',
  built: false,
  entries(): TocEntry[] {
    throw new LectureSetError(
      "myst.yml's ToC is not supported yet: the lecture set reads _toc.yml only, until the " +
        'first edition moves to mystmd (#449)'
    );
  },
};

/** The front ends, in the order they are looked for. */
export const TOC_FRONT_ENDS: readonly TocFrontEnd[] = [TOC_YML, MYST_YML];

/**
 * The front end for a docs folder: the first whose file is at the folder's
 * top level. A `_toc.yml` in a subfolder is not the book's ToC. Throws when
 * the folder has none.
 */
export function findTocFrontEnd(files: readonly string[]): TocFrontEnd {
  const present = new Set(files);
  const found = TOC_FRONT_ENDS.find((f) => present.has(f.file));
  if (!found) {
    throw new LectureSetError(
      `the docs folder has no ${TOC_FRONT_ENDS.map((f) => f.file).join(' or ')}, so it has no ` +
        'lecture set'
    );
  }
  return found;
}

// =============================================================================
// ENTRIES AND INCLUDES
// =============================================================================

/** `a/./b`, `./a/b` and `a//b` name one file; `..` past the folder's top is `undefined`. */
function normalize(file: string): string | undefined {
  const n = path.posix.normalize(file.replace(/\\/g, '/'));
  if (n === '..' || n.startsWith('../') || n.startsWith('/')) return undefined;
  return n === '.' ? '' : n;
}

/**
 * A glob over docs-relative paths: `*` and `?` stay within one folder, `**`
 * crosses them, and `[seq]` and `[!seq]` are character classes, as in
 * Python's `fnmatch`.
 */
function globPattern(glob: string): RegExp {
  const escape = (c: string) => c.replace(/[.+^${}()|[\]\\/-]/g, '\\$&');
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    const close = c === '[' ? glob.indexOf(']', i + 2) : -1;
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (close > 0) {
      const body = glob.slice(i + 1, close);
      const cls = (b: string) => b.replace(/[\\^]/g, '\\$&');
      re += body.startsWith('!') ? `[^${cls(body.slice(1))}]` : `[${cls(body)}]`;
      i = close;
    } else re += escape(c);
  }
  return new RegExp(`^${re}$`);
}

/** How one ToC `file:` entry resolves against the folder's files. */
export type ResolvedEntry =
  | { kind: 'markdown'; file: string }
  | { kind: 'other'; file: string }
  | { kind: 'missing'; entry: string };

/** The source suffixes a Jupyter Book 1 document can have, `.md` first. */
const SOURCE_SUFFIXES = ['.md', '.ipynb', '.rst', '.Rmd', '.myst'];

/**
 * Resolve a `file:` entry as sphinx-external-toc does: a source suffix is
 * stripped, then the document is the file with that stem and a source suffix.
 * `intro` and `intro.md` are `intro.md` when it exists; an entry backed only
 * by another source (`intro.ipynb`, `intro.rst`) is a document but not a
 * lecture; an entry with no source behind it is missing. A ToC entry is
 * relative to the docs folder and has no leading `/` (unlike an include).
 */
export function resolveTocFile(entry: string, files: ReadonlySet<string>): ResolvedEntry {
  const value = normalize(entry);
  if (value === undefined || value === '') return { kind: 'missing', entry };
  const suffix = SOURCE_SUFFIXES.find((s) => value.endsWith(s) && value.length > s.length);
  const stem = suffix ? value.slice(0, -suffix.length) : value;
  if (files.has(`${stem}.md`)) return { kind: 'markdown', file: `${stem}.md` };
  for (const s of SOURCE_SUFFIXES) {
    if (files.has(`${stem}${s}`)) return { kind: 'other', file: `${stem}${s}` };
  }
  return { kind: 'missing', entry };
}

/**
 * The `.md` files a `glob:` entry lists, sorted as Sphinx sorts them. The
 * pattern matches a path without its extension, as a `file:` entry names one.
 */
export function expandTocGlob(glob: string, files: readonly string[]): string[] {
  const value = normalize(glob);
  if (value === undefined) return [];
  const re = globPattern(value);
  // Sphinx sorts document names, which have no suffix: `a` before `a-b`.
  return files
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .filter((stem) => re.test(stem))
    .sort()
    .map((stem) => `${stem}.md`);
}

/** A fence line: its marker and the rest of the line. */
const FENCE_RE = /^\s*(`{3,}|~{3,}|:{3,})(.*)$/;
/** A directive's info string: `{name}`, then its argument. */
const DIRECTIVE_RE = /^\{([A-Za-z0-9_+:.-]+)\}\s*(.*)$/;
/**
 * Directives whose body is not MyST, so an `{include}` written inside one is
 * an example, not an include. `{literalinclude}` is here too: its target is
 * code, and its body only options.
 */
const VERBATIM_DIRECTIVES = new Set([
  'code',
  'code-block',
  'code-cell',
  'sourcecode',
  'literalinclude',
  'include',
  'math',
  'raw',
  'eval-rst',
  'mermaid',
  'graphviz',
]);

/**
 * The `{include}` arguments in MyST text, in order. The walk tracks fences:
 * a code block (```python, a bare ```, ~~~) and a verbatim directive are
 * skipped to their closing fence, which uses the same character, is at least
 * as long and carries nothing else; any other directive's body is MyST, so
 * an include nested in an `{admonition}` counts.
 */
function includeArguments(text: string): string[] {
  const out: string[] = [];
  const open: { char: string; length: number; verbatim: boolean }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = FENCE_RE.exec(line);
    const top = open[open.length - 1];
    const closes =
      m !== null &&
      top !== undefined &&
      m[1][0] === top.char &&
      m[1].length >= top.length &&
      m[2].trim() === '';
    if (top?.verbatim) {
      if (closes) open.pop();
      continue;
    }
    if (!m) continue;
    if (closes) {
      open.pop();
      continue;
    }
    const directive = DIRECTIVE_RE.exec(m[2].trim());
    if (directive) {
      if (directive[1] === 'include' && directive[2] !== '') out.push(directive[2]);
      open.push({
        char: m[1][0],
        length: m[1].length,
        verbatim: VERBATIM_DIRECTIVES.has(directive[1]),
      });
    } else if (m[1][0] !== ':') {
      // A code block. A colon fence is only ever a directive's.
      open.push({ char: m[1][0], length: m[1].length, verbatim: true });
    }
  }
  return out;
}

/**
 * The docs-relative `.md` files that `text`, the file at `fromFile`, includes,
 * in order, each once. An argument is resolved as Sphinx resolves it:
 * relative to the including file, or to the docs folder when it starts with
 * `/`. A target outside the docs folder, or not `.md`, is left out.
 */
export function includesOf(text: string, fromFile: string): string[] {
  const out: string[] = [];
  const dir = path.posix.dirname(fromFile);
  for (const raw of includeArguments(text)) {
    const arg = raw.replace(/^(["'])(.*)\1$/, '$2');
    const joined = arg.startsWith('/') ? arg.slice(1) : path.posix.join(dir, arg);
    const target = normalize(joined);
    if (target === undefined || !target.endsWith('.md')) continue;
    if (!out.includes(target)) out.push(target);
  }
  return out;
}

// =============================================================================
// THE READER
// =============================================================================

/** What the ToC lists, resolved against the folder's files. */
export interface TocDocuments {
  /** The ToC's file name: `_toc.yml`. */
  toc: string;
  /** The `.md` documents, in ToC order, each once. */
  documents: string[];
  /** Entries backed by a file that is not `.md`, such as a notebook. Not lectures. */
  otherDocuments: string[];
  /** `file:` entries with nothing behind them, as written. */
  missingEntries: string[];
}

/** The whole lecture set of a docs folder. */
export interface LectureSet extends TocDocuments {
  /** The `.md` files the documents include, and not themselves documents, in the order found. */
  fragments: string[];
  /** Includes whose target the folder does not have. */
  missingIncludes: { from: string; target: string }[];
  /** Is this docs-relative file in the set? */
  has(file: string): boolean;
}

/** Where a file stands, for a caller that needs one answer and not the whole set. */
export type Membership = 'document' | 'fragment' | 'outside';

/** Folders a book never builds from: dot-folders, `_build` and `node_modules`. */
const SKIPPED_FOLDERS = new Set(['_build', 'node_modules']);

/**
 * Whether a docs-relative path can be part of the book: not under a
 * dot-folder (`.ipynb_checkpoints`, `.github`), `_build` or `node_modules`.
 * The reader applies it to every source, so the CLI and sync see one set.
 */
export function isBookFile(file: string): boolean {
  const folders = file.split('/').slice(0, -1);
  return !folders.some((f) => f.startsWith('.') || SKIPPED_FOLDERS.has(f));
}

/** How many reads the reader has in flight at once. */
const DEFAULT_CONCURRENCY = 8;

/**
 * Reads a docs folder's lecture set through a source. Reads are cached, so a
 * caller asking about several files pays for each file once, and they run a
 * few at a time (`concurrency`), which matters when each is an API call. A
 * failed read is cached too, so a reader is for one run: make a new one to
 * retry. A read that fails rejects with a `LectureReadError` naming the file;
 * the ToC's own problems are `LectureSetError`s.
 */
export class LectureSetReader {
  private readonly files: readonly string[];
  private readonly fileSet: ReadonlySet<string>;
  private readonly cache = new Map<string, Promise<string>>();
  private readonly concurrency: number;
  private tocPromise?: Promise<TocDocuments>;

  constructor(
    private readonly source: LectureSetSource,
    options: { concurrency?: number } = {}
  ) {
    this.files = source.files.filter(isBookFile);
    this.fileSet = new Set(this.files);
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  }

  /**
   * Walk the documents, then the files they include, in order, reading a
   * batch at a time. `visit` sees each file's includes in queue order and
   * returns true to stop the walk.
   */
  private async walk(
    documents: readonly string[],
    visit: (from: string, includes: string[]) => boolean
  ): Promise<void> {
    const seen = new Set(documents);
    const queue = [...documents];
    for (let i = 0; i < queue.length; ) {
      const batch = queue.slice(i, i + this.concurrency);
      const texts = await Promise.all(batch.map((f) => this.read(f)));
      for (let j = 0; j < batch.length; j++) {
        const includes = includesOf(texts[j], batch[j]);
        if (visit(batch[j], includes)) return;
        for (const target of includes) {
          if (this.fileSet.has(target) && !seen.has(target)) {
            seen.add(target);
            queue.push(target);
          }
        }
      }
      i += batch.length;
    }
  }

  private read(file: string): Promise<string> {
    let p = this.cache.get(file);
    if (!p) {
      p = this.source.read(file).catch((e: unknown) => {
        throw new LectureReadError(file, e);
      });
      this.cache.set(file, p);
    }
    return p;
  }

  /** The ToC's documents. Throws a `LectureSetError` when the folder has no usable ToC. */
  toc(): Promise<TocDocuments> {
    this.tocPromise ??= this.readToc();
    return this.tocPromise;
  }

  private async readToc(): Promise<TocDocuments> {
    const frontEnd = findTocFrontEnd(this.files);
    // A front end not built yet refuses before its file is read.
    const entries = frontEnd.built
      ? frontEnd.entries(await this.read(frontEnd.file))
      : frontEnd.entries('');
    const documents: string[] = [];
    const otherDocuments: string[] = [];
    const missingEntries: string[] = [];
    const add = (file: string) => {
      if (!documents.includes(file)) documents.push(file);
    };
    for (const entry of entries) {
      if (entry.kind === 'url') continue;
      if (entry.kind === 'glob') {
        expandTocGlob(entry.value, this.files).forEach(add);
        continue;
      }
      const resolved = resolveTocFile(entry.value, this.fileSet);
      if (resolved.kind === 'markdown') add(resolved.file);
      else if (resolved.kind === 'other') otherDocuments.push(resolved.file);
      else if (!missingEntries.includes(resolved.entry)) missingEntries.push(resolved.entry);
    }
    return { toc: frontEnd.file, documents, otherDocuments, missingEntries };
  }

  /**
   * The whole set: the documents, then every `.md` they include, followed
   * through further includes. Reads every document and fragment once.
   */
  async lectureSet(): Promise<LectureSet> {
    const toc = await this.toc();
    const fragments: string[] = [];
    const missingIncludes: { from: string; target: string }[] = [];
    const inSet = new Set(toc.documents);
    await this.walk(toc.documents, (from, includes) => {
      for (const target of includes) {
        if (!this.fileSet.has(target)) {
          missingIncludes.push({ from, target });
        } else if (!inSet.has(target)) {
          inSet.add(target);
          fragments.push(target);
        }
      }
      return false;
    });
    return { ...toc, fragments, missingIncludes, has: (file: string) => inSet.has(file) };
  }

  /**
   * Where one file stands, reading no more than it must: a ToC document is
   * known from the ToC alone, and the include scan stops at the first file
   * that includes this one (after the batch it is in). For sync, where every
   * read is an API call. A ToC entry backed by a notebook is 'outside': it is
   * a document, but not a lecture.
   */
  async membership(file: string): Promise<Membership> {
    const toc = await this.toc();
    if (toc.documents.includes(file)) return 'document';
    if (!this.fileSet.has(file)) return 'outside';
    let found = false;
    await this.walk(toc.documents, (_from, includes) => {
      found = includes.includes(file);
      return found;
    });
    return found ? 'fragment' : 'outside';
  }
}

/** The lecture set of a docs folder, read in full. */
export function readLectureSet(source: LectureSetSource): Promise<LectureSet> {
  return new LectureSetReader(source).lectureSet();
}

// =============================================================================
// THE FILESYSTEM SOURCE
// =============================================================================

/**
 * A docs folder on disk as a `LectureSetSource`, for the CLI. Symbolic links
 * are followed, to files and to folders, as Sphinx follows them, but only
 * when their target is inside the docs folder: a link out of it is left out,
 * so a clone cannot hand the reader a file from elsewhere on the machine.
 * `read` refuses a path that leaves the folder. An edition's own lecture set
 * is this source on the edition's docs folder: its ToC's documents and what
 * its lectures include, limited to the `.md` files it has. A docs folder that
 * does not exist is a `LectureSetError`.
 */
export function fileSystemSource(repoPath: string, docsFolder: string): LectureSetSource {
  const root = path.join(repoPath, docsFolder);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new LectureSetError(`the docs folder ${root} does not exist`);
  }
  const realRoot = fs.realpathSync(root);
  const inside = (real: string) => real === realRoot || real.startsWith(realRoot + path.sep);
  const files: string[] = [];
  // The folders being walked, by real path: a link back to one of them is a cycle.
  const ancestors = new Set<string>();
  const walk = (dir: string, rel: string): void => {
    const real = fs.realpathSync(dir);
    if (ancestors.has(real)) return;
    ancestors.add(real);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      let stat: fs.Stats;
      try {
        if (entry.isSymbolicLink() && !inside(fs.realpathSync(full))) continue;
        stat = fs.statSync(full);
      } catch {
        continue; // a link to nothing
      }
      if (stat.isDirectory()) {
        if (entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name)) continue;
        walk(full, childRel);
      } else if (stat.isFile()) {
        files.push(childRel);
      }
    }
    ancestors.delete(real);
  };
  walk(root, '');
  files.sort();
  return {
    files,
    read: async (file: string) => {
      const rel = normalize(file);
      if (rel === undefined || rel === '') throw new Error(`${file} is not inside the docs folder`);
      const real = await fs.promises.realpath(path.join(root, rel));
      if (!inside(real)) throw new Error(`${file} is not inside the docs folder`);
      return fs.promises.readFile(real, 'utf-8');
    },
  };
}
