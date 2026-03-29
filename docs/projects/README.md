# Research Assistant Projects

> **Team**: 2-4 Research Assistants
> **Period**: 3 months at 4-7 hours/week, with potential summer intensive (3 days/week, 2 months, 1-2 students)
> **Start Date**: TBD

## Overview

These three mini-projects support the development of `action-translation` -- QuantEcon's tool for automatically translating MyST Markdown lecture content using LLMs. Each project is self-contained but they reinforce each other, and RAs can move between them based on interest and skill.

The projects are designed around a core insight: **improving automated translation requires three things working together** -- good test data to measure quality, systematic review of real outputs to find failure patterns, and comprehensive terminology to guide the models.

**Two primary projects** drive the work:

1. **Project B** reviews `lecture-python-programming.zh-cn` (25 lectures) using AI-assisted review with human sign-off -- this gates publication and produces structured data on where the AI succeeds and fails.
2. **Project A** builds a gamified CLI tool and results website where RAs contribute translations, judge model outputs, and compete on a leaderboard -- making benchmark data collection fun.

Project C (glossary expansion) feeds into both: better terminology improves translations (B) and provides ground truth for benchmarking (A).

```
┌──────────────────────────────────────────────────────────────────┐
│                    How the Projects Connect                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Project C: Glossary              Project A: Benchmark          │
│   ┌─────────────────┐             ┌──────────────────────┐      │
│   │ Expanded terms   │───terms───>│ CLI: translate, judge │      │
│   │ & academic       │  & ground  │ Website: leaderboard, │      │
│   │ phrases          │  truth     │ Elo, coverage, weekly │      │
│   └─────────────────┘             └──────────┬───────────┘      │
│          ▲                                   │                   │
│          │  missing terms                    │ quality data      │
│          │                                   ▼                   │
│   ┌──────┴───────────────────────────────────────────────┐      │
│   │              Project B: Lecture Review                 │      │
│   │  AI-assisted review of 25 lectures with human         │      │
│   │  concurrence → sign-off for publication +             │      │
│   │  structured feedback → improve action-translation     │      │
│   └───────────────────────────────────────────────────────┘      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Projects

| Project | Focus | Skills | Doc |
|---------|-------|--------|-----|
| **A** | [Benchmark CLI, Dataset & Results Website](PROJECT-A-BENCHMARK.md) | Python/TypeScript, APIs, web, data viz | Coding: CLI tool, dataset curation, GitHub Pages site |
| **B** | [AI-Assisted Translation Review](PROJECT-B-PR-REVIEW.md) | Bilingual review, attention to detail | QA: review 25 lectures, sign off for publication, collect feedback data |
| **C** | [Glossary & Academic Terminology](PROJECT-C-GLOSSARY.md) | Economics domain knowledge, bilingual | Domain expertise: expand glossary from 357 to 1,000+ terms |

## Team Allocation

Allocation depends on team size and individual strengths:

| Team Size | Suggested Split |
|-----------|----------------|
| **2 RAs** | RA1 -> Project A (benchmark CLI + website); RA2 -> Projects B + C (lecture review + glossary) |
| **3 RAs** | RA1 -> Project A; RA2 -> Project B; RA3 -> Project C |
| **4 RAs** | RA1 + RA2 -> Project A (one on CLI/website, one on dataset curation); RA3 -> Project B; RA4 -> Project C |

**All RAs** should use the `qebench` CLI tool from Project A once it's available -- contributing translations and judgments via the CLI is designed to be quick and fun, regardless of which project you're primarily on.

RAs should choose a **QuantEcon lecture series** to focus on based on their interest -- the lecture content serves as inspiration and source material for building test datasets, not as the translation target itself.

Suggested lecture series (pick one or two per RA):

- [Quantitative Economics with Python](https://python.quantecon.org/) -- intro macro/micro
- [Advanced Quantitative Economics with Python](https://python-advanced.quantecon.org/) -- dynamic programming, asset pricing
- [Continuous Time](https://continuoustime.quantecon.org/) -- ODEs, optimal control

## Timeline

### Phase 1: Semester (Weeks 1-12, 4-7 hrs/week)

| Weeks | Project A (Benchmark) | Project B (Lecture Review) | Project C (Glossary) |
|-------|---|---|---|
| 1-2 | Repo setup, schema design, seed data, scaffold CLI | Learn review workflow, first 2-3 lecture reviews | Audit existing 357-term glossary |
| 3-5 | `translate` + `add` modes, first `run`, 200+ terms | Review all 25 lectures (5-6/week) | Expand terms by domain (target: 500) |
| 6-8 | `judge` mode, Elo, second model, website MVP | Fix issues, pattern analysis, data export | Academic phrase pairs (100+), names |
| 9-10 | Website polish: coverage map, weekly, browser | Recommendations report, sign-off remaining lectures | Cross-reference with textbooks |
| 11-12 | Prompt A/B testing, model comparison, write-up | Final summary, handoff documentation | Coverage report, export to glossary |

### Phase 2: Summer Intensive (2 months, 3 days/week, 1-2 students)

Summer students would likely focus on **Project A** (the most coding-intensive), with goals:

- Scale dataset to 1,000+ terms, 500+ sentences, 100+ paragraphs
- Systematic whole-document vs. section-by-section translation testing across full lecture files
- Prompt optimization experiments (glossary injection, domain context, instruction style)
- Add COMET/XCOMET automated metrics
- Full multi-model benchmark (4+ models including local LLMs)
- Interactive dashboard with historical tracking
- Integration tests feeding back into `action-translation`
- Possible: academic paper draft on benchmark results

## Infrastructure

### Repositories

| Repo | Purpose | Who uses it |
|------|---------|-------------|
| `QuantEcon/action-translation` | Main tool (this repo) | All projects (reference) |
| `QuantEcon/benchmark.translate-zh-cn` | Benchmark CLI, dataset, results website | Project A (primary), C (glossary export) |
| `QuantEcon/lecture-python-programming.zh-cn` | Chinese translations to review | Project B (primary) |
| `QuantEcon/lecture-python-programming` | English source lectures | Project B (reference) |
| `QuantEcon/test-translation-sync` | English test content | Project B (onboarding) |
| `QuantEcon/test-translation-sync.zh-cn` | Chinese test translations | Project B (onboarding) |

### Shared Resources

- **Glossary**: `glossary/zh-cn.json` in this repo (357 terms) -- Project C expands it, Projects A and B use it as ground truth
- **Test tool**: `tool-test-action-on-github/` in this repo -- Project B uses for onboarding
- **Translator prompts**: `src/translator.ts` -- Project A tests variations, Project B reviews their output
- **Experiment results**: `experiments/forward/` -- Project A builds on the whole-file vs. section-by-section findings

## RA Expectations

- **Commitment**: 4-7 hours/week during the semester, logged via light weekly check-in
- **Communication**: Weekly async update (a few sentences in Slack/Teams or a GitHub issue comment)
- **Tools**: GitHub (PRs, issues, project boards), VS Code, git basics, terminal/CLI
- **Background**: Undergraduate-level understanding of economics; bilingual fluency (EN/ZH) for Projects B and C; programming comfort (Python or TypeScript) for Project A
- **Output**: Each project has concrete deliverables documented in its project file -- the goal is finished, usable artifacts, not reports about work done

## Related Documents

- [PLAN.md](../../PLAN.md) -- Development roadmap for `action-translation`; Phase 9 discusses whole-file vs section-by-section translation architecture, and `experiments/forward/` contains initial experiment results that Project A should build on
- [_archive/PROJECT-BENCHMARK.md](_archive/PROJECT-BENCHMARK.md) -- Original comprehensive benchmark plan with detailed infrastructure specs (CI/CD, issue templates, provider interfaces, dashboard mockup) -- useful reference when implementing
- [architecture.md](../developer/architecture.md) -- `action-translation` module structure
- [testing.md](../developer/testing.md) -- How the action's test suite works
