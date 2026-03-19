---
title: action-translation
subtitle: Automated MyST Markdown translation using Claude AI
---

# action-translation

A GitHub Action and CLI toolkit for automatically translating and reviewing [MyST Markdown](https://mystmd.org) documents using Claude AI.

Built by [QuantEcon](https://quantecon.org) for managing multilingual lecture sites.

## What it does

**action-translation** keeps translated repositories in sync with an English source. When content changes in the source, the system detects which sections changed and translates only those sections — preserving existing translations, technical formatting, and translator style.

The system has two main components:

**GitHub Action** — Runs automatically in your CI/CD pipeline:
- **Sync mode**: Watches for merged PRs in the source repo, translates changed sections, and creates translation PRs in the target repo
- **Review mode**: Posts AI-powered quality reviews on translation PRs with scores and suggestions

**CLI tool (`translate`)** — Runs locally for analysis and recovery:
- **`status`**: Quick structural diagnostic — no LLM calls, shows which files are in sync, outdated, or missing
- **`backward`**: Discovers improvements in translations worth backporting to the English source
- **`review`**: Interactive walk-through of backward suggestions with GitHub Issue creation
- **`forward`**: Resyncs drifted translations to match current source content
- **`init`**: Bulk-translates an entire project from scratch
- **`setup`**: Scaffolds a new target translation repository
- **`doctor`**: Checks health of a target translation repository
- **`headingmap`**: Generates heading-maps by comparing source/target headings (no LLM)

## Key features

- **Section-based translation** — Only changed sections are re-translated, not entire documents
- **Heading-map system** — Robust cross-language section matching via explicit ID mapping in frontmatter
- **Translation glossary** — 357-term glossaries (zh-cn, fa) for consistent technical terminology
- **MyST Markdown aware** — Preserves code blocks, math equations, directives, and cross-references
- **Language-extensible** — Configurable rules per target language (punctuation, typography)
- **Multiple translation modes** — UPDATE (incremental), NEW (fresh), RESYNC (drift recovery)

## Documentation

::::{grid} 1 2 2 2
:gutter: 3

:::{card} User Guide
:link: user/quickstart.md

Get started with the GitHub Action and CLI tool. Configuration reference, usage examples, and troubleshooting.
:::

:::{card} Developer Guide
:link: developer/architecture.md

System architecture, module design, testing guide, and development roadmap for contributors.
:::
::::

## Tutorials

Step-by-step guides for common scenarios:

| Tutorial | Scenario |
|----------|----------|
| [Fresh Setup](user/tutorials/fresh-setup.md) | Create a new translation project from scratch |
| [Connect Existing Target](user/tutorials/connect-existing.md) | Add action-translation to a repo that was already translated |
| [Resync Drifted Target](user/tutorials/resync-drifted.md) | Catch up when translations fall behind the source |
| [Backward Analysis & Review](user/tutorials/backward-review.md) | Find improvements in translations worth backporting to the source |
| [Adding a New Language](user/tutorials/add-language.md) | Extend to a new target language (glossary, config, workflows) |
| [Automated Maintenance](user/tutorials/automated-maintenance.md) | Set up scheduled status checks and backward analysis |

## Quick links

| Resource | Description |
|----------|-------------|
| [Quick Start](user/quickstart.md) | Set up the Action in 10 minutes |
| [Action Reference](user/action-reference.md) | All GitHub Action inputs and outputs |
| [CLI Reference](user/cli-reference.md) | `status`, `backward`, `review`, `forward`, `init`, `setup`, `doctor`, `headingmap` commands |
| [Architecture](developer/architecture.md) | System design and module map |
| [GitHub Repository](https://github.com/QuantEcon/action-translation) | Source code and issue tracker |

## Current status

**Version**: v0.8.0  
**Tests**: 873 (39 suites)  
**Glossary**: 357 terms (zh-cn, fa)  
**Languages**: English → Simplified Chinese, Farsi (more planned)
