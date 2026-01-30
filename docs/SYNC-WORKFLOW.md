# Sync Workflow Guide

**Last Updated**: January 2026  
**Version**: 1.0

This document describes the complete translation synchronization workflow, including all modes of operation and when to use each.

---

## Overview

The `action-translation` project maintains alignment between SOURCE (English) and TARGET (translation) repositories through multiple complementary modes:

| Mode | Direction | Trigger | Purpose |
|------|-----------|---------|---------|
| **PR Diff** | SOURCE → TARGET | Automated (PR merge) | Keep translations current |
| **Review** | Evaluates TARGET | Automated (PR open) | Quality assurance |
| **Backport** | TARGET → SOURCE | Manual/scheduled | Capture improvements |
| **Status** | Diagnostic | Manual | Detect drift |
| **Forward Sync** | SOURCE → TARGET | Manual | Onboarding/resync |
| **Bulk Translate** | SOURCE → TARGET | Manual (one-time) | Bootstrap new language |

---

## The Sync Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSLATION SYNC LIFECYCLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PHASE 1: ONBOARDING (one-time per project)                         │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  Path A: New Translation (no existing translation)                  │    │
│  │    └── bulk-translator creates initial translation + heading-maps   │    │
│  │    └── Enable PR Diff mode                                          │    │
│  │                                                                      │    │
│  │  Path B: Existing Translation (manual work exists)                  │    │
│  │    └── resync status → assess alignment                             │    │
│  │    └── resync backport → find improvements worth keeping            │    │
│  │    └── Human review: accept backports into SOURCE                   │    │
│  │    └── resync sync → align TARGET with SOURCE + add heading-maps    │    │
│  │    └── Enable PR Diff mode                                          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PHASE 2: STEADY STATE (ongoing, automated)                         │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  PR Diff Mode (action-translation sync)                             │    │
│  │    Trigger: PR merged to SOURCE main branch                         │    │
│  │    Action: Create translation PR in TARGET                          │    │
│  │    Status: ✅ IMPLEMENTED                                           │    │
│  │                                                                      │    │
│  │  Review Mode (action-translation review)                            │    │
│  │    Trigger: Translation PR opened in TARGET                         │    │
│  │    Action: AI quality review comment                                │    │
│  │    Status: ✅ IMPLEMENTED                                           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PHASE 3: MAINTENANCE (periodic, manual trigger)                    │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │                                                                      │    │
│  │  Backport Analysis                                                  │    │
│  │    Trigger: Monthly schedule or manual                              │    │
│  │    Action: Find TARGET improvements to suggest for SOURCE           │    │
│  │    Status: 📋 PLANNED (resync backport)                             │    │
│  │                                                                      │    │
│  │  Drift Detection & Resync                                           │    │
│  │    Trigger: Manual when drift suspected                             │    │
│  │    Action: Detect and fix alignment issues                          │    │
│  │    Status: 📋 PLANNED (resync status, resync sync)                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Mode Details

### 1. PR Diff Mode (Automated)

**Tool**: `action-translation` GitHub Action (sync mode)  
**Direction**: SOURCE → TARGET  
**Trigger**: PR merged to SOURCE `main` branch  
**Status**: ✅ Implemented

**What it does**:
- Detects files changed in the merged PR
- Parses sections using heading-maps for cross-language matching
- Translates only changed sections (incremental)
- Creates PR in TARGET repository with translations

**Prerequisites**:
- TARGET has heading-maps in frontmatter
- Repositories are structurally aligned (same sections)

**When it works well**:
- Steady-state operation after onboarding
- SOURCE and TARGET are aligned
- Changes flow through PRs (not direct commits)

### 2. Review Mode (Automated)

**Tool**: `action-translation` GitHub Action (review mode)  
**Direction**: Evaluates TARGET  
**Trigger**: Translation PR opened in TARGET  
**Status**: ✅ Implemented

**What it does**:
- Evaluates translation quality (accuracy, fluency, terminology)
- Checks diff correctness (changes in right locations)
- Posts review comment with scores and suggestions

**Prerequisites**:
- Translation PR exists in TARGET
- PR body references source PR number

### 3. Backport Mode (Manual)

**Tool**: `resync backport` CLI  
**Direction**: TARGET → SOURCE (suggestions only)  
**Trigger**: Manual or scheduled  
**Status**: 📋 Planned

**What it does**:
- Compares TARGET sections with SOURCE
- Uses LLM to identify improvements worth backporting
- Generates report with confidence scores
- Does NOT automatically modify SOURCE

**Use cases**:
- Monthly maintenance check
- Before major resync (preserve valuable work)
- After significant translation effort

**Output**: Markdown report with backport suggestions

### 4. Status Mode (Diagnostic)

**Tool**: `resync status` CLI  
**Direction**: Diagnostic (no changes)  
**Trigger**: Manual  
**Status**: 📋 Planned

**What it does**:
- Quick alignment check (no LLM calls)
- Detects missing heading-maps
- Identifies structural differences
- Reports sync status per file

**Use cases**:
- Quick health check
- Before enabling PR Diff mode
- After suspected drift

**Output**: Summary table of alignment status

### 5. Forward Sync Mode (Manual)

**Tool**: `resync sync` CLI  
**Direction**: SOURCE → TARGET  
**Trigger**: Manual  
**Status**: 📋 Planned

