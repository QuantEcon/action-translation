---
title: Roadmap
---

# Roadmap

Future features under consideration. Items here are **not committed** — they represent design thinking and possible directions.

For completed work, see the [Changelog](../CHANGELOG.md).

## Multi-language hub-spoke documentation

**Priority**: High | **Effort**: Low

The hub-spoke architecture is already implemented — each language syncs independently from the English hub. What's missing is a comprehensive setup guide for onboarding new languages.

**Deliverable**: Step-by-step guide covering:
1. Create target repository (`{repo}.{lang-code}`)
2. Bootstrap initial translations (bulk translator or forward CLI)
3. Add sync workflow file (from template)
4. Create language glossary (`glossary/{lang-code}.json`)
5. Configure review workflow in target repo

**Also needed**: Workflow YAML templates that users can copy directly.

## i18n code annotation convention

**Priority**: Medium | **Effort**: Low–Medium

Translated documents often contain extra code in code cells for localisation (e.g., Chinese font configuration for matplotlib). The LLM sometimes removes this code during RESYNC despite prompt rules telling it not to.

**Proposal**: Adopt an `# i18n` comment convention:

```python
from matplotlib import font_manager  # i18n
fontP = font_manager.FontProperties()  # i18n
fontP.set_family('SimHei')  # i18n
```

**Implementation phases:**
1. **Convention & documentation** — Define the standard, document common patterns per language
2. **Pre-extraction / re-injection** — Before sending to LLM, extract `# i18n` lines; after receiving output, verify they're preserved and re-inject if missing
3. **Retroactive annotation** — Script to auto-detect likely i18n code patterns and add `# i18n` markers to existing translations

This gives deterministic protection instead of relying on LLM compliance.

## Upstream suggestion workflow

**Priority**: Medium–Low | **Effort**: Medium

Enable translators to suggest improvements to the English source. Currently sync is unidirectional (English → translations). Valuable fixes discovered during translation have no formal path back.

**Design**: Not automatic bidirectional sync. A **suggestion workflow** where:
1. Translator adds `suggest-upstream` label to a translation PR
2. Action parses structured suggestions from PR description
3. Creates a suggestion PR in the English source repo
4. Links the two PRs for tracking

**Phases:**
1. Manual workflow with issue templates (no automation)
2. Label-triggered suggestion PR creation (`mode: suggest`)
3. AI-assisted extraction from freeform translator comments

## Cross-language consistency checking

**Priority**: Low | **Effort**: Medium

Validate that technical terms are translated consistently across all target languages. Uses glossary files as the ground truth.

```
Term: "utility function"
├── zh-cn: "效用函数" ✓
├── fa: "تابع مطلوبیت" ✓
└── es: "función de utilidad" ✓
```

## Translation status dashboard

**Priority**: Low | **Effort**: Medium

A central view showing translation progress across all languages and files — which files are synced, which are behind, which have structural mismatches. Could be generated as a GitHub Pages site or a badge.

## Benchmark project

The **Translation Quality Benchmark Tool** is tracked as a separate project:

**Goal**: Use human translations from `lecture-intro` (Xiamen University RA Group) to benchmark and improve AI translation quality.

**Scope**: Gold-standard EN-ZH dataset, multi-model benchmarking (Claude, GPT, Gemini), GitHub Pages dashboard.

See [PROJECT-BENCHMARK.md](projects/PROJECT-BENCHMARK.md) for the full plan.
