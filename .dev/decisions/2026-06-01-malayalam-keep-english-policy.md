---
scope: org
superseded_by: null
---

# Malayalam: keep-English-dominant policy

**Decision**: For `ml`, technical terms stay in English with Malayalam grammatical inflection
around them (`economy-യിലെ`, `bond-ന്റെ`); only everyday connective words are translated.
Policy carried by `language-config.ts` prompt rules; the per-term glossary `treatment` field
was deferred (zero-schema-change v1).

**Why**: Native-reviewer (Adisankar Manoj Thanuja) guidance; en→ml is a low-resource
generation cliff and English-dominant text matches how Malayalam-speaking economists read.

**Refs**: issue #70, PR #71.
