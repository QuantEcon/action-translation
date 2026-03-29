# Project A: Benchmark Dataset, CLI Tool & Results Website

> **Type**: Coding + data curation, gamified
> **Ideal RA profile**: Comfortable with Python or TypeScript, interested in building tools, APIs, and data visualization
> **Time**: 4-7 hrs/week for 12 weeks; potential summer extension
> **Repository**: `QuantEcon/benchmark.translate-zh-cn` (new, separate repo)

## Goal

Build three things that work together:

1. **A gold-standard test dataset** of English-Chinese economics/mathematics translations
2. **A CLI tool (`qebench`)** that RAs use daily to contribute translations, judge model outputs, and run benchmarks
3. **A results website** (GitHub Pages) showing leaderboards, model Elo ratings, coverage progress, and translation highlights

The CLI is where data goes in. The website is where results come out. Together, they make contributing to the benchmark **fun** -- RAs can compete, see their impact, and watch models improve over time.

## Why This Matters

No existing translation benchmark covers **academic economics + mathematics** in a format that includes:

- Technical terminology (贝尔曼方程, 拉格朗日乘数)
- Mathematical notation in context
- MyST Markdown formatting (code blocks, directives, LaTeX)
- Human expert validation by economics students

Existing benchmarks (WMT, FLORES+, OPUS) focus on news or general text. We need domain-specific evaluation to improve `action-translation`.

## What You'll Build

### 1. Test Dataset

A collection of English-Chinese translation pairs at three granularities:

| Level | What | Example | Target (Semester) |
|---|---|---|---|
| **Terms** | Single terms with standard translations | "Bellman equation" -> "贝尔曼方程" | 500+ |
| **Sentences** | One-sentence definitions or statements | "The Bellman equation characterizes the value function recursively." | 100+ |
| **Paragraphs** | Multi-sentence explanations (may include math/code) | A paragraph explaining dynamic programming | 30+ |

Use QuantEcon lectures as **inspiration** -- pick a lecture series you find interesting and extract representative content. You're building a test dataset, not translating the lectures.

**Data format** (JSON files):

```json
{
  "id": "term-001",
  "en": "Bellman equation",
  "zh": "贝尔曼方程",
  "domain": "dynamic-programming",
  "difficulty": "intermediate",
  "alternatives": ["贝尔曼等式"],
  "source": "quantecon/dp-intro"
}
```

```json
{
  "id": "sent-042",
  "en": "The Bellman equation characterizes the value function recursively.",
  "zh": "贝尔曼方程递归地刻画了价值函数。",
  "domain": "dynamic-programming",
  "difficulty": "intermediate",
  "key_terms": ["term-001"],
  "human_scores": { "accuracy": 9, "fluency": 8 }
}
```

Paragraphs follow the same pattern but include `contains_math` and `contains_code` flags.

### 2. CLI Tool: `qebench`

A command-line tool with three interactive modes plus utility commands:

```
qebench translate    Translate & Compare mode (can you beat the AI?)
qebench judge        Judge mode (rate anonymous translations, build Elo)
qebench add          Add new test entries to the dataset
qebench run          Run benchmark against LLM models
qebench stats        Show leaderboard, coverage, Elo ratings
qebench export       Export results for the website
```

#### Mode 1: `qebench translate` -- Translate & Compare

The RA sees an English term/sentence/paragraph, writes their own translation, then instantly sees how it compares to model outputs and the reference.

```
$ qebench translate --random

╭──────────────────────────────────────────────────╮
│  Translate & Compare  (#42 of 500)               │
│  Domain: dynamic-programming | Difficulty: ★★☆   │
╰──────────────────────────────────────────────────╯

  English:
  "The Bellman equation characterizes the value
   function recursively."

  Your translation (press Enter twice to submit):
  > 贝尔曼方程递归地刻画了价值函数。
  >

  ── Results ──────────────────────────────────────

  You:       贝尔曼方程递归地刻画了价值函数。
  Claude:    贝尔曼方程以递归方式描述了价值函数。
  GPT-4o:    贝尔曼方程递归地描述价值函数。
  Reference: 贝尔曼方程递归地刻画了价值函数。

  ── Scores ───────────────────────────────────────
  Glossary match:     You ✓  Claude ✓  GPT ✓
  Reference overlap:  You 100% | Claude 78% | GPT 82%

  Your translation saved! (+10 XP)

  [n]ext  [s]kip  [q]uit
```

