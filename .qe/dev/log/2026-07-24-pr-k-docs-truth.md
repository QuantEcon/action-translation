# 2026-07-24 — #168 (PR K): docs truth, one module map, 2.1 MB off the bundle

Wave 1's last PR. The durable moves, beyond the count refreshes:

- **Counts removed from prose, not refreshed.** README/docs-index/CONTRIBUTING/testing.md
  now say "run `npm test`"; the single hedged count lives in copilot-instructions. The
  drift mechanism was structural — the release checklist named 3 of 7 count-bearing files —
  so the fix is having fewer count-bearing files, not a better checklist.
- **One module map** (architecture.md), completed (+10 modules both maps had omitted,
  including the whole v0.22/v0.23 review contract) and locked by
  `docs-module-map.test.ts`: every non-test src file must appear in it by name.
  copilot-instructions' duplicate tree is now a pointer + two-line orientation.
- **src/cli/README.md is a pointer.** It documented a `resync` binary that never shipped
  and 1 of 8 commands; the evidence for deletion was that releases updated
  cli-reference.md and never this file.
- **Bundle**: `sourcesContent: false` (map 2.85 MB → 0.76 MB; run.cjs frame decoding
  re-verified live: src/inputs.ts:N still resolves) and the dist-action/glossary copies
  deleted — the runtime reads the checked-out repo's glossary/ via `__dirname/../glossary`,
  confirmed at all three call sites. architecture.md and glossary.md no longer teach the
  bundled-glossary model.
- Glossary counts now: zh-cn 357, fa 357, fr 364, ml 52 — consistent across glossary.md,
  glossary/README.md, docs/index.md (which disagreed with itself two ways), and the
  cli-reference sample transcript (which showed a console line v0.23.0 deleted).

Wave 1 is fully shipped once this merges. Next: tidy-up + Monday 2026-07-27 work plan
into Phase 2 (round-trip invariant reformulation first — boundaries record).
