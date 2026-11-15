# A state file the CLI cannot write is a failure, and `status --write-state` says what it wrote

**Context**: `translate init` and `translate forward` caught every error from a lecture's
state-file write and carried on, so the lecture was counted as translated and the run passed
with no state file beside it (#378). Under `sync-scope: existing` a lecture without one is out
of scope (`D-2026-10-19-sync-scope-existing-reads-state-files`), so it never synced, and the
docs told the operator to check each state file by hand. `translate status --write-state`
printed "metadata written" and exited 0 whatever it did: a mistyped `-f`, a lecture only one
repository has and a failed write all looked like success, and it wrote the config even when it
wrote no state file (#401). Ruled 2026-11-15 (@mmcky), in the overnight plan for WP3 (3a),
shipped in #444.

**Decision**:

- **`init` writes the state file before it counts the lecture.** A failed write fails the
  lecture, with the `state-write` kind in `--report-json`, and the run exits 1. The translation
  stays on disk and its tokens still count. The run prints, for each such lecture, the
  `translate status --write-state` command that records it once the cause is fixed, with the
  edition's own `-s`, `-t`, `-l` and `-d`. A state folder `init` cannot write at all stops the
  run before any model call.
- **`source-sha: unknown` gets a warning**, in `init` and `forward`, when the source clone has no
  commit for the lecture.
- **`forward` fails the same way**: a failed local write is an error and exits 1.
- **`status --write-state` reports what it wrote.** The banner counts the state files written
  and says whether the config was, and each file left without one is listed with its reason.
  It exits 1 when a write failed, with `-f` when that file got no state file, and in a bulk run
  that wrote none. The config is written only if at least one file is eligible. `--json`
  carries the same record.

Two points flagged on #444 were accepted at its merge (2026-11-16):

- a departure from the design, which said to throw after the loop if any write failed. Instead,
  `runStatus` returns the record and the CLI exits 1, so the status table and the files left
  without a state file still print;
- a bulk run that wrote no state file exits 1, as the design had it. That goes beyond #401,
  which asked for exit 1 only with `-f` and on a failed write, but a bulk run that found nothing
  eligible has done nothing, and exit 0 reads as success.

**Consequences**:

- The manual state-file check is gone from the CLI reference, the FAQ and both tutorials.
- A script that ran `status --write-state` over a folder with nothing to record now sees exit 1.

**Refs**: #378, #401, #444, `D-2026-10-19-sync-scope-existing-reads-state-files`, `D-2026-10-19-lecture-at-a-time-tooling-is-cli-first`.
