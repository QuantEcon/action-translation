# State files keep the keys the engine does not own

**Context**: Every writer of `.translate/state/<file>.yml` (sync, rebase, `init`, `forward`,
`status --write-state`, `headingmap`) rebuilt the file from the engine's six keys, so any other
key was erased by the next write (#290). The key the issue is about is an editor's sign-off,
"written by a workflow on approval", which "the engine must not delete". The overnight build of
2026-11-25 (#476) settled most of the behaviour; an independent review on 2026-11-26 asked for
the rulings to be recorded rather than left in the session log, and found one question open.

**Decision**: Three groups, by who settled them.

Ruled by @mmcky, 2026-11-25:

- Every writer does read-merge-write: it reads the existing state file and keeps every top-level
  key the engine does not own (`ENGINE_STATE_KEYS` in `src/cli/translate-state.ts`), after the
  engine's keys. A file with no other key is written byte for byte as before.
- An existing state file that is not a parseable YAML mapping (unparseable, a repeated key, a
  list or a scalar) is overwritten with a warning naming it. No lifecycle key (a marker that the
  file was overwritten, say) is added to the new file.

Decided in the building session, to be confirmed by @mmcky at merge:

- Kept keys are carried as the text they were, with the lines under them and the comment lines
  above them. Where the text cannot be carried as written, they are written out again from a
  load that keeps every plain scalar's text, so a value is never rewritten (`1234e56`, `0x1f` and
  `0123456`, abbreviated SHAs, stay as written; a quoted string stays quoted). Only a kept
  mapping key that YAML reads as a number falls back to re-serialised values. A value with an
  explicit YAML tag (`!!timestamp`, `!!binary`, a custom `!tag`) is not supported: the file is
  overwritten as one that does not load, and the warning and the PR notice say it is the tag.
- A lecture whose state file the edition answers with anything but a 404 is held back on sync
  (named in the failure issue, which advises a resync once the file reads again) and fails that
  PR's rebase (with a comment advising a re-run). Only a 404 means "no state file", as for
  every other read (`D-2026-11-15-only-a-404-means-absent`).
- The sync PR body names each state file it overwrote, with the reason, under "State Files
  Overwritten", so the editor whose keys were in it sees it.

OPEN, @mmcky's to decide:

- A rebase rebuilds a lecture's state file from the copy on the edition's default branch, at the
  commit it rebases onto. A key added there since the PR opened is kept; a key that exists only
  in the state file on the PR's branch is not (a lecture the PR adds is carried from the branch
  unchanged). The independent review's point: if the sign-off is written when the translation
  PR is approved, it lands on the PR's branch, and the next rebase of that PR erases it. Either
  the sign-off workflow writes to the default branch after the merge, or rebase must also keep
  the keys that only the branch's state file holds, at one more read per lecture (the branch's
  state file). Until this is decided, a sign-off written on the PR branch does not survive a
  rebase.

**Consequences**:

- Sync PRs carry no new state-file churn: a file with only the engine's keys is written as
  before.
- #290 stays open after #476 merges: the issue asks for the behaviour to be exercised on the
  `test-translation-sync` lanes with a state file carrying an extra key before release, which
  makes billed model calls and was not run in the building session; and the rebase question
  above is open.

**Refs**: #290, #476, `D-2026-11-15-only-a-404-means-absent`.
