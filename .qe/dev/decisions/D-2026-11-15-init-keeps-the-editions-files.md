# `init` keeps the edition's own files, with no flag to overwrite them, and refuses a config that differs from its flags

**Context**: `init -f` narrowed the translation, not the rest of the run (#134). Every run
copied each non-Markdown file in the source docs folder over the edition's copy, rewrote
`.translate/config.yml` from its flags, and wrote `TRANSLATION-REPORT.md` at the edition's root.
On the lecture-at-a-time route (#344), where `init -f` runs once per lecture, that came with
every round, and the tutorials had the operator restore the edition's copies and delete the
report each time. `D-2026-10-19-lecture-at-a-time-tooling-is-cli-first` put "no clobbering of
the edition's files" among the CLI fixes and left the shape open. #134 suggested
copy-if-missing under `-f` only, with a `--copy-assets` flag to keep the full copy reachable.
Ruled 2026-11-15 (@mmcky), in the overnight plan for WP3: "Copy assets only if missing,
everywhere, with no flag", and "A config mismatch is refused before any model call;
a matching config is left byte-identical; no `TRANSLATION-REPORT.md` with `-f`."

**Decision**:

- **Copy only what the edition lacks, on every run, bulk included, with no flag.** A file the
  edition has is never overwritten. In an existing edition such a file is usually localised:
  a translated `_toc.yml` caption, a `_config.yml` title, a figure with translated labels. A
  first run into an empty target still copies everything, so a fresh seed is unchanged. The
  run prints how many files it copied and kept, and a dry run prints the same counts.
- **The config is written only when the edition has none.** One whose `source-language`,
  `target-language` and `docs-folder` match the flags is left byte for byte. One that differs
  stops the run before any model call, dry run included, naming each key with both values.
  Only the operator knows whether the flags or the config are wrong, so the run does not
  guess. An empty config counts as having no keys.
- **With `-f`, no `TRANSLATION-REPORT.md`.** Each failed lecture's error is printed on stderr
  in full, since the failure line keeps 200 characters, and `--report-json` still records the
  run.

**Consequences**:

- A build file the source changes after the edition first copied it, `_toc.yml` among them,
  is not refreshed by a later run, bulk or `-f`. The edition updates its copy by hand. A
  lecture added with `init -f` needs its entry added to the edition's `_toc.yml` until the
  ToC is maintained for it (#259).
- A later round's PR still has to drop any new non-Markdown file the source added that the
  round's lecture does not use. Copy-if-missing removes the restore step, not that one.
- `status --write-state` still rewrites `.translate/config.yml` from its flags (#175). This
  record covers `init` only.

**Refs**: #134, #344, #259, #175, `D-2026-10-19-lecture-at-a-time-tooling-is-cli-first`.
