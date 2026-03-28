# Project A: Benchmark Dataset & Model Comparison

> **Type**: Coding-heavy  
> **Ideal RA profile**: Comfortable with Python or TypeScript, interested in building tools and working with APIs  
> **Time**: 4–7 hrs/week for 12 weeks; potential summer extension  
> **Repository**: `QuantEcon/project-translation-benchmark` (new, separate repo)

## Goal

Build a gold-standard English-Chinese test dataset of economics/mathematics content and a tool that sends that content to multiple LLMs, collects translations, and presents the results on a simple website.

This directly supports `action-translation` — the test dataset lets us measure whether prompt changes or model upgrades actually improve translation quality.

## Why This Matters

No existing translation benchmark covers **academic economics + mathematics** in a format that includes:

- Technical terminology (贝尔曼方程, 拉格朗日乘数)
- Mathematical notation in context
- MyST Markdown formatting (code blocks, directives, LaTeX)
- Human expert validation by economics students

Existing benchmarks (WMT, FLORES+, OPUS) focus on news or general text. We need domain-specific evaluation.

## What You'll Build

### 1. Test Dataset

A collection of English-Chinese translation pairs at three granularities:

| Level | What | Example | Target Count (Semester) |
|-------|------|---------|------------------------|
| **Terms** | Single terms with standard translations | "Bellman equation" → "贝尔曼方程" | 500+ |
| **Sentences** | One-sentence definitions or statements | "The Bellman equation characterizes the value function recursively." | 100+ |
| **Paragraphs** | Multi-sentence explanations (may include math/code) | A paragraph explaining dynamic programming | 30+ |

Use QuantEcon lectures as **inspiration** — pick a lecture series you find interesting and extract representative content from it. You're building a test dataset, not translating the lectures.

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

### 2. Benchmark Runner (CLI)

A command-line tool that:

1. Loads test data from JSON files
2. Sends source text to an LLM API (start with one model, add more later)
3. Collects the translations
4. Scores them against the reference translations
5. Outputs results as JSON

**Start simple.** The first version only needs:

- One provider (Claude Sonnet via the Anthropic API)
- One metric: **glossary compliance** — did the model use the correct term translations?
- JSON output of results

Later versions can add:
- More providers (GPT-4o, Gemini)
- More metrics (BLEU, COMET — these require Python ML libraries)
- Prompt variations for A/B testing

### 3. Translation Strategy Testing

Beyond comparing models, we want to compare **how** we translate. There are two key dimensions:

**Whole-document vs. section-by-section translation**

`action-translation` currently translates documents section-by-section (one LLM call per `##` section). But an experiment on one document (`pv.md`) showed that translating the whole document in a single LLM call produced better results:

| Metric | Whole-document | Section-by-section |
|--------|---------------|--------------------|
| Changed lines vs original | 29 | 52 |
| API calls | 1 | 7 |
| Cost | $0.14 | $0.28 |
| Localization preserved? | Yes | No (reverted Chinese plot labels to English) |

The whole-document approach won because the LLM could see cross-section context (e.g., consistent Chinese plot labels). But this was only one file. We need to test across many files to know if the pattern holds.

**Your job**: Take 10–20 test paragraphs/documents and run each through both strategies, then compare:
- Translation accuracy and fluency
- Term consistency across sections
- Formatting preservation
- Cost per document

**Prompt variation testing**

The translation prompt in `action-translation` (`src/translator.ts`) tells the LLM how to translate. Small changes to the prompt can significantly affect quality. Test variations like:
- More vs. less context about the domain ("This is an economics textbook" vs. generic)
- Explicit glossary emphasis ("You MUST use these term translations") vs. inline glossary
- Different instruction styles (detailed rules vs. concise guidelines)
- With and without example translations

The existing experiment results are in `experiments/forward/whole-file-vs-section-by-section/` in the `action-translation` repo — start there.

### 4. Results Website

A static site (GitHub Pages) that displays benchmark results. This can be very simple:

- A table comparing model scores
- A page per benchmark run showing detailed results
- Strategy comparison (whole-doc vs. section-by-section)
- Auto-generated from the JSON output of the runner

Technology is your choice — could be a Jupyter Book, a simple HTML/JS page with Chart.js, or even auto-generated Markdown.

## Repository Structure

