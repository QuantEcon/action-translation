# `.dev/` — development notes

Internal working memory for this repository, shared by **maintainers and coding agents**.
Nothing in here is published: it is not part of the docs site (`docs/`), the npm package, or
the action bundle. It saves state between work sessions — what we're doing now, what's next,
and why we decided what we decided.

`action-translation` is the **pilot repo** for the QuantEcon `.dev/` convention
(QuantEcon/action-translation#73; design QuantEcon/QuantEcon.manual#103). This folder follows
that pilot layout.

## Structure

```
.dev/
├── STATE.md           # living, ≤1 page — in flight / blocked / next; carries `verified:`
├── PLAN.md            # living — current roadmap (not its history)
├── FUTURE.md          # living — feature ideas, documented for iteration before scheduling
├── ARCHITECTURE.md    # living — assessment + open design questions
├── decisions/         # append-only — one settled decision per file; never edited (superseded)
│   └── YYYY-MM-DD-<slug>.md
├── log/               # append-only — per-session summaries (date + short session id)
│   └── YYYY-MM-DD-<id>.md
└── tools/check.mjs    # deterministic pass-1 health check (schema + staleness)
```

Scratch files go in the repo's existing gitignored `.tmp/`, not `.dev/scratch/` — see
[decisions/2026-07-05-scratch-stays-in-tmp](decisions/2026-07-05-scratch-stays-in-tmp.md).

## Lifecycles

Every file is **living** (edited in place, always current: STATE, PLAN, FUTURE, ARCHITECTURE,
this README) or **append-only** (immutable entries — decisions and logs; supersede, never
rewrite). Structured data lives in **filenames and git**, not metadata: a decision's date/id
is its filename stem; a log's date/session is its filename; authorship is the git author.

## Frontmatter schema (complete — four keys, CI-enforced)

The health check rejects unknown keys, so the schema can only grow by amending this convention.
Each key exists for a named consumer.

| Key | Where | Meaning / consumer |
|-----|-------|--------------------|
| `verified: YYYY-MM-DD` | STATE.md (required); other living docs (optional) | freshness — health check flags staleness |
| `scope: repo \| org` | `decisions/*` (required) | `org` decisions feed the future knowledge vault |
| `superseded_by: null \| <stem>` | `decisions/*` (required) | status + link in one field; `null` = accepted |
| `promote: [ … ]` | `log/*` (optional) | cross-repo findings for the vault sweep |

**Promotion**: the vault sweep resolves a `promote:` item by appending `→ vault:<page>` to it.
An unresolved item past the policy window is a health-check finding (no silent failure).

## Conventions

1. **STATE.md is the entry point** — read it first; if `verified` is stale, discount and
   reconfirm. Keep it ≤1 page; overflow becomes a decision, a `promote:` item, or a deletion.
   Bump `verified` only after reconfirming its claims against the repo (not as a courtesy).
2. **PLAN.md is the only active plan.** When it completes, distill outcomes into `decisions/`
   and start fresh — completed plans are **deleted, not archived** (git holds the full text;
   the CHANGELOG records what shipped).
3. **FUTURE.md ideas graduate into PLAN.md** when scheduled; rejected ideas get a decision and
   are deleted.
4. **ARCHITECTURE.md holds open questions.** When one settles, remove it and add a `decisions/`
   file.
5. **decisions/ is append-only** — one file per settled decision, `YYYY-MM-DD-<slug>.md`,
   filed in the PR that makes the decision. Never edit a decision; supersede it by setting the
   old file's `superseded_by` to the new stem.
6. **log/ is append-only** at the entry level — write one on finishing a session (a few lines:
   what changed, refs, any `promote:` items). Whole resolved log files may be *deleted* by the
   sweep once distilled (deletion ≠ editing).
7. **`.dev/` is public** — no credentials, no sensitive governance detail, and keep unpatched
   security specifics vague until fixed.
8. **Absolute dates only** — these files outlive sessions.

## Health check

`node .dev/tools/check.mjs` (pass 1, deterministic, no deps). **Errors** (unknown/missing keys,
bad values, dangling `superseded_by`) are schema violations and block; **warnings** (stale
`verified`, oversized STATE.md, unresolved `promote:` items, no-signal logs) are advisory. Runs
in CI on `.dev/**` changes and weekly (`.github/workflows/dev-notes-check.yml`). An LLM pass-2
contradiction check is a planned follow-up.

For user-facing and contributor documentation, see [`docs/`](../docs/) and
[`CONTRIBUTING.md`](../CONTRIBUTING.md).
