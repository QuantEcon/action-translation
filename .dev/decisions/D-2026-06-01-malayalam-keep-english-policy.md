# Malayalam: keep-English-dominant policy

**Context**: en→ml is a low-resource generation cliff (issue #70: GPT-4 chrF 28.4 vs
specialist NMT ~66), and Malayalam-speaking economists read technical prose with English
terms embedded. Native reviewer: Adisankar Manoj Thanuja. Relevant to any future low-resource
language across QuantEcon translation repos. #promote

**Decision**: For `ml`, technical terms stay in English with Malayalam grammatical inflection
around them (`economy-യിലെ`, `bond-ന്റെ`); only everyday connective words are translated.
Policy carried by `language-config.ts` prompt rules; the per-term glossary `treatment` field
deferred (zero-schema-change v1).

**Consequences**: `ml.json` glossary pins most terms `ml == en`; calibration batch with the
native reviewer decides proper-names and parenthetical-first-use policy before PR #71 leaves
draft.

**Refs**: issue #70, PR #71.
