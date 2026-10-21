# 2026-10-22 — #69 brought up to date, and the #337 rulings applied (ja glossary v1.2)

**Trigger**: #337 was decided on 2026-10-22, with H1, H2, H5 and C1 taken from both
translators' answers. #338 is the landing task. Matt asked for the work, a final review of
#69's comments, and a merge-ready comment once it is ready.

- **Merged `main` into `feat/glossary-ja`**, 49 commits behind, with the five conflicts #338
  listed: the decision record and the STATE line moved with `.dev/` → `.qe/dev/`, the CHANGELOG,
  the docs glossary table and the bundle's source map (rebuilt).
- **Applied the rulings**: `ja.json` v1.2 (five values), rules 1, 2 and 7 amended, rules 8 and 9
  added at the end so the rule numbers #337 cites still hold, and a Japanese code-comment
  example. Decision `D-2026-10-22-ja-house-style`; the 2026-09-01 record gets a
  partial-supersession note for its dataset clause.
- **Docs drift on `main`**: the glossary tables still said `ml` has 87 terms (v0.7.0). `ml.json`
  is v0.8.0 with 93, corrected alongside the Japanese row.
- **Not here**: the programming terms (#339) and the release (#340).
