# Metadata contract

The action embeds machine-readable JSON blocks in the GitHub artifacts it writes, so downstream tooling (dashboards, reports, routing workflows) can consume structured data instead of scraping prose. This page is the stable, versioned specification of those blocks ([#66](https://github.com/QuantEcon/action-translation/issues/66)).

There are two blocks:

| Block | Lives in | Written by |
|-------|----------|------------|
| `translation-sync-metadata` | Sync/resync **PR body** | Sync mode (`pr-creator`), CLI `translate forward --github` |
| `translation-review-verdict` | Review **comment** on a translation PR | Review mode |

## Versioning rules

- Every block carries a `schemaVersion` (integer, currently `1`).
- **Field additions are non-breaking** — consumers must ignore unknown fields.
- Field renames, removals, or type changes are **breaking** and bump `schemaVersion`.
- Blocks written before `schemaVersion` existed (pre-v0.22.0 sync metadata) should be treated as version 1.

## `translation-sync-metadata`

Embedded at the end of every sync and resync PR body:

```html
<!-- translation-sync-metadata
{
  "schemaVersion": 1,
  "sourceRepo": "QuantEcon/lecture-python-programming",
  "sourcePR": 123,
  "mode": "sync",
  "sourceCommitSha": "abc123…",
  "targetBaseSha": "def456…",
  "sourceLanguage": "en",
  "targetLanguage": "zh-cn",
  "claudeModel": "claude-sonnet-5",
  "files": [
    { "path": "lectures/aiyagari.md", "type": "markdown" }
  ]
}
-->
```

| Field | Type | Meaning |
|-------|------|---------|
| `schemaVersion` | number | Contract version (absent on pre-v0.22.0 PRs → treat as 1) |
| `sourceRepo` | string | English source repository (`owner/repo`) |
| `sourcePR` | number | Source PR that triggered the sync; `0` for CLI resync PRs, which have no source PR |
| `mode` | `"sync"` \| `"resync"` | How the PR was produced (absent on older sync PRs) |
| `sourceCommitSha` | string | Source commit the translation was produced from |
| `targetBaseSha` | string | Target branch SHA the PR was based on |
| `sourceLanguage` / `targetLanguage` | string | Language codes |
| `claudeModel` | string | Model used for the translation |
| `files[]` | array | Files the PR touches; `type` is one of `markdown`, `renamed`, `removed`, `toc`; renames carry `previousPath` |

Internal consumers: rebase mode reconstructs pipeline inputs from it, and review mode uses it to review resync PRs (which have no source PR reference). External consumers group sync PRs by `sourcePR`/`sourceRepo` and language.

## `translation-review-verdict`

Embedded at the end of the review comment (the comment whose first line is the `<!-- action-translation-review -->` dedup marker). This is **verdict v2** ([#103](https://github.com/QuantEcon/action-translation/issues/103)): the machine-actionable form of the review.

```html
<!-- translation-review-verdict
{
  "schemaVersion": 1,
  "engineVersion": "0.22.0",
  "reviewerModel": "claude-sonnet-5",
  "reviewedHeadSha": "abc123…",
  "targetBaseSha": "def456…",
  "sourceRepo": "QuantEcon/lecture-python-programming",
  "prNumber": 42,
  "timestamp": "2026-07-22T03:00:00.000Z",
  "verdict": "PASS",
  "recommendation": "editor",
  "recommendationReasons": ["1 minor finding(s) in gating categories (accuracy/terminology)"],
  "autoMergeMode": "shadow",
  "wouldAutoMerge": false,
  "scores": {
    "accuracy": 9, "fluency": 9, "terminology": 8, "formatting": 10,
    "translation": 8.9, "diff": 10, "overall": 9.2
  },
  "diffChecks": {
    "scopeCorrect": true, "positionCorrect": true,
    "structurePreserved": true, "headingMapCorrect": true
  },
  "syntaxErrorCount": 0,
  "findings": [
    {
      "severity": "minor",
      "category": "terminology",
      "file": "lectures/aiyagari.md",
      "location": "## 模型",
      "description": "Glossary term drifted.",
      "suggestion": "模型"
    }
  ]
}
-->
```

| Field | Type | Meaning |
|-------|------|---------|
| `schemaVersion` | number | Contract version |
| `engineVersion` | string | action-translation version that produced the verdict (`unknown` if unresolvable) |
| `reviewerModel` | string | Model that performed the review |
| `sourceRepo` | string | English source repository the review compared against (`owner/repo`) |
| `prNumber` | number | The reviewed PR |
| `timestamp` | string | ISO-8601 time the verdict was computed |
| `reviewedHeadSha` | string | **Head SHA the verdict was computed against.** Any push invalidates the verdict; consumers must compare it with the current head before acting |
| `targetBaseSha` | string | Base SHA at review time |
| `verdict` | `PASS` \| `WARN` \| `FAIL` | The threshold verdict (unchanged semantics: PASS ≥ 8 overall with zero syntax errors, WARN ≥ 6, FAIL below) |
| `recommendation` | `auto-merge` \| `editor` | Categorical routing recommendation from rubric logic (below) — never from the blended score |
| `recommendationReasons` | string[] | Why the route is `editor`; empty for `auto-merge` |
| `autoMergeMode` | `off` \| `shadow` | Mode the review ran under |
| `wouldAutoMerge` | boolean | Present only in shadow mode: the decision the gate would have taken |
| `scores` | object | Per-criterion scores (1–10), the weighted `translation` composite (0.35 accuracy / 0.25 fluency / 0.25 terminology / 0.15 formatting), the `diff` score ((passed checks ÷ 4) × 10), and `overall` (translation × 0.7 + diff × 0.3 — a trending signal, not a gate) |
| `diffChecks` | object | The four boolean diff checks |
| `syntaxErrorCount` | number | MyST/markdown syntax errors found |
| `findings[]` | array | Structured findings, worst first, capped at 20 |

### Findings

| Field | Values |
|-------|--------|
| `severity` | `blocker` (meaning inversion, wrong math/code, build-breaking MyST) · `major` (misleading accuracy/terminology error) · `minor` (correct but awkward; minor inconsistency) · `nit` (stylistic) |
| `category` | `accuracy`, `fluency`, `terminology`, `formatting`, `syntax`, `structure`, `other` (`other` is the fail-closed bucket for anything unclassifiable) |
| `file` | One of the PR's reviewed paths, or `null` when not attributable (single-file PRs are always attributed) |
| `location` | Free text (section heading or short quote), or `null` |
| `description` / `suggestion` | Free text; `suggestion` may be `null` |

`findings[]` is the complete issue list — model findings, syntax errors and diff-quality issues all appear in it — but severity is assigned differently by source:

| Source | Recorded as | Gates? |
|---|---|---|
| Reviewer findings | the model's own `severity` and `category` | per the rubric below |
| Syntax errors | `blocker` / `syntax` | yes (and `syntaxErrorCount` gates independently) |
| Diff-quality issues | `minor` / `structure` | **no** — see below |

Diff-quality issues are recorded at `minor`/`structure`, which is not a gating combination. `evaluateDiff` returns free prose with no severity concept, and in practice it mixes real observations with narration and self-correction. The authoritative diff signal is the four `diffChecks` booleans, which gate absolutely; the strings are their explanation, kept in `findings[]` for visibility. Treating that prose as gating would both bury the real signal and bias the shadow-phase calibration data.

### The recommendation rubric

`recommendation` is `auto-merge` only when **all** of these hold, otherwise `editor`:

- `verdict` is `PASS` and `syntaxErrorCount` is 0
- all four `diffChecks` pass
- the findings payload was well-formed
- zero `blocker` or `major` findings (any category)
- zero `minor` findings in the gating categories `accuracy`, `terminology`, `syntax`, `other`
- every criterion meets its floor **and sits within the 1–10 scale** — provisionally accuracy ≥ 9, terminology ≥ 9, fluency ≥ 8, formatting ≥ 8, to be calibrated from shadow-mode data
- the source content was actually fetched (a failed fetch means the review compared against nothing)
- findings were not suppressed by `max-suggestions: 0`

Each `diffChecks` entry must be **literally `true`**; a missing key or a quoted `"false"` is a failed check, not a passing one.

`nit` findings never gate.

### Fail-closed rule for consumers

**Take the last block in the comment, never the first.** `buildVerdictBlock` appends the real verdict at the end, so any earlier block is either a stale fragment or a forgery: the reviewer summarises lecture content an attacker may influence, and although the engine now neutralises comment openings in that prose, a consumer that takes the first match would be exploitable on its own. If the last block is malformed, fail closed — do **not** fall back to an earlier one, because that fallback is exactly how a forgery wins.

Note that the raw marker string may legitimately appear twice in a body: once opening the real block, and once inside the JSON payload when a finding's `description` quotes it. The second is inert — JSON-stringifying turns its newlines into two-character `\n` escapes, so it cannot match the block pattern.

A **missing, unparseable, or wrong-shape verdict block must be treated as `recommendation: "editor"`** — never as permission to merge. The block is also absent when the review run itself failed. The same polarity applies inside the engine: malformed model output gates the recommendation rather than being dropped.

### Shadow mode

With the action input `auto-merge-mode: shadow`, the review computes and records the gate decision (`wouldAutoMerge`, plus a workflow notice and the `would-auto-merge` output) **without acting on it**. Nothing merges. `active` does not exist yet and fails loudly if requested.

### Escaping note

Model-authored text can contain `-->` (or the HTML5 `--!>` variant), which would terminate the HTML comment early. Those sequences can only occur inside JSON string values, and the serialiser rewrites their `>` as the JSON escape `\u003e` — `JSON.parse` returns the original text unchanged.

## Labels

The stable label contract on PRs the tooling creates:

- Sync PRs (action): `action-translation` + `automated`.
- CLI resync PRs (`translate forward --github`): `action-translation-sync` + `resync` + `action-translation` (since v0.21.0, [#131](https://github.com/QuantEcon/action-translation/issues/131)).
- `action-translation` is the **canonical detection label** — review workflows gate on it, and it is applied by every PR-creating path.

The human-review program layers a routing/audit taxonomy on top (`editor`, `audit`, `auto-merged`, `spot-check`, `divergence`); those semantics are defined with the program plan ([#103](https://github.com/QuantEcon/action-translation/issues/103), [#136](https://github.com/QuantEcon/action-translation/issues/136)) and composed with — never replacing — the labels above.