**Why it's fun**: It's a game -- can you beat the AI? Instant feedback on every entry, and every translation contributes to the dataset.

**Options**:
- `--domain dynamic-programming` -- focus on a specific domain
- `--difficulty intermediate` -- filter by difficulty
- `--level sentences` -- terms, sentences, or paragraphs
- `--random` -- random selection (default)
- `--sequential` -- work through entries in order

#### Mode 2: `qebench judge` -- Rate Anonymous Translations

The RA sees the English source plus 2-3 anonymous translations (from different models, or model vs. human). They rate each and pick a winner.

```
$ qebench judge --random

╭──────────────────────────────────────────────────╮
│  Judge  (Round 7)                                │
│  Domain: macroeconomics                          │
╰──────────────────────────────────────────────────╯

  English:
  "Under the assumption of rational expectations,
   agents use all available information to form
   their forecasts."

  ── Translation A ──────────────────────────────
  在理性预期假设下，代理人利用所有可用信息来形成预测。

  ── Translation B ──────────────────────────────
  在理性预期的假设下，经济主体利用全部可获得的信息进行预测。

  Rate each (1-10):
  A - Accuracy: 7  Fluency: 6
  B - Accuracy: 8  Fluency: 9

  Which is better overall?  [A] / [B] / [=] tie
  > B

  Saved! Translation B wins this round.
  Current Elo: Model-A: 1523  Model-B: 1547

  [n]ext  [q]uit
```

**Why it's fun**: It feels like voting, not data entry. Models accumulate Elo ratings over time based on head-to-head human judgments. The RA doesn't know which model produced which translation, keeping judgments unbiased.

**Options**:
- `--matchup claude-vs-gpt` -- specific model comparison
- `--include-human` -- include human translations in the mix
- `--level sentences` -- filter by content level

#### Mode 3: `qebench add` -- Contribute New Entries

For RAs who want to grow the dataset:

```
$ qebench add --level sentence

╭──────────────────────────────────────────────────╮
│  Add New Entry                                   │
╰──────────────────────────────────────────────────╯

  Level: sentence
  English: The first-order condition equates marginal
           cost to marginal benefit.
  Chinese: 一阶条件使边际成本等于边际收益。
  Domain [macro/micro/dp/...]: microeconomics
  Difficulty [basic/intermediate/advanced]: intermediate
  Key terms (comma-separated IDs): term-102, term-045
  Source (optional): quantecon/optgrowth

  Saved as sent-103! (+15 XP for new entry)
```

The entry goes into the local JSON dataset. RAs commit and push to contribute.

#### Utility: `qebench stats`

```
$ qebench stats

╭──────────────────────────────────────────────────╮
│  Benchmark Stats                                 │
╰──────────────────────────────────────────────────╯

  Dataset Coverage:
  Terms:      ████████████░░░░  340 / 500
  Sentences:  ████░░░░░░░░░░░░   45 / 100
  Paragraphs: ██░░░░░░░░░░░░░░   12 /  30

  Model Elo Rankings (127 judgments):
  1. Claude Opus    1587  ████████████████
  2. Claude Sonnet  1543  ███████████████
  3. GPT-4o         1521  ██████████████
  4. DeepSeek-V3    1489  █████████████

  Top Contributors:
  1. @ra-alice   210 translations, 45 judgments   🏆
  2. @ra-bob     185 translations, 62 judgments
  3. @ra-carol   120 translations, 31 judgments

  This Week's Highlight:
  "stochastic discount factor" -- 3 models, 3 different
  translations! See: qebench show weekly
```

