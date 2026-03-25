---
title: Heading Maps
---

# Heading Maps

Heading maps are the mechanism that allows **action-translation** to reliably match sections across languages. They live in the YAML frontmatter of each translated document and map English section IDs to translated headings.

## The problem

When translating `## Introduction` to Chinese, the heading becomes `## 介绍`. But the system needs to know that these are the *same section* — so that when the English "Introduction" changes, the correct Chinese section gets updated.

Position-based matching (section 1 maps to section 1, etc.) works as a fallback, but breaks when sections are added, removed, or reordered.

## How heading maps work

Each translated document contains a `translation` block in its YAML frontmatter:

```yaml
---
title: 蛛网模型
translation:
  title: 蛛网模型
  headings:
    overview: "概述"
    equilibrium: "均衡"
    exercises: "练习"
---
```

The `translation.title` field stores the translated document title. The `translation.headings` is a flat map where **keys** are the English section IDs (the heading text lowercased and hyphenated, as MyST would generate) and **values** are the translated heading text as it appears in the target document.

:::{note}
Legacy documents may use the older `heading-map:` format (a flat key-value block without `translation:` wrapper). The system reads both formats but always writes the new `translation:` format. Legacy documents are automatically migrated on next sync or headingmap rebuild.
:::

When the action needs to match sections, it:
1. Parses the English document to find section headings and generate IDs
2. Looks up each ID in the heading-map to find the corresponding translated heading
3. Uses heading-map matches first, falls back to position matching for any unmatched sections

## Format rules

- **Flat structure** — the map is a single-level key-value mapping, regardless of heading depth
- **All heading levels** — includes `##`, `###`, `####`, etc.
- **ID generation** — keys follow MyST's ID rules: lowercase, spaces become hyphens, punctuation removed
- **Auto-populated** — the heading-map is created automatically on first translation and updated whenever sections change

**Example with nested headings:**

English source:
```markdown
## Model Description
### Assumptions
### Equilibrium Conditions
## Numerical Examples
```

Target translation metadata:
```yaml
translation:
  headings:
    model-description: "模型描述"
    assumptions: "假设"
    equilibrium-conditions: "均衡条件"
    numerical-examples: "数值示例"
```

## When heading maps are created

- **New file translation** (NEW mode): The action generates the translation metadata from the translated headings and title, and injects it into the target frontmatter
- **Section update** (UPDATE mode): If a heading is translated differently, the translation metadata is updated to reflect the new translation
- **Forward resync** (RESYNC mode): The translation metadata is preserved from the existing target document

## When to edit manually

You generally don't need to edit heading maps by hand. However, manual editing is useful when:

- **Correcting a heading translation** — If you change a heading in the translated document, update the corresponding `translation.headings` value to match
- **Resolving a mismatch** — If the action can't match a section (e.g., after manual restructuring), you may need to update the map
- **Onboarding an existing translation** — If you're adding translation metadata to a document that was translated before the action was used

**Important:** The `translation.headings` values must exactly match the heading text in the document. If you change a heading, update both the heading text and the map entry.

## Missing heading maps

If a target document has no translation metadata, the action falls back to **position-based matching** — section 1 in English maps to section 1 in the translation. This works when both documents have the same number of sections in the same order, but is fragile.

**Safety guard:** Position-based fallback is only used when the source and target have the **same number of sections**. When section counts differ (e.g., a new section was added to the source but the translation PR hasn't been merged yet), positions are shifted and the fallback is disabled. Unmatched sections are treated as new and translated from scratch.

The `status` CLI command reports files with missing heading maps as `MISSING_HEADINGMAP`.

## ID generation rules

The heading-map key is generated from the English heading text:

| English heading | Generated ID |
|----------------|-------------|
| `## Introduction` | `introduction` |
| `## Model Description` | `model-description` |
| `## Equilibrium Conditions` | `equilibrium-conditions` |
| `### The Bellman Equation` | `the-bellman-equation` |
| `## Exercise 1.1` | `exercise-11` |

Special characters are removed, spaces become hyphens, everything is lowercased.
