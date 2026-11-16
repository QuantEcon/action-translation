# `doctor --require-state` is condition 3's state check; exceptions are declared in the config

**Context**: `sync-scope` retires once, among other things, every syncing edition runs a state
check as a required CI check on every PR and on pushes to `main`, one that fails on (a) a
lecture without a state file that is not a declared exception, (b) a declared exception that
has a state file, (c) a state file with no lecture, and (d) an unreadable state file
(condition 3 of `D-2026-10-19-sync-scope-existing-reads-state-files`, ruled 2026-10-19
(@mmcky) on #370). Ruling 7 of `D-2026-11-16-the-lecture-set-is-the-toc-and-its-includes`
runs it on the edition's lecture set rather than on every `.md` under the docs folder. #370
asked for the flag, with `--exclude` for pages deliberately left untranslated; its 2026-10-19
comment left the exceptions key's name and shape open. Built from the design of 2026-11-16
(draft 2, after a Fable design review), in the PR that adds this record.

**Decision**:

- **`translate doctor -t <edition> --require-state`** turns the `.translate/state/` check into
  the four-item check. It needs no `-s`: the set comes from the edition's own `_toc.yml`, and
  a CI job in an edition repository has only that checkout. Without the flag nothing changes,
  and a partial gap is still a warning. `doctor` exits 1 on any failed check, so a required
  CI check also fails on its other checks, such as `.translate/config.yml` and `Lecture set`.
- **The four items**, on the edition's lecture set: its ToC's documents, then the `.md` files
  they include, limited to the files the edition has. Each fails, and names its files:
  - (a) a lecture in the set with no `.translate/state/<path>.yml` that is not declared;
  - (b) a declared exception in the set that has a state file;
  - (c) a state file whose `.md` the edition does not have;
  - (d) a state file whose `.md` the edition has, and that `inspectFileState` rejects, with
    its reason (#165, #381).

  Every item is reported in one run, where the check before it returned the first non-empty
  one. A state file that is both orphaned and unreadable counts as orphaned, since (d) reads
  only the state files of lectures the edition has.
- **One listing of the state folder** (`listStateFiles`) decides every item, compared with the
  set and the edition's `.md` files as strings, not with `fs.existsSync`. On a macOS clone
  `existsSync` finds `Intro.md.yml` for `intro.md`, and neither the Linux runner nor sync's
  reads through the API (`targetHasFile`) do; string comparison gives one answer everywhere.
  No state folder is an empty listing, so an edition that declares every lecture passes.
- **Exceptions are declared under `state-exceptions` in `.translate/config.yml`**: a mapping
  from a docs-relative path to a non-empty reason, read with `CORE_SCHEMA` (a bare date is
  text), its keys put in the lecture set's spelling with the reader's normaliser
  (`normalizeDocsPath`, exported for this). A key that cannot be used fails the check and is
  named: a value that is not a mapping, a reason that is not non-empty text, an absolute path
  or `..` out of the folder, a key that does not end in `.md`, and a repeated key, which
  js-yaml refuses. A key equal to `<docs-folder>/<a lecture in the set>` is named as
  repo-relative. `TranslateConfig` gains the optional key; its three core keys, and so
  `checkEditionConfig` and `setup`, are unchanged.
- **`--json`** carries a top-level `requireState: true`, and the check's `data` holds the six
  lists in full, each sorted: `missing`, `declaredWithState`, `orphaned`, `corrupt`,
  `unlisted` and `staleExceptions`. `summary` keeps its shape.

**Implementation readings, for @mmcky to confirm** (listed in the PR body):

1. A state file whose `.md` the edition has but that is outside the set (`status`'s
   `UNLISTED`: a lecture taken out of the ToC and kept with its state file, which ruling 4
   allows) warns and does not fail. If that state file cannot be read, it fails under (d).
2. A declared exception the edition does not have, or that is outside the set, is stale: it
   warns and does not fail. It is harmless to sync, and the warning keeps the list honest
   without blocking CI.
3. Exceptions are a mapping from path to reason, under `state-exceptions`, so that the reason
   survives `writeConfig`. `writeConfig` keeps keys it does not know but re-dumps the YAML, so
   comments are lost, and `status --write-state` rewrites the config this way.
4. `doctor` gets no `--exclude`. The 2026-10-19 ruling chose exceptions declared in the
   config, each listed by name: they stay in one place, are reviewed in the edition's own PRs,
   and CI runs one command with no flags to keep in step. This replaces #370's proposal.
5. A file under `.translate/state/` that is not `<path>.md.yml` (`.DS_Store`, `notes.yml`,
   `foo.ipynb.yml`) fails under (c), with its own wording: sync never reads it, so it can only
   be a mistake.
6. The correction below.

**Correction to ruling 7 of `D-2026-11-16-the-lecture-set-is-the-toc-and-its-includes`**: its
last sentence says that ml's `intro.md` and `_admonition/gpu.md`, and
lecture-python-programming.fa's English `_admonition/gpu.md`, still need declared exceptions.
On 2026-11-16 that holds only for ml's `intro.md`:

- **ml's `_admonition/gpu.md` is outside ml's lecture set today.** None of ml's lectures
  includes it: the three that do in the source (`autodiff`, `jax_intro`,
  `numpy_vs_numba_vs_jax`) are among the ToC entries ml has no file for. Declared now, it
  would be a stale exception. It joins ml's set, and needs its declaration, when the first
  lecture that includes it lands.
- **fa's `_admonition/gpu.md` needs no declaration.** QuantEcon/lecture-python-programming.fa#181
  (merged 2026-11-16) translated it, with its state file; declared now, it would fail (b).

**What each edition needs**, from the editions' configs, ToCs, files and state listings as the
design review read them on 2026-11-16, with fa updated for #181. Rolling the check out in the
editions is edition-repository work, with its own go:

- ml declares `intro.md`, an English copy, and its five translated lectures until their state
  files are backfilled, each with the English commit its draft was made from.
- fr, zh-cn and lecture-python.zh-cn hold a translated `_admonition/gpu.md`, included by 3, 3
  and 30 of their lectures, with no state file. Each fails (a) until an edition PR adds one
  with `translate status -f _admonition/gpu.md --write-state`.
- fa and lecture-intro.zh-cn need nothing: lecture-intro.zh-cn's `README.md` is in no ToC.
- No edition has a state file without its `.md`, a file under `.translate/state/` that is not
  a `<path>.md.yml`, or a state subfolder other than `_admonition/`.

**Implementation choices, not ruled**:

- The normaliser keeps a trailing `/`, so the exceptions reader drops one before normalising,
  as the design meant it to be covered; `.\intro.md` and `./intro.md` both name `intro.md`.
- Two keys that normalise to one file (`intro.md` and `./intro.md`) fail as a repeated key
  would; js-yaml cannot see them, since the strings differ.
- A repo-relative key is listed among the stale exceptions, with the hint, and warns; the
  lecture it meant is then undeclared and fails (a) if it has no state file.
- `data` also carries `exceptionErrors`, the problems with `state-exceptions`, so a failure
  from the key alone is visible in `--json` beyond the `details`. `requireState` is present
  only when the flag is given, so output without it is unchanged.
- `state-exceptions:` with nothing under it is no exceptions, not a malformed key.
- Each item is judged on its own: a declared exception in the set whose state file cannot be
  read is reported under (b) and (d), and an unreadable `UNLISTED` one is listed under both
  (d) and the warning. Only the orphan rule removes a file from (d).
- `listStateFiles` follows symbolic links whose target is inside the state folder, as
  `fileSystemSource` does for the docs folder, skips those out of it and those to nothing, and
  skips no folder.
- `checkConfig` names a config that does not load, a repeated key with its line among them,
  where it reported "missing required fields".
- The exceptions reader in `translate-state.ts` checks only the YAML's shape, and doctor
  normalises the paths, so that the module, which the action bundles, does not import the
  lecture-set reader.

**Consequences**:

- Condition 3 is built, not met: it is met once every syncing edition runs the check as a
  required CI check. #371 is to scaffold the job in `translate setup`; until then the CLI
  reference gives a job that builds the CLI from a pinned release.
- The check judges with the edition's ToC, and sync with the source's. They agree while the
  edition's `_toc.yml` is a committed mirror, which is the rule. The `UNLISTED` warning rests
  on ruling 4, which sync honours since #457: a lecture outside the source's set is not
  synced, so its state file does not put it in scope.
- The backfills the 2026-10-19 record lists still stand. Of the declared exceptions it lists,
  only ml's `intro.md` remains: lecture-intro.zh-cn's `README.md` left with ruling 7, and ml's
  and fa's `_admonition/gpu.md` with the correction above.

**Refs**: #370, #371, #449, #457, #165, #381, #385,
`D-2026-10-19-sync-scope-existing-reads-state-files`,
`D-2026-11-16-the-lecture-set-is-the-toc-and-its-includes`,
QuantEcon/lecture-python-programming.fa#181, QuantEcon/lecture-python-programming.ml.
