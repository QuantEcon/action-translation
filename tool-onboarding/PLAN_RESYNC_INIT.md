# ONBOARD & SYNC: Project Roadmap

**Document Status**: ONBOARD implementation in progress  
**Last Updated**: December 2025  
**Related**: [tool-onboarding/PLAN.md](tool-onboarding/PLAN.md) for implementation details

---

## Overview

This document outlines the **high-level project roadmap** for translation synchronization:

1. **ONBOARD** - One-time alignment of existing SOURCE → TARGET repos
2. **SYNC** - Ongoing PR-based translation synchronization (implemented in v0.7.0)
3. **RESYNC** - Recovery from drift when repos fall out of sync (future)

For implementation details and current tool status, see [tool-onboarding/PLAN.md](tool-onboarding/PLAN.md).

---

## Core Philosophy

**SOURCE is truth.** The English source repository is authoritative. TARGET repos receive translations derived from SOURCE. This simplifies all workflows:

- SOURCE changes → TARGET updates (one-way sync)
- Structure mismatches → Realign TARGET to match SOURCE
- Quality issues → Retranslate from SOURCE

**Exception: TARGET Improvements.** During ONBOARD, if TARGET contains improvements not in SOURCE (e.g., bug fixes, clarifications, additional examples), we capture these as **SUGGESTIONS** for potential backport to SOURCE.

---

## Project Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PROJECT LIFECYCLE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    INITIALIZATION                                 │   │
│  │                                                                   │   │
│  │   Path A: New Project              Path B: Existing Project       │   │
│  │   ┌─────────────────────┐         ┌─────────────────────┐        │   │
│  │   │       BULK          │         │      ONBOARD        │        │   │
│  │   │  - Fresh translation │         │  - Assess alignment │        │   │
│  │   │  - Generate maps    │         │  - Generate maps    │        │   │
│  │   │  - Add tracking     │         │  - Add tracking     │        │   │
│  │   └─────────┬───────────┘         └─────────┬───────────┘        │   │
│  │             │                               │                     │   │
│  │             └───────────────┬───────────────┘                     │   │
│  │                             ▼                                     │   │
│  └─────────────────────────────┼─────────────────────────────────────┘   │
│                                │                                         │
│  ┌─────────────────────────────▼─────────────────────────────────────┐   │
│  │                      STEADY STATE                                  │   │
│  │                                                                    │   │
│  │   ┌─────────────────────────────────────────────────────────────┐ │   │
│  │   │                        SYNC                                  │ │   │
│  │   │   PR merged to SOURCE → Translation PR to TARGET             │ │   │
│  │   │   - Incremental updates (UPDATE mode)                        │ │   │
│  │   │   - Section-level precision                                  │ │   │
│  │   │   - Auto-updates source-commit tracking                      │ │   │
│  │   └─────────────────────────────────────────────────────────────┘ │   │
│  │                             │                                      │   │
│  │                             │ drift detected                       │   │
│  │                             ▼                                      │   │
│  └─────────────────────────────┼──────────────────────────────────────┘   │
│                                │                                         │
│  ┌─────────────────────────────▼─────────────────────────────────────┐   │
│  │                     DRIFT RECOVERY                                 │   │
│  │                                                                    │   │
│  │   ┌─────────────────────────────────────────────────────────────┐ │   │
│  │   │                      RESYNC                                  │ │   │
│  │   │   - Re-translate changed sections from SOURCE                │ │   │
│  │   │   - Update source-commit tracking                            │ │   │
│  │   │   - Restore alignment                                        │ │   │
│  │   └─────────────────────────────────────────────────────────────┘ │   │
│  │                             │                                      │   │
│  │                             │ back to steady state                 │   │
│  │                             ▼                                      │   │
│  └─────────────────────────────┴──────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## ONBOARD Workflow (In Progress)

**Tool**: `tool-onboarding/` CLI

ONBOARD prepares existing translation repositories for the SYNC workflow by:

1. **Assessing alignment** - Compare SOURCE and TARGET structure/content
2. **Generating heading-maps** - Enable section-level matching
3. **Categorizing files** - Determine action needed per file

### File Categories

