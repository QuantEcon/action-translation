# Only a 404 means a file is absent; any other failed read fails the run

**Context**: Sync and rebase took any failed read of a removed lecture as "already gone": a
rate limit or a 5xx skipped the deletion, and the run passed with the lecture still in the
edition (#396). A removed lecture's state-file read that failed was ignored, and a genuine 404
never had its state file read at all. The bibliography read sat outside every check, so when
it threw, the run failed with no failure issue and dropped the errors it had recorded (#386).
`D-2026-10-19-sync-scope-existing-reads-state-files` had already taken the 404-only rule for
the scope check. Ruled 2026-11-15 (@mmcky), in the overnight plan for WP2 (2b), shipped in
#440.

**Decision**:

- **A 404 alone means the edition no longer has the file.** Any other status is a fetch error
  for that file. Sync fails the run and opens the failure issue, and the PR's other files
  still sync. Rebase stops before the branch moves.
- **A failed state-file read is an error, never absence.** A removed lecture whose state file
  read fails, or a renamed lecture whose state file at its old path fails, is held back with an
  error, since whether to delete that file is unknown.
- **An orphan state file is deleted.** A removed lecture the edition no longer has, whose state
  file is still there, has the state file deleted, listed under Files Deleted.
- **A 404 is trusted only after the edition itself is read.** GitHub also answers 404 for a
  repository the token cannot see, so a removal-only PR against a misspelt `target-repo`
  passed with nothing done. Sync now reads the edition repository itself before it trusts a
  removal's 404, once per run, as the scope check does.
- **A bibliography that cannot be read holds the whole sync.** No lecture, ToC change or removal
  goes ahead, and the model is not called. The failure issue lists every error the run
  recorded, the bibliography's last, with a Recovery line of its own.

**Consequences**:

- The rule went in one read at a time ("the 404-only reads now, with a note on #169"): the
  removal reads, their state files and the bibliography. Sync's reads of changed and renamed
  lectures under `sync-scope: all` still take a failed edition read as a new file (F36 on
  #169). The note on #169 (2026-11-15) records what is left.
- Rebase applies the same rule to its three reads (`D-2026-11-15-rebase-decides-from-three-reads`).

**Refs**: #396, #386, #440, #169 (F36), `D-2026-10-19-sync-scope-existing-reads-state-files`.
