# Use Opus 4.8 for one-time bulk seeds; keep Sonnet 5 as the default

**Context**: `claude-sonnet-5` is the repo-wide default (PR #75) — the right call for
ongoing, high-volume PR-driven sync. Seeding a brand-new language repo
(`lecture-python-programming.fr`, 26 lectures) is a different shape: a one-time,
durable, human-reviewed artifact where per-file cost barely matters but
cross-file terminology consistency matters a lot (each file is an independent
API call, so the model's own consistency *is* the repo's consistency).

**Decision**: Use `--model claude-opus-4-8` for one-time bulk `init` seeds; leave
the default at Sonnet 5 for sync. Evidence — the same 5 programming lectures
translated to French by both models:
- **Opus: 0 cross-lecture terminology drift. Sonnet 5: 5.**
- Opus was **correct where Sonnet drifted**: `mutable` vs the incorrect `muable`.
- Cost: **1.66×** ($1.22 → $2.03 for 5 lectures; ~$6.3 → ~$10.4 for all 26) —
  trivial for a durable artifact, and better consistency cuts review burden.
- Output length was near-identical (8721 vs 8794 tokens etc.), so the delta is
  purely the price ratio, not more output.

**Consequences**: Seed with `translate init --model claude-opus-4-8 …`. No default
change, so ongoing sync is unaffected. Fewer drifting terms also means a leaner
glossary is sufficient. Note the evidence is n=5 lectures, one language.

**Refs**: `experiments/fr-glossary-programming/` (tooling + data); PR #78 (the 7
glossary terms this analysis produced); `D-2026-07-14-thinking-off-sonnet5.md`.