```
project-translation-benchmark/
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
│       └── schema.json          # JSON Schema for validation
├── src/                          # Benchmark runner
│   ├── index.ts                  # CLI entry
│   ├── runner.ts                 # Orchestration
│   ├── providers/                # LLM API wrappers
│   └── metrics/                  # Scoring functions
├── results/                      # Benchmark output (JSON)
├── site/                         # GitHub Pages site
├── .github/
│   └── workflows/
│       ├── validate.yml          # PR validation (schema check)
│       └── deploy-site.yml       # Publish site on push
├── CONTRIBUTING.md
├── package.json
└── README.md
```

## Week-by-Week Plan

### Weeks 1–2: Setup & Schema

- [ ] Create the `project-translation-benchmark` repository
- [ ] Design JSON schemas for terms, sentences, paragraphs
- [ ] Write a schema validation script (TypeScript or Python)
- [ ] Set up CI to validate data on every PR
- [ ] Seed 50 terms from the existing `glossary/zh-cn.json` (357 terms)

### Weeks 3–5: Dataset & First Runner

- [ ] Curate 200+ terms across economics, math, statistics domains
- [ ] Curate 50+ sentence pairs from QuantEcon lectures
- [ ] Build a basic benchmark runner: load data → call Claude API → save output
- [ ] Implement glossary compliance metric
- [ ] First benchmark run — establish a baseline

### Weeks 6–8: Second Model & Scoring

- [ ] Add a second provider (GPT-4o or Gemini)
- [ ] Add human scoring workflow (spreadsheet or JSON annotations)
- [ ] Compare results across models
- [ ] Curate 30+ paragraph pairs (with math/code)

### Weeks 9–10: Website

- [ ] Build a static results site (GitHub Pages)
- [ ] Auto-generate site content from benchmark JSON
- [ ] Deploy and share

### Weeks 11–12: Strategy & Prompt Testing

- [ ] Run whole-document vs. section-by-section comparison on 10+ paragraphs/documents
- [ ] Test 2–3 prompt variations from `action-translation`'s translator
- [ ] Document which prompts and strategies perform best on which content types
- [ ] Write a summary of findings

### Summer Extension (if applicable)

- Scale dataset to 1,000+ terms, 500+ sentences, 100+ paragraphs
- Systematic whole-doc vs. section-by-section testing across full lecture files (not just paragraphs)
- Add automated metrics (BLEU, COMET/XCOMET via Python)
- Full 4-model comparison
- Prompt optimisation: design experiments varying glossary injection, domain context, and instruction style
- Interactive dashboard with historical trend tracking
- Possible academic paper draft

## Scoring Approach

### Phase 1 (Semester): Simple Metrics

| Metric | How | Notes |
|--------|-----|-------|
| **Glossary compliance** | Exact match: did the model use the expected term? | Automated, easy to implement |
| **Human accuracy** | 1–10 score: is the translation correct? | Manual, via spreadsheet |
| **Human fluency** | 1–10 score: does it read naturally in Chinese? | Manual, via spreadsheet |

### Phase 2 (Summer): Automated Metrics

| Metric | How | Notes |
|--------|-----|-------|
| **BLEU** | N-gram overlap with reference translation | Standard MT metric, correlates poorly with human judgment but useful as baseline |
| **COMET** | Neural quality estimation (`unbabel-comet` Python package) | Best correlation with human scores |
| **XCOMET** | COMET + error span identification | Shows exactly where translations fail |

## Skills You'll Practice

- **API integration**: Working with LLM APIs (Anthropic, OpenAI, Google)
- **Data engineering**: Designing schemas, validating data, managing JSON datasets
- **CLI development**: Building a usable command-line tool
- **Web development**: Static site generation, data visualization
- **CI/CD**: GitHub Actions for validation and deployment
- **Scientific methodology**: Controlled comparisons, reproducible experiments

## Getting Started

1. Read the `action-translation` [README](../../README.md) to understand what the tool does
2. Look at the existing glossary: `glossary/zh-cn.json` (357 terms) — this is your seed data
3. Browse a QuantEcon lecture series and pick one that interests you
4. Set up the new repo and start with the schema design

## Resources

- [Anthropic API docs](https://docs.anthropic.com/)
- [OpenAI API docs](https://platform.openai.com/docs/)
- [COMET metric](https://github.com/Unbabel/COMET) — for summer phase
- [Chart.js](https://www.chartjs.org/) — simple charts for the website
- [JSON Schema](https://json-schema.org/) — for data validation
