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

/** Jupyter Book 1's `_toc.yml`: `jb-book` and `jb-article`. */
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

/** A glob over docs-relative paths: `*` and `?` stay within one folder, `**` crosses them. */
function globPattern(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** How one ToC `file:` entry resolves against the folder's files. */
export type ResolvedEntry =
  | { kind: 'markdown'; file: string }
  | { kind: 'other'; file: string }
  | { kind: 'missing'; entry: string };

/**
 * Resolve a `file:` entry as Sphinx does: `intro` is `intro.md` when that
 * exists; an entry backed by any other file (`intro.ipynb`, `intro.rst`, or
 * an exact name that is not `.md`) is a document but not a lecture; an entry
 * with nothing behind it is missing.
 */
export function resolveTocFile(entry: string, files: ReadonlySet<string>): ResolvedEntry {
  const value = normalize(entry);
  if (value === undefined || value === '') return { kind: 'missing', entry };
  if (value.endsWith('.md')) {
    return files.has(value) ? { kind: 'markdown', file: value } : { kind: 'missing', entry };
  }
  if (files.has(`${value}.md`)) return { kind: 'markdown', file: `${value}.md` };
  if (files.has(value)) return { kind: 'other', file: value };
  for (const f of files) {
    if (f.startsWith(`${value}.`) && !f.slice(value.length + 1).includes('/')) {
      return { kind: 'other', file: f };
    }
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
  return files.filter((f) => f.endsWith('.md') && re.test(f.slice(0, -3))).sort();
}

/**
 * A line opening an `{include}` directive, in a backtick, tilde or colon
 * fence. Group 2 is the argument. `{literalinclude}` does not match: its
 * target is code.
 */
const INCLUDE_RE = /^\s*(`{3,}|~{3,}|:{3,})\{include\}\s+(\S.*?)\s*$/;

/**
 * The docs-relative `.md` files that `text`, the file at `fromFile`, includes,
 * in order, each once. An argument is resolved as Sphinx resolves it:
 * relative to the including file, or to the docs folder when it starts with
 * `/`. A target outside the docs folder, or not `.md`, is left out.
 */
export function includesOf(text: string, fromFile: string): string[] {
  const out: string[] = [];
  const dir = path.posix.dirname(fromFile);
  for (const line of text.split(/\r?\n/)) {
    const m = INCLUDE_RE.exec(line);
    if (!m) continue;
    const arg = m[2].replace(/^(["'])(.*)\1$/, '$2');
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

/**
 * Reads a docs folder's lecture set through a source. Reads are cached, so a
 * caller asking about several files pays for each file once. A read that
 * fails rejects with a `LectureReadError` naming the file; the ToC's own
 * problems are `LectureSetError`s.
 */
export class LectureSetReader {
  private readonly fileSet: ReadonlySet<string>;
  private readonly cache = new Map<string, Promise<string>>();
  private tocPromise?: Promise<TocDocuments>;

  constructor(private readonly source: LectureSetSource) {
    this.fileSet = new Set(source.files);
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
    const frontEnd = findTocFrontEnd(this.source.files);
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
        expandTocGlob(entry.value, this.source.files).forEach(add);
        continue;
      }
      const resolved = resolveTocFile(entry.value, this.fileSet);
      if (resolved.kind === 'markdown') add(resolved.file);
      else if (resolved.kind === 'other') otherDocuments.push(resolved.file);
      else missingEntries.push(resolved.entry);
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
    const seen = new Set(toc.documents);
    const queue = [...toc.documents];
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i];
      for (const target of includesOf(await this.read(from), from)) {
        if (!this.fileSet.has(target)) {
          missingIncludes.push({ from, target });
        } else if (!seen.has(target)) {
          seen.add(target);
          fragments.push(target);
          queue.push(target);
        }
      }
    }
    return { ...toc, fragments, missingIncludes, has: (file: string) => seen.has(file) };
  }

  /**
   * Where one file stands, reading no more than it must: a ToC document is
   * known from the ToC alone, and the include scan stops at the first file
   * that includes this one. For sync, where every read is an API call.
   */
  async membership(file: string): Promise<Membership> {
    const toc = await this.toc();
    if (toc.documents.includes(file)) return 'document';
    if (!this.fileSet.has(file)) return 'outside';
    const seen = new Set(toc.documents);
    const queue = [...toc.documents];
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i];
      for (const target of includesOf(await this.read(from), from)) {
        if (target === file) return 'fragment';
        if (this.fileSet.has(target) && !seen.has(target)) {
          seen.add(target);
          queue.push(target);
        }
      }
    }
    return 'outside';
  }
}

/** The lecture set of a docs folder, read in full. */
export function readLectureSet(source: LectureSetSource): Promise<LectureSet> {
  return new LectureSetReader(source).lectureSet();
}

// =============================================================================
// THE FILESYSTEM SOURCE
// =============================================================================

/** A symbolic link to a file, followed; a link to a folder or to nothing is not a file. */
function isFileTarget(link: string): boolean {
  try {
    return fs.statSync(link).isFile();
  } catch {
    return false;
  }
}

/** Folders a book never builds from: dot-folders, `_build` and `node_modules`. */
const SKIPPED_FOLDERS = new Set(['_build', 'node_modules']);

/**
 * A docs folder on disk as a `LectureSetSource`, for the CLI. Symbolic links
 * to folders are not followed. An edition's own lecture set is this source on
 * the edition's docs folder: its ToC's documents and what its lectures
 * include, limited to the `.md` files it has.
 */
export function fileSystemSource(repoPath: string, docsFolder: string): LectureSetSource {
  const root = path.join(repoPath, docsFolder);
  const files: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), childRel);
      } else if (entry.isFile()) {
        files.push(childRel);
      } else if (entry.isSymbolicLink() && isFileTarget(path.join(dir, entry.name))) {
        files.push(childRel);
      }
    }
  };
  if (fs.existsSync(root)) walk(root, '');
  files.sort();
  return {
    files,
    read: (file: string) => fs.promises.readFile(path.join(root, file), 'utf-8'),
  };
}