#### Utility: `qebench run`

Runs the benchmark programmatically against LLM APIs:

```bash
# Run all terms against Claude Sonnet
qebench run --model claude-sonnet --level terms

# Compare two models on sentences
qebench run --model claude-sonnet,gpt-4o --level sentences

# Run with a specific prompt variation
qebench run --model claude-sonnet --prompt prompts/v2-glossary-emphasis.txt
```

This is the command used for systematic model comparison and prompt A/B testing.

### 3. Results Website (GitHub Pages)

A static website auto-generated from the JSON results data. Updated on every push to main via GitHub Actions.

#### Pages

**Homepage / Dashboard**
- Overall dataset coverage progress bars
- Model Elo rankings with historical trend chart
- Recent activity feed (latest translations, judgments, dataset additions)
- Link to "Translation of the Week"

**Leaderboard**
- RA contributions ranked by: translations, judgments, dataset additions, total XP
- Time period filters: all-time, this month, this week
- Badges/achievements for milestones (first 100 translations, etc.)

**Model Comparison**
- Side-by-side model scores by category (terms, sentences, paragraphs)
- Elo history chart showing how ratings change over time
- Cost comparison per model
- Drill-down: click a model to see its specific strengths/weaknesses by domain

**Coverage Map**
- Visual showing which QuantEcon domains have benchmark data and which have gaps
- Click a domain to see its entries
- Progress toward semester targets

**Translation of the Week**
- Highlighted case where translations diverged interestingly
- Shows all model outputs plus the reference
- Brief commentary on what makes this case interesting
- Archive of past weekly highlights

**Browse Dataset**
- Searchable table of all entries (terms, sentences, paragraphs)
- Filter by domain, difficulty, review status
- Click an entry to see all model translations and human scores

#### Technology

- **Static site generator**: Simple HTML/JS or a lightweight framework (Astro, Eleventy)
- **Charts**: Chart.js for Elo trends, coverage progress, leaderboard
- **Data**: Reads from `results/*.json` files, generated by `qebench export`
- **Hosting**: GitHub Pages, auto-deployed via GitHub Actions on push to main
- **Updates**: `qebench export` generates the JSON the site reads; CI rebuilds on merge

### 4. Gamification System

The gamification elements make contributing feel like progress, not data entry.

#### XP System

| Action | XP |
|---|---|
| Complete a "translate" round | +10 |
| Add a new dataset entry | +15 |
| Complete a "judge" round | +5 |
| Find an entry where your translation beats all models | +25 |
| First contribution of the day | +5 bonus |

XP drives the leaderboard on the website.

#### Elo Ratings for Models

Models get Elo ratings based on head-to-head comparisons in "judge" mode. Each judgment updates the Elo using the standard formula. This gives a dynamic, intuitive ranking that reflects human preference.

#### Coverage Milestones

Celebrate when the team hits coverage targets:
- 250 terms -> "Quarter coverage" badge
- 500 terms -> "Half coverage" badge
- First complete domain (all terms covered) -> domain badge

#### Translation of the Week

Auto-selected or manually curated -- an interesting case where:
- Models disagreed significantly
- A human translation was notably better (or worse) than models
- The "correct" translation was surprising or had interesting linguistic nuance

Published on the website weekly. Good for team discussion and learning.

## Repository Structure

