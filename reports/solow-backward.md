# Backward Analysis: solow.md

**Generated**: 2026-03-03T05:19:22.731Z
**SOURCE last modified**: 2025-12-23 by Matt McKay
**TARGET last modified**: 2025-03-26 by zzzzdf

## Commit Timeline

```
Source has 15 commits, Target has 8 commits.
Estimated sync point (earliest TARGET commit): 2024-07-22
SOURCE has 3 commit(s) AFTER the translation was created.

Commit history (newest first):
  2025-12-23  SOURCE  059e0f40  Fix SymPy OverflowError in solow.md by using Rational (#687)
  2025-03-26  TARGET  ea773d5  [solow] Translation update (#181)
  2025-02-24  TARGET  ab7f62f  [FIX] Fix SyntaxWarnings from `matplotlib` raw string (#150)
  2025-01-21  SOURCE  6cc6c4bc  [FIX] Fix string warnings (#566)
  2024-10-11  TARGET  18d9991  update scalar dynam and solow (#96)
  2024-10-10  TARGET  6964bf3  [bug] Fix obvious bugs across all lectures (#95)
  2024-09-27  TARGET  829b5a5  [solow] Translation (#39)
  2024-09-16  TARGET  3e976ef  Initialise repo with Latest English Language Versions + Clean Up (#26)
  2024-09-12  TARGET  8b97f8a  setup lectures folder for cn language lectures
  2024-07-26  SOURCE  f5f71615  [solow] Update unfinished suggestions (#511)
  2024-07-22  TARGET  4ad4a93  upload lecture and prepare translation
  2024-04-27  SOURCE  689cb068  [Solow] Update context
  2024-04-22  SOURCE  8cb45a16  [solow] Update internal links
  2024-04-22  SOURCE  2cb3ac3d  [solow] Update editorial suggestions
  2024-02-12  SOURCE  8f060459  Update solow.md (#332)
  2023-06-13  SOURCE  f5c8fdb4  Make all titles and headings in line with manual
  2023-04-28  SOURCE  b59c8b9d  ENH: Set a default image size across all lectures (#165)
  2023-03-13  SOURCE  337beaa1  Fix a few typos
  2023-03-05  SOURCE  969c7b55  Add k simulation
  2023-02-08  SOURCE  cd499efb  fix an error
  ... and 3 older commits
```

## Stage 1: Document Triage

**Verdict**: CHANGES_DETECTED
**Notes**: The TARGET translation contains a substantive code change: uses `Rational` from sympy for exact symbolic computation in Exercise 1 solution, while SOURCE (after 2025-12-23 commit) also uses `Rational` but TARGET predates this fix. Additionally, TARGET uses different variable names (alpha, delta, sig, mu) vs SOURCE (α, δ, σ, μ) throughout the code, representing a systematic code improvement for Python compatibility that goes beyond simple i18n changes.

## Stage 2: Section Analysis

No backport suggestions found after detailed section analysis.