| Category | Description | Action |
|----------|-------------|--------|
| ✅ Aligned | Structure matches, ready for sync | Add tracking metadata |
| 📋 Review | Drift detected, needs decision | Review direction (sync/backport) |
| 📄 Translate | Source only, missing translation | Run bulk translator |
| 🎯 Suggest | Target only, consider for source | Review for backport |

See [tool-onboarding/README.md](tool-onboarding/README.md) for usage.

---

## SYNC Workflow (Implemented)

**Tool**: `action-translation` GitHub Action (v0.7.0+)

SYNC maintains alignment after ONBOARD by processing PRs:

```
PR merged to SOURCE
       │
       ▼
GitHub Action triggers
       │
       ▼
Detect changed .md files
       │
       ▼
For each file:
├── Parse sections
├── Compare to TARGET
├── Translate changes (UPDATE mode)
└── Update heading-map
       │
       ▼
Create translation PR to TARGET
```

**Key Features**:
- Section-level incremental translation
- Preserves existing translations
- Auto-updates heading-maps
- Cost-efficient (only translate changes)

---

## RESYNC Workflow (Future)

**Status**: Planned

RESYNC recovers from drift when SYNC is interrupted or repos diverge:

### When to Use

- SYNC was disabled for a period
- Manual edits created divergence
- Bulk update from upstream changes

### Planned Process

```
┌─────────────────────────────────────────────────────────────┐
│                    RESYNC Process                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. DETECT STALENESS                                         │
│     └── Compare source-commit to current SOURCE HEAD         │
│     └── Identify sections changed in SOURCE                  │
│                                                              │
│  2. TRANSLATE CHANGES                                        │
│     └── Use UPDATE mode for changed sections                 │
│     └── Preserve unchanged translations                      │
│                                                              │
│  3. UPDATE TRACKING                                          │
│     └── Update source-commit to current HEAD                 │
│     └── Update synced-at timestamp                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## source-commit Tracking (Future)

### Design

Every TARGET file will track its SOURCE state:

```yaml
---
translation:
  source-repo: lecture-python-intro      # SOURCE repo name
  source-file: lectures/cobweb.md        # Path in SOURCE
  source-commit: abc123def456789         # Commit SHA translated from
  synced-at: 2024-12-18T10:00:00Z        # Timestamp of translation
heading-map:
  overview: 概述
  the-model: 模型
---
```

### Benefits

1. **Staleness detection** - Know exactly which files need RESYNC
2. **Audit trail** - Track translation provenance
3. **Efficient updates** - Only translate sections changed since source-commit

### Integration Plan

| Tool | Change |
|------|--------|
| BULK | Add source-commit when creating translations |
| SYNC | Update source-commit when processing PRs |
| ONBOARD | Initialize source-commit for existing files |
| RESYNC | Query and update source-commit |

---

## Component Reuse

| Component | BULK | SYNC | ONBOARD | RESYNC |
|-----------|------|------|---------|--------|
| parser.ts | ✅ | ✅ | ✅ | ✅ |
| diff-detector.ts | - | ✅ | ✅ | ✅ |
| translator.ts | ✅ NEW | ✅ UPDATE | - | ✅ UPDATE |
| heading-map.ts | ✅ | ✅ | ✅ | ✅ |
| file-processor.ts | ✅ | ✅ | - | ✅ |

---

## Glossary

| Term | Definition |
|------|------------|
| **SOURCE** | English source repository (authoritative) |
| **TARGET** | Translated repository (receives updates from SOURCE) |
| **BULK** | Full translation of new content |
| **SYNC** | PR-based incremental translation (steady state) |
| **ONBOARD** | One-time comprehensive alignment process |
| **RESYNC** | Update stale sections from current SOURCE |
| **heading-map** | Frontmatter mapping English IDs to translated headings |
| **source-commit** | Git commit SHA in SOURCE that TARGET was translated from |

---

**Document Maintainer**: QuantEcon Team  
**Related Documents**:
- [tool-onboarding/PLAN.md](tool-onboarding/PLAN.md) - Implementation details
- [tool-onboarding/README.md](tool-onboarding/README.md) - Tool usage
- [docs/PLAN-FUTURE-FEATURES.md](docs/PLAN-FUTURE-FEATURES.md) - Other future features