```
benchmark.translate-zh-cn/
├── data/
│   ├── terms/
│   │   ├── economics.json
│   │   ├── mathematics.json
│   │   └── statistics.json
│   ├── sentences/
│   │   ├── definitions.json
│   │   └── theorems.json
│   ├── paragraphs/
│   │   └── quantecon-extracts.json
│   └── schema/
│       └── schema.json              # JSON Schema for validation
├── src/                              # CLI tool source
│   ├── cli.ts                        # CLI entry point & command routing
│   ├── translate.ts                  # "translate" mode
│   ├── judge.ts                      # "judge" mode
│   ├── add.ts                        # "add" mode
│   ├── run.ts                        # benchmark runner
│   ├── stats.ts                      # stats display
│   ├── export.ts                     # export for website
│   ├── providers/                    # LLM API wrappers
│   │   ├── base.ts
│   │   ├── claude.ts
│   │   ├── openai.ts
│   │   └── local.ts                  # Ollama/local LLM support
│   ├── scoring/
│   │   ├── glossary.ts               # Glossary compliance check
│   │   ├── elo.ts                    # Elo rating calculations
│   │   └── xp.ts                     # XP calculations
│   └── utils/
│       ├── display.ts                # Terminal UI formatting
│       └── dataset.ts                # Data loading/saving
├── results/
│   ├── translations/                 # Human translations from "translate" mode
│   │   └── {username}-{date}.json
│   ├── judgments/                     # Ratings from "judge" mode
│   │   └── {username}-{date}.json
│   ├── model-outputs/                # LLM benchmark outputs
│   │   └── {model}-{date}.json
│   ├── elo.json                      # Running Elo ratings
│   ├── leaderboard.json              # XP and contribution stats
│   └── weekly.json                   # Translation of the week picks
├── prompts/                          # Prompt variations for A/B testing
│   ├── default.txt
│   ├── v2-glossary-emphasis.txt
│   └── v3-domain-context.txt
├── site/                             # GitHub Pages website
│   ├── index.html                    # Dashboard
│   ├── leaderboard.html
│   ├── models.html                   # Model comparison
│   ├── coverage.html                 # Coverage map
│   ├── weekly.html                   # Translation of the week
│   ├── browse.html                   # Dataset browser
│   ├── css/
│   ├── js/
│   │   ├── charts.js                 # Chart.js visualizations
│   │   └── data.js                   # Load and render JSON data
│   └── data/                         # Generated JSON for the site
│       └── (symlink or copy of results/)
├── .github/
│   └── workflows/
│       ├── validate.yml              # PR validation (schema check)
│       └── deploy-site.yml           # Build + deploy site on push
├── CONTRIBUTING.md
├── package.json
└── README.md
```

## Week-by-Week Plan

### Weeks 1-2: Repo Setup, Schema & Seed Data

- [ ] Create the `benchmark.translate-zh-cn` repository
- [ ] Design JSON schemas for terms, sentences, paragraphs
- [ ] Write a schema validation script
- [ ] Set up CI to validate data on every PR
- [ ] Seed 50 terms from the existing `glossary/zh-cn.json` (357 terms)
- [ ] Scaffold the CLI tool with `qebench stats` (read-only, shows dataset state)

### Weeks 3-5: CLI Core & First Dataset

- [ ] Implement `qebench translate` mode (the main fun loop)
- [ ] Implement `qebench add` mode
- [ ] Implement basic `qebench run` with one provider (Claude Sonnet)
- [ ] Curate 200+ terms across economics, math, statistics domains
- [ ] Curate 50+ sentence pairs from QuantEcon lectures
- [ ] First benchmark run -- establish model baselines
- [ ] Implement XP tracking and `qebench stats`

### Weeks 6-8: Judge Mode, Second Model & Website

- [ ] Implement `qebench judge` mode with Elo ratings
- [ ] Add a second provider (GPT-4o or DeepSeek)
- [ ] Run first head-to-head model comparison
- [ ] Build the results website: dashboard, leaderboard, model comparison pages
- [ ] Set up GitHub Actions to auto-deploy site
- [ ] Curate 30+ paragraph pairs (with math/code)
- [ ] Implement `qebench export` to generate site data

### Weeks 9-10: Website Polish & Coverage Push

- [ ] Add coverage map page to the website
- [ ] Add "Translation of the Week" page
- [ ] Add dataset browser page
- [ ] Push dataset toward semester targets (500 terms, 100 sentences, 30 paragraphs)
- [ ] Implement prompt variation support in `qebench run`

### Weeks 11-12: Analysis & Write-up

