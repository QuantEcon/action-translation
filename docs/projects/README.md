# Research Assistant Projects

> **Team**: 2–4 Research Assistants  
> **Period**: 3 months at 4–7 hours/week, with potential summer intensive (3 days/week, 2 months, 1–2 students)  
> **Start Date**: TBD

## Overview

These three mini-projects support the development of `action-translation` — QuantEcon's tool for automatically translating MyST Markdown lecture content using LLMs. Each project is self-contained but they reinforce each other, and RAs can move between them based on interest and skill.

The projects are designed around a core insight: **improving automated translation requires three things working together** — good test data to measure quality, systematic review of real outputs to find failure patterns, and comprehensive terminology to guide the models.

```
┌─────────────────────────────────────────────────────────────────┐
│                    How the Projects Connect                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Project C: Glossary              Project A: Benchmark         │
│   ┌─────────────────┐             ┌─────────────────────┐      │
│   │ Expanded terms   │────────────>│ Test dataset for     │      │
│   │ & academic       │  terms &    │ model comparison     │      │
│   │ phrases          │  phrases    │ & prompt testing     │      │
│   └─────────────────┘             └──────────┬──────────┘      │
│          ▲                                   │                  │
│          │  missing terms                    │ quality scores   │
│          │                                   ▼                  │
│   ┌──────┴──────────────────────────────────────────────┐      │
│   │              Project B: PR Review                    │      │
│   │  Review real translation PRs → find error patterns   │      │
│   │  → feed back into glossary & benchmark dataset       │      │
│   └──────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Projects

| Project | Focus | Skills | Doc |
|---------|-------|--------|-----|
| **A** | [Benchmark Dataset & Model Comparison](PROJECT-A-BENCHMARK.md) | Python/TypeScript, data, web | Coding-heavy: dataset, runner, strategy testing, website |
| **B** | [Translation PR Review & Quality Feedback](PROJECT-B-PR-REVIEW.md) | Bilingual review, attention to detail | QA-focused |
| **C** | [Glossary & Academic Terminology](PROJECT-C-GLOSSARY.md) | Economics domain knowledge, bilingual | Domain expertise |

## Team Allocation

Allocation depends on team size and individual strengths:

| Team Size | Suggested Split |
|-----------|----------------|
| **2 RAs** | RA1 → Project A (benchmark + coding); RA2 → Projects B + C (review + glossary) |
| **3 RAs** | RA1 → Project A; RA2 → Project B; RA3 → Project C |
| **4 RAs** | RA1 + RA2 → Project A (one on data curation, one on tooling); RA3 → Project B; RA4 → Project C |

RAs should choose a **QuantEcon lecture series** to focus on based on their interest — the lecture content serves as inspiration and source material for building test datasets, not as the translation target itself.

Suggested lecture series (pick one or two per RA):

- [Quantitative Economics with Python](https://python.quantecon.org/) — intro macro/micro
- [Advanced Quantitative Economics with Python](https://python-advanced.quantecon.org/) — dynamic programming, asset pricing
- [Continuous Time](https://continuoustime.quantecon.org/) — ODEs, optimal control

## Timeline

### Phase 1: Semester (Weeks 1–12, 4–7 hrs/week)

| Weeks | Project A | Project B | Project C |
|-------|-----------|-----------|-----------|
| 1–2 | Schema design, repo setup | Learn test workflow, first PR reviews | Audit existing 357-term glossary |
| 3–5 | Seed dataset (terms + sentences), basic CLI runner | Review all 24 test scenario PRs | Expand terms by domain (target: 500) |
| 6–8 | Add second model, first benchmark run | Build error taxonomy, summary report | Academic phrase pairs (100+) |
| 9–10 | Static results site (GitHub Pages) | Review real QuantEcon lecture PRs | Economist names, cross-reference with textbooks |
| 11–12 | Whole-doc vs section-by-section testing, prompt A/B testing, write-up | Prioritised improvement recommendations | Coverage report, export to glossary |

### Phase 2: Summer Intensive (2 months, 3 days/week, 1–2 students)

Summer students would likely focus on **Project A** (the most coding-intensive), with goals:

- Scale dataset to 1,000+ terms, 500+ sentences, 100+ paragraphs
- Systematic whole-document vs. section-by-section translation testing across full lecture files
- Prompt optimisation experiments (glossary injection, domain context, instruction style)
- Add COMET/XCOMET automated metrics
- Full multi-model benchmark (4+ models)
- Interactive dashboard with historical tracking
- Integration tests feeding back into `action-translation`
- Possible: academic paper draft on benchmark results

## Infrastructure

### Repositories

| Repo | Purpose | Who uses it |
|------|---------|-------------|
| `QuantEcon/action-translation` | Main tool (this repo) | All projects (reference) |
| `QuantEcon/project-translation-benchmark` | Benchmark data, runner, website | Project A (primary), C (glossary export) |
| `QuantEcon/test-translation-sync` | English test content | Project B |
| `QuantEcon/test-translation-sync.zh-cn` | Chinese test translations | Project B |

### Shared Resources

- **Glossary**: `glossary/zh-cn.json` in this repo (357 terms) — Project C expands it, Project A uses it for scoring
- **Test tool**: `tool-test-action-on-github/` in this repo — Project B uses it to generate test PRs
- **Translator prompts**: `src/translator.ts` — Project A tests variations, Project B reviews their output

## RA Expectations

- **Commitment**: 4–7 hours/week during the semester, logged via light weekly check-in
- **Communication**: Weekly async update (a few sentences in Slack/Teams or a GitHub issue comment)
- **Tools**: GitHub (PRs, issues, project boards), VS Code, git basics
- **Background**: Undergraduate-level understanding of economics; bilingual fluency (EN/ZH) for Projects B and C; programming comfort (Python or TypeScript) for Project A
- **Output**: Each project has concrete deliverables documented in its project file — the goal is finished, usable artifacts, not reports about work done

## Related Documents

- [PLAN.md](../../PLAN.md) — Development roadmap for `action-translation`; Phase 9 discusses whole-file vs section-by-section translation architecture, and `experiments/forward/` contains initial experiment results that Project A should build on
- [_archive/PROJECT-BENCHMARK.md](_archive/PROJECT-BENCHMARK.md) — Original comprehensive benchmark plan with detailed infrastructure specs (CI/CD, issue templates, provider interfaces, dashboard mockup) — useful reference when implementing
- [architecture.md](../developer/architecture.md) — `action-translation` module structure
- [testing.md](../developer/testing.md) — How the action's test suite works