**What it does**:
- Translates changed sections from SOURCE
- Adds/updates heading-maps
- Aligns TARGET structure with SOURCE

**Use cases**:
- Onboarding existing translations
- Fixing drift after direct commits
- Recovering from structural divergence

**⚠️ Warning**: Run `resync backport` FIRST to avoid losing valuable translation improvements.

### 6. Bulk Translate Mode (One-time)

**Tool**: `tool-bulk-translator`  
**Direction**: SOURCE → TARGET  
**Trigger**: Manual (one-time)  
**Status**: ✅ Implemented

**What it does**:
- Translates entire lecture series
- Creates heading-maps for all files
- Preserves Jupyter Book structure

**Use cases**:
- Bootstrap new language repository
- One-time initial translation

---

## Critical: Order of Operations

### ⚠️ Onboarding Existing Translations

When onboarding a repository with existing manual translations, **order matters**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ❌ WRONG ORDER (loses valuable translation work)                       │
│  ─────────────────────────────────────────────────────────────────────  │
│  1. resync sync → Overwrites TARGET with SOURCE                         │
│  2. resync backport → Nothing to find (already overwritten)             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  ✅ RIGHT ORDER (preserves valuable translation work)                   │
│  ─────────────────────────────────────────────────────────────────────  │
│  1. resync status → Understand current state                            │
│  2. resync backport → Find improvements BEFORE overwriting              │
│  3. Human review → Accept good suggestions into SOURCE                  │
│  4. resync sync → Now safe to sync (improvements preserved in SOURCE)   │
│  5. Enable PR Diff → Automated sync going forward                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why This Order?

The goal is to **preserve valuable work** while establishing SOURCE as the single source of truth:

1. **Status first** - Know what you're dealing with
2. **Backport before sync** - Extract value from TARGET before overwriting
3. **Human review** - Only accept genuine improvements (not translation-only changes)
4. **Sync after backport** - Safe because improvements are now in SOURCE
5. **Enable automation** - PR Diff keeps everything aligned going forward

---

## Handling Common Scenarios

### Scenario 1: New Language (No Existing Translation)

```bash
# 1. Use bulk-translator to create initial translation
cd tool-bulk-translator
npm run translate -- \
  --source ~/repos/lecture-python \
  --target ~/repos/lecture-python.zh-cn \
  --language zh-cn

# 2. Enable PR Diff mode in TARGET repo
# Add workflow file: .github/workflows/translation-sync.yml
```

### Scenario 2: Existing Manual Translation

```bash
# 1. Check current alignment
npx resync status \
  --source ~/repos/lecture-python \
  --target ~/repos/lecture-python.zh-cn

# 2. Find valuable improvements (BEFORE sync!)
npx resync backport \
  --source ~/repos/lecture-python \
  --target ~/repos/lecture-python.zh-cn \
  --output reports/backport-suggestions.md

# 3. Review report, create PRs for accepted backports
# ... human review process ...

# 4. After backports merged to SOURCE, sync TARGET
npx resync sync \
  --source ~/repos/lecture-python \
  --target ~/repos/lecture-python.zh-cn

# 5. Enable PR Diff mode
```

### Scenario 3: Drift Detected (Direct Commits)

```bash
# 1. Check what's out of sync
npx resync status \
  --source ~/repos/lecture-python \
  --target ~/repos/lecture-python.zh-cn

# 2. If TARGET has improvements, backport first
npx resync backport \
  --source ~/repos/lecture-python \
  --target ~/repos/lecture-python.zh-cn

# 3. After review, resync
npx resync sync \
  --source ~/repos/lecture-python \
  --target ~/repos/lecture-python.zh-cn
```

### Scenario 4: Monthly Maintenance

```bash
# Scheduled check for backport candidates
npx resync backport \
  --source ~/repos/lecture-python \
  --target ~/repos/lecture-python.zh-cn \
  --output reports/monthly-$(date +%Y-%m).md
```

---

## What Can Go Wrong?

| Scenario | Problem | Detection | Fix |
|----------|---------|-----------|-----|
| Direct commit to SOURCE | TARGET misses change | `resync status` | `resync sync` |
| Direct commit to TARGET | Drift from SOURCE | `resync status` | `resync backport` then `resync sync` |
| Missing heading-map | PR Diff can't match sections | `resync status` | `resync sync` adds heading-maps |
| Structural divergence | Different section count | `resync status` | Manual alignment then `resync sync` |
| Translation has improvements | Lost on next sync | `resync backport` | Accept into SOURCE first |

---

## Best Practices

### For Project Maintainers

1. **Always use PRs** - Avoid direct commits to `main` in both repos
2. **Run monthly backport checks** - Capture valuable translation improvements
3. **Review before sync** - Don't blindly overwrite translation work
4. **Monitor PR Diff failures** - May indicate structural drift

### For Translators

1. **Use translation PRs** - Enables review mode quality checks
2. **Flag significant improvements** - Comment when you fix SOURCE errors
3. **Maintain heading structure** - Don't reorganize sections without coordination
4. **Keep code blocks intact** - Translation should not modify code logic

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture and design
- [QUICKSTART.md](QUICKSTART.md) - Getting started guide
- [PLAN-TOOL-RESYNC.md](../PLAN-TOOL-RESYNC.md) - Resync tool implementation plan
- [HEADING-MAPS.md](HEADING-MAPS.md) - How heading-maps enable cross-language matching

---

*This document is part of the action-translation project.*