- [ ] Run systematic model comparison across all data
- [ ] Test 2-3 prompt variations from `action-translation`'s translator
- [ ] Document which models and prompts perform best on which content types
- [ ] Write a summary of findings
- [ ] Produce a "state of the benchmark" report

### Summer Extension (if applicable)

- Scale dataset to 1,000+ terms, 500+ sentences, 100+ paragraphs
- Systematic whole-doc vs. section-by-section translation testing across full lecture files
- Add automated metrics (BLEU, COMET/XCOMET via Python)
- Full 4+ model comparison (including local LLMs via Ollama)
- Prompt optimization experiments: glossary injection, domain context, instruction style
- Interactive dashboard with historical trend tracking
- Possible academic paper draft on benchmark results

## Coding Side-Projects

These are optional explorations for technically-inclined RAs. They use the benchmark infrastructure but aren't part of the core dataset/CLI/website work.

| Side-Project | What | Skills |
|---|---|---|
| **Model comparison** | Add new providers to `qebench run` (Gemini, DeepSeek, Mistral) | API integration |
| **Context experiments** | Compare sentence vs. section vs. whole-document translation quality | Experiment design |
| **Local LLM testing** | Add Ollama/llama.cpp support, benchmark open-weight models | DevOps, ML |
| **Automated metrics** | Implement BLEU/COMET scoring alongside human judgments | Python ML |
| **Prompt A/B testing** | Design experiments varying glossary injection, domain context, instruction style | Prompt engineering |
| **Git reproducibility** | Test how different translation strategies affect diff quality for version control | Git, analysis |

These side-projects produce results that feed into the main website and dataset. An RA who adds a new model provider will see that model appear on the leaderboard alongside existing ones.

## Scoring Approach

### Phase 1 (Semester): Human + Simple Automated

| Metric | How | Notes |
|---|---|---|
| **Glossary compliance** | Exact match: did the model use the expected term? | Automated, easy to implement |
| **Reference overlap** | Character-level similarity to reference translation | Automated, rough signal |
| **Elo rating** | Head-to-head human comparisons in "judge" mode | Best quality signal |
| **Human accuracy** | 1-10 score from "judge" mode | Per-translation |
| **Human fluency** | 1-10 score from "judge" mode | Per-translation |

### Phase 2 (Summer): Add Neural Metrics

| Metric | How | Notes |
|---|---|---|
| **BLEU** | N-gram overlap with reference | Standard MT metric, useful as baseline |
| **COMET** | Neural quality estimation (`unbabel-comet`) | Best correlation with human scores |
| **XCOMET** | COMET + error span identification | Shows exactly where translations fail |

## Skills You'll Practice

- **CLI development**: Building an interactive command-line tool
- **API integration**: Working with LLM APIs (Anthropic, OpenAI, Google)
- **Web development**: Static site generation, data visualization with Chart.js
- **Data engineering**: Designing schemas, validating data, managing JSON datasets
- **CI/CD**: GitHub Actions for validation and deployment
- **Scientific methodology**: Controlled comparisons, Elo rating systems, reproducible experiments

## Getting Started

1. Read the `action-translation` [README](../../README.md) to understand what the tool does
2. Look at the existing glossary: `glossary/zh-cn.json` (357 terms) -- this is your seed data
3. Browse a QuantEcon lecture series and pick one that interests you
4. Set up the new repo and start with the schema design
5. Build `qebench stats` first (simplest command, proves the data layer works)
6. Then build `qebench translate` (the main fun loop)

## Resources

- [Anthropic API docs](https://docs.anthropic.com/)
- [OpenAI API docs](https://platform.openai.com/docs/)
- [Chart.js](https://www.chartjs.org/) -- charts for the website
- [JSON Schema](https://json-schema.org/) -- data validation
- [Elo rating system](https://en.wikipedia.org/wiki/Elo_rating_system) -- for model rankings
- [COMET metric](https://github.com/Unbabel/COMET) -- for summer phase
- [Ink (React for CLI)](https://github.com/vadimdemedes/ink) -- optional: rich terminal UI
