# A translation the parity guard refuses is kept under `.translate/refused/`

**Context**: When the structural-parity guard refuses a translation, `translate init` threw
before the write and `translate forward` logged and returned, so the model's output was
discarded and a refusal could not be diagnosed (#364). The run report also cut the failure
message at 500 characters, which loses most of a long violation list (#430). The two issues
named different places to keep the output, `refused/<lecture>.md` beside the report and
`.translate/<lecture>.rejected.md`. Both are inside the edition's working tree, where
`git add -A` could commit model output the guard had refused, and a run with `-f` writes no
report to sit beside. Ruled 2026-11-25 (@mmcky).

**Decision**:

- **The refused output goes to `<target>/.translate/refused/<docs-relative lecture path>`.**
  The bytes are the ones the guard checked, after the engine's repairs, not the raw response.
- **The folder is kept out of git by itself.** A `.gitignore` containing `*` is written, and
  repaired if it is empty or edited, before any refused file, so the rule holds in editions set
  up before this change. `translate setup` also lists `.translate/refused/` in the `.gitignore`
  it writes.
- **A parity failure's message is not cut** in the run report. Other failure kinds keep the
  500-character limit.
- **A later successful translation of the lecture removes its refused file.**
- **Keeping the output never fails the translation.** A path that would leave the folder, a
  symbolic link anywhere from `.translate` down, or a lecture named `.gitignore` is refused, and
  the failure says the output was not kept.

**Consequences**:

- Nothing that reads `.translate/` or the docs folder treats a refused file as a lecture or a
  state file: `doctor`, `doctor --require-state` (a required check in the editions that sync),
  `status`, `headingmap`, `init`, `forward` and `backward` behave the same with refused files
  present.
- One residual is documented, not prevented: with `docs-folder: .`, the folder sits inside the
  docs folder, and a local `jupyter-book build .` would parse a refused lecture, since Sphinx
  does not skip dot-folders. CI never sees the files.
- Only the parity guard keeps its output. `forward`'s other post-write refusals still discard
  theirs.

**Refs**: #364, #430, #473, `D-2026-11-15-init-keeps-the-editions-files`
