# Japanese: standard term where one exists, English otherwise, if in doubt English

**Context**: The Japanese glossary (PR #69) was machine-drafted in June 2026 and put to
native-speaker review. Four reviewers converged between 2026-07-29 and 2026-08-18 — a
whole-glossary pass by Chihiro2000GitHub (native speaker), confirmations by sayaikegawa
and xuanguang-li, policy rulings by jstac. Their reasoning: Japanese undergraduates read
Japanese sentences with English technical words comfortably (value function, Bellman
equation, per Abe's Hitotsubashi DP notes), so a forced Japanese rendering costs more in
naturalness than it gains; but a well-known standard term (予算制約, 行列, 均衡) is more
familiar than the English and must be used. Relevant to every future language that sits
between the full-translation pattern (`zh-cn`, `fa`, `fr`) and keep-English-dominant
(`ml`). #promote

**Decision**: For `ja`, use the Japanese term only where a well-known, standard Japanese
counterpart exists; otherwise keep the English term in Latin script — *if in doubt, keep
English*. Where only the generic head noun has a Japanese equivalent, keep the proper-name
part English and translate the head noun (`lake モデル`, `cost-to-go 関数`). All personal
names stay in Latin script — no katakana transliteration and no guessed kanji, Japanese and
Chinese researchers included (jstac's own name is the counter-example: the model's guess
スタチャースキー vs the form he actually uses, スタハースキー). Compound names join with ・,
never ＝. Abbreviations expand on first use to the full Japanese term with the English
acronym in full-width parentheses (国内総生産（GDP）). Named datasets and surveys keep their
English name (FRED, Survey of Consumer Finances — 消費者金融調査 means the consumer-lending
industry). Policy carried both in `glossary/ja.json` (v1.1, every name `ja == en`) and as
seven `ja` prompt rules in `language-config.ts`, so the two pull the same way on terms the
glossary does not cover.

**Consequences**: 72 glossary edits applied to the v1.0 draft (42 names, 6 English
reversions, 14 term corrections, 5 resolved questions, 2 ・ joins, 2 Wikipedia cross-check
adoptions); tests pin the name and ・ invariants. Deliberately *not* changed: input-output
model stays 産業連関モデル (Wikipedia's 産業連関表 is the table, not the model); market
clearing stays 市場清算 (市場均衡 would collide with equilibrium → 均衡). Open follow-up
(jstac 2026-08-17/19): a first-pass automation — cross-check candidate terms against
Japanese Wikipedia, revert to English if still unsure, flag for native review — is a
separate issue, not part of #69.

**Refs**: PR #69 (thread 2026-07-29 → 2026-08-19), xuanguang-li's Wikipedia cross-check
(268/357 found, 3 differences), `D-2026-06-01-malayalam-keep-english-policy` for the
adjacent keep-English-dominant ruling.
