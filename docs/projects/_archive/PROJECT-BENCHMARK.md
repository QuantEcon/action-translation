# PROJECT: Translation Benchmark Dataset & Evaluation Tool

> **Status**: Planning  
> **Team**: Xiamen University RA Group  
> **Start Date**: TBD  
> **Target**: Q1 2025

## Executive Summary

Build a gold-standard English-Chinese translation benchmark dataset and multi-model evaluation tool to:
1. **Benchmark** translation quality across LLM providers (Claude, GPT, Gemini)
2. **Validate** and improve `action-translation` prompt engineering
3. **Expand** glossary coverage with economics/mathematics terminology
4. **Establish** reproducible quality metrics for academic translation

---

## Existing Benchmarks & Our Differentiation

### Available Multilingual Benchmarks

| Benchmark | Focus | EN-ZH? | Domain | Limitations for Our Use |
|-----------|-------|--------|--------|------------------------|
| **WMT** (Workshop on MT) | General MT evaluation | ✅ | News, general | Not economics-specific; no academic terminology |
| **XTREME** (Google) | Cross-lingual NLU | ✅ | 40 languages, 9 tasks | Focus on NLU, not translation quality |
| **OPUS** | Parallel corpora | ✅ | 1000+ languages | Raw data, no quality scoring; not domain-specific |
| **FLORES+** | Low-resource MT | ✅ | 200 languages | General domain; no technical terminology |
| **Tatoeba** | Sentence retrieval | ✅ | Conversational | Short sentences; no academic content |

### Evaluation Metrics Available

| Tool | Type | What It Measures | Notes |
|------|------|------------------|-------|
| **BLEU** | N-gram overlap | Surface similarity | Industry standard; correlates poorly with human judgment |
| **COMET** | Neural metric | Learned quality | Best correlation with human scores; requires reference |
| **XCOMET** | Explainable neural | Quality + error spans | Identifies minor/major/critical errors |
| **CometKiwi** | Reference-free | Quality without reference | Good for production; newer approach |
| **TER** | Edit distance | Translation error rate | Complements BLEU |

### Why Build Our Own?

**Gap**: No existing benchmark covers **academic economics + mathematics** with:
- Technical terminology (贝尔曼方程, 拉格朗日乘数)
- Mathematical notation in context
- MyST Markdown formatting preservation
- Human expert validation specific to economics education

**Our Differentiation**:

| Aspect | Existing Benchmarks | Our Benchmark |
|--------|---------------------|---------------|
| **Domain** | General/News | Economics + Mathematics |
| **Terminology** | Generic | Expert-curated glossary (357→1000+) |
| **Format** | Plain text | MyST Markdown with code/math |
| **Validation** | Crowdsourced | Economics PhD/grad students |
| **Purpose** | Model comparison | Model comparison + prompt optimization |
| **Integration** | Standalone | Feeds back into action-translation |

### Leveraging Existing Resources

We can **build on** rather than duplicate:

1. **COMET/XCOMET**: Use as automatic evaluation metric alongside human scores
2. **OPUS**: Mine parallel economics texts for initial dataset seeds
3. **WMT methodology**: Adopt their evaluation protocols and statistical significance testing
4. **Hugging Face Datasets**: Publish our dataset for community use

---

## Project Components

| Component | Description | Location | Priority |
|-----------|-------------|----------|----------|
| **Dataset** | Gold-standard EN-ZH translation pairs | `tool-benchmark/data/` | P0 |
| **Benchmark Runner** | Multi-model evaluation CLI | `tool-benchmark/src/` | P0 |
| **Dashboard** | Results visualization (GitHub Pages) | `tool-benchmark/docs/` | P1 |
| **Feedback Loop** | Integration with action-translation | `src/` improvements | P2 |

---

## 1. Dataset Specification

### 1.1 Dataset Structure

```
tool-benchmark/
├── data/
│   ├── terms/                    # Terminology pairs
│   │   ├── economics.json        # Economic terms
│   │   ├── mathematics.json      # Math terms
│   │   ├── statistics.json       # Statistics terms
│   │   └── names.json            # Economist names
│   ├── sentences/                # Sentence-level pairs
│   │   ├── definitions.json      # Economic definitions
│   │   ├── theorems.json         # Mathematical statements
│   │   └── explanations.json     # Conceptual explanations
│   ├── paragraphs/               # Paragraph-level pairs
│   │   ├── quantecon/            # Extracted from QuantEcon
│   │   └── synthetic/            # Created examples
│   └── metadata/
│       ├── schema.json           # Data validation schema
│       └── contributors.json     # Attribution
```

### 1.2 Data Schema

#### Terms (extends current glossary format)

```json
{
  "version": "2.0",
  "type": "terms",
  "entries": [
    {
      "id": "term-001",
      "en": "Bellman equation",
      "zh": "贝尔曼方程",
      "domain": "dynamic-programming",
      "difficulty": "intermediate",
      "context": "Used in optimal control and dynamic programming",
      "alternatives": ["贝尔曼等式"],
      "notes": "Named after Richard Bellman",
      "source": "quantecon-lectures",
      "contributor": "ra-xiamen-001",
      "reviewed": true
    }
  ]
}
```

#### Sentences

```json
{
  "version": "1.0",
  "type": "sentences",
  "entries": [
    {
      "id": "sent-001",
      "en": "The Bellman equation characterizes the value function recursively.",
      "zh": "贝尔曼方程递归地刻画了价值函数。",
      "domain": "dynamic-programming",
      "difficulty": "intermediate",
      "grammatical_features": ["technical-definition", "passive-voice"],
      "key_terms": ["term-001", "term-042"],
      "source": "quantecon/dp-intro.md",
      "contributor": "ra-xiamen-002",
      "reviewed": true,
      "human_scores": {
        "accuracy": 9,
        "fluency": 8,
        "notes": "Standard translation, widely accepted"
      }
    }
  ]
}
```

#### Paragraphs

```json
{
  "version": "1.0",
  "type": "paragraphs",
  "entries": [
    {
      "id": "para-001",
      "en": "In dynamic programming, we seek to find...",
      "zh": "在动态规划中，我们寻求找到...",
      "domain": "dynamic-programming",
      "difficulty": "advanced",
      "length_en": 150,
      "length_zh": 120,
      "contains_math": true,
      "contains_code": false,
      "key_terms": ["term-001", "term-015", "term-042"],
      "source": "quantecon/dp-intro.md:L45-L52",
      "contributor": "ra-xiamen-003",
      "reviewed": true,
      "human_scores": {
        "accuracy": 9,
        "fluency": 8,
        "terminology": 10,
        "notes": "Excellent technical accuracy"
      }
    }
  ]
}
```

### 1.3 Dataset Targets

| Category | Current | Target | Notes |
|----------|---------|--------|-------|
| **Terms** | 357 | 1,000+ | Expand from glossary/zh-cn.json |
| **Sentences** | 0 | 500+ | Economic/math definitions |
| **Paragraphs** | 0 | 100+ | From QuantEcon lectures |

### 1.4 Quality Standards

- **Reviewed**: All entries require peer review
- **Human Scores**: Sentences and paragraphs include 1-10 human ratings
- **Domain Tags**: Consistent taxonomy across entries
- **Difficulty Levels**: `basic`, `intermediate`, `advanced`
- **Source Attribution**: Full provenance tracking

---

## 2. Benchmark Runner

### 2.1 Architecture

```
tool-benchmark/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── runner.ts             # Benchmark orchestration
│   ├── providers/
│   │   ├── base.ts           # Provider interface
│   │   ├── claude.ts         # Anthropic (Sonnet, Opus)
│   │   ├── openai.ts         # GPT-4, GPT-5
│   │   └── google.ts         # Gemini Pro
│   ├── metrics/
│   │   ├── bleu.ts           # BLEU score
│   │   ├── ter.ts            # Translation Error Rate
│   │   ├── comet.ts          # COMET (neural metric)
│   │   └── custom.ts         # action-translation metrics
│   ├── dataset/
│   │   ├── loader.ts         # Load/validate data
│   │   └── sampler.ts        # Random sampling
│   └── reports/
│       ├── markdown.ts       # Markdown report generator
│       └── json.ts           # JSON export
├── package.json
├── tsconfig.json
└── README.md
```

### 2.2 CLI Interface

```bash
# Run full benchmark
npx tsx src/index.ts benchmark --models claude-sonnet,claude-opus,gpt-4,gemini-pro

# Run specific category
npx tsx src/index.ts benchmark --category terms --models claude-sonnet

# Generate comparison report
npx tsx src/index.ts report --format markdown --output reports/

# Validate dataset
npx tsx src/index.ts validate --data data/
```

### 2.3 Provider Interface

```typescript
interface TranslationProvider {
  name: string;
  model: string;
  
  translate(text: string, options: TranslateOptions): Promise<string>;
  translateBatch(texts: string[], options: TranslateOptions): Promise<string[]>;
  
  estimateCost(texts: string[]): Promise<CostEstimate>;
}

interface TranslateOptions {
  sourceLanguage: 'en' | 'zh';
  targetLanguage: 'en' | 'zh';
  domain?: string;
  glossary?: GlossaryEntry[];
}
```

### 2.4 Metrics

| Metric | Type | Description |
|--------|------|-------------|
| **BLEU** | Automatic | N-gram overlap (industry standard) |
| **TER** | Automatic | Translation Error Rate |
| **COMET** | Neural | Learned quality estimation ([Unbabel/COMET](https://github.com/Unbabel/COMET)) |
| **XCOMET** | Explainable | Quality + error span detection |
| **Glossary Compliance** | Custom | % of key terms correctly translated |
| **Formatting Accuracy** | Custom | MyST/Markdown preservation |

**Implementation Note**: Use `unbabel-comet` Python package for COMET/XCOMET metrics:
```bash
pip install unbabel-comet
comet-score -s src.txt -t hyp.txt -r ref.txt --model Unbabel/XCOMET-XL
```

### 2.5 Output Format

```json
{
  "benchmark_id": "bench-2025-01-15-001",
  "timestamp": "2025-01-15T10:30:00Z",
  "dataset_version": "1.0.0",
  "results": {
    "claude-sonnet-4": {
      "terms": {
        "bleu": 0.85,
        "glossary_compliance": 0.92,
        "count": 1000,
        "cost_usd": 0.15
      },
      "sentences": {
        "bleu": 0.78,
        "comet": 0.89,
        "glossary_compliance": 0.88,
        "count": 500,
        "cost_usd": 0.45
      },
      "paragraphs": {
        "bleu": 0.72,
        "comet": 0.86,
        "formatting_accuracy": 0.95,
        "count": 100,
        "cost_usd": 1.20
      },
      "overall": {
        "weighted_score": 0.84,
        "total_cost_usd": 1.80
      }
    }
  }
}
```

---

## 3. RA Team Coordination

### 3.1 Team Structure

```
Project Lead (QuantEcon)
    │
    ├── Technical Lead (1)
    │   └── Tooling, CI/CD, code review
    │
    ├── Data Team Lead (1)
    │   └── Dataset design, quality control
    │
    └── RA Contributors (4-6)
        ├── Terms specialists (2)
        ├── Sentence specialists (2)
        └── Paragraph specialists (2)
```

### 3.2 Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    RA Contribution Workflow                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. ASSIGN          2. CREATE           3. REVIEW           │
│  ┌─────────┐        ┌─────────┐        ┌─────────┐         │
│  │ GitHub  │───────>│ Branch  │───────>│  PR     │         │
│  │ Issue   │        │ + Edit  │        │ Review  │         │
│  └─────────┘        └─────────┘        └─────────┘         │
│       │                  │                  │               │
│       │                  │                  │               │
│       v                  v                  v               │
│  ┌─────────┐        ┌─────────┐        ┌─────────┐         │
│  │ Task    │        │ JSON    │        │ Peer    │         │
│  │ Tracker │        │ Files   │        │ + Lead  │         │
│  └─────────┘        └─────────┘        └─────────┘         │
│                                              │               │
│                     4. MERGE                 v               │
│                    ┌─────────┐        ┌─────────┐           │
│                    │ Main    │<───────│ Approve │           │
│                    │ Branch  │        │ + Merge │           │
│                    └─────────┘        └─────────┘           │
│                          │                                   │
│                          v                                   │
│                    ┌─────────┐                               │
│                    │ CI/CD   │                               │
│                    │ Validate│                               │
│                    └─────────┘                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 GitHub Repository Setup

**Repository**: `QuantEcon/translation-benchmark` (new repo)

```
translation-benchmark/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── term-addition.yml
│   │   ├── sentence-addition.yml
│   │   └── paragraph-addition.yml
│   ├── workflows/
│   │   ├── validate-data.yml     # PR validation
│   │   ├── run-benchmark.yml     # Weekly benchmark
│   │   └── deploy-dashboard.yml  # GitHub Pages
│   └── CODEOWNERS
├── data/                         # Dataset (see 1.1)
├── tool-benchmark/               # Benchmark runner
├── dashboard/                    # GitHub Pages site
├── CONTRIBUTING.md
└── README.md
```

### 3.4 Task Tracking

**GitHub Projects Board**:

| Column | Description |
|--------|-------------|
| **Backlog** | Unassigned tasks |
| **Assigned** | RA has claimed task |
| **In Progress** | Branch created, work ongoing |
| **In Review** | PR submitted, awaiting review |
| **Done** | Merged to main |

**Issue Labels**:
- `terms`, `sentences`, `paragraphs` - Category
- `economics`, `mathematics`, `statistics` - Domain
- `good-first-issue` - Onboarding tasks
- `needs-review` - Awaiting peer review
- `blocked` - Dependencies or questions

### 3.5 Quality Gates

**PR Checklist**:
- [ ] JSON schema validation passes
- [ ] No duplicate IDs
- [ ] All required fields populated
- [ ] Domain tags from approved taxonomy
- [ ] Human scores provided (sentences/paragraphs)
- [ ] Peer review completed

**CI Validation**:
```yaml
# .github/workflows/validate-data.yml
- name: Validate JSON Schema
  run: npx tsx tool-benchmark/src/index.ts validate

- name: Check for duplicates
  run: npx tsx tool-benchmark/src/index.ts check-duplicates

- name: Lint translations
  run: npx tsx tool-benchmark/src/index.ts lint
```

### 3.6 Onboarding Materials

| Document | Purpose |
|----------|---------|
| `CONTRIBUTING.md` | How to contribute |
| `docs/SCHEMA.md` | Data format reference |
| `docs/TAXONOMY.md` | Domain tags and categories |
| `docs/STYLE-GUIDE.md` | Translation conventions |
| Video walkthrough | 15-min orientation |

---

## 4. Dashboard (GitHub Pages)

### 4.1 Features

1. **Model Comparison**: Side-by-side scores across all models
2. **Category Breakdown**: Terms vs sentences vs paragraphs
3. **Historical Trends**: Score changes over time
4. **Cost Analysis**: Translation cost per model
5. **Detailed Results**: Drill-down into individual examples

### 4.2 Technology Stack

- **Framework**: Static site (Astro or simple HTML/JS)
- **Charts**: Chart.js or D3.js
- **Data**: JSON files generated by benchmark runner
- **Hosting**: GitHub Pages
- **Updates**: Automated via GitHub Actions

### 4.3 Dashboard Mockup

```
┌────────────────────────────────────────────────────────────────┐
│  Translation Benchmark Dashboard           Last run: Jan 15    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Overall Scores by Model                                 │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Claude Opus    ████████████████████████  92.3     │  │  │
│  │  │  Claude Sonnet  ███████████████████████   89.1     │  │  │
│  │  │  GPT-5          ██████████████████████    87.5     │  │  │
│  │  │  Gemini Pro     █████████████████████     85.2     │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐  │
│  │  Category Scores    │  │  Cost Comparison (per 1K items) │  │
│  │  ┌───────────────┐  │  │  ┌───────────────────────────┐  │  │
│  │  │ Terms:   94.2 │  │  │  │ Opus:   $2.40            │  │  │
│  │  │ Sents:   88.5 │  │  │  │ Sonnet: $0.80            │  │  │
│  │  │ Paras:   82.1 │  │  │  │ GPT-5:  $1.20            │  │  │
│  │  └───────────────┘  │  │  │ Gemini: $0.60            │  │  │
│  └─────────────────────┘  │  └───────────────────────────┘  │  │
│                           └─────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Historical Trend (Last 6 Months)                        │  │
│  │         ___________                                      │  │
│  │        /           \___  Claude Opus                     │  │
│  │   ____/                \_____                            │  │
│  │  /                           \___  Claude Sonnet         │  │
│  │  Jul   Aug   Sep   Oct   Nov   Dec                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. Integration with action-translation

### 5.1 Feedback Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    Continuous Improvement                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐      ┌─────────────┐      ┌───────────┐  │
│   │  Benchmark  │─────>│  Identify   │─────>│  Update   │  │
│   │  Results    │      │  Failures   │      │  Prompts  │  │
│   └─────────────┘      └─────────────┘      └───────────┘  │
│          │                    │                    │        │
│          │                    │                    │        │
│          v                    v                    v        │
│   ┌─────────────┐      ┌─────────────┐      ┌───────────┐  │
│   │  Dashboard  │      │  Add to     │      │  Add      │  │
│   │  Tracking   │      │  Glossary   │      │  Tests    │  │
│   └─────────────┘      └─────────────┘      └───────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Prompt Optimization

**Current prompt location**: `src/translator.ts`

**Optimization workflow**:
1. Identify low-scoring categories from benchmark
2. Analyze failure patterns (e.g., technical terms, passive voice)
3. A/B test prompt variations
4. Measure improvement in benchmark scores
5. Deploy winning prompts

**Example improvement areas**:
- Mathematical notation handling
- Economics jargon consistency
- Academic register preservation
- MyST directive translation

### 5.3 Glossary Expansion

**Process**:
1. Benchmark identifies missed terms
2. Add to `tool-benchmark/data/terms/`
3. After review, export to `glossary/zh-cn.json`
4. Re-run benchmark to validate

**Sync script**:
```bash
# Export validated terms to main glossary
npx tsx tool-benchmark/src/index.ts export-glossary \
  --source data/terms/ \
  --target ../../glossary/zh-cn.json
```

### 5.4 Regression Testing

**Integration with existing tests**:
```typescript
// src/__tests__/benchmark-regression.test.ts
describe('Benchmark Regression', () => {
  it('maintains glossary compliance above 90%', async () => {
    const results = await runQuickBenchmark('terms', 'claude-sonnet');
    expect(results.glossary_compliance).toBeGreaterThan(0.9);
  });
  
  it('maintains BLEU score above 0.75 for paragraphs', async () => {
    const results = await runQuickBenchmark('paragraphs', 'claude-sonnet');
    expect(results.bleu).toBeGreaterThan(0.75);
  });
});
```

---

## 6. Timeline & Milestones

### Phase 1: Foundation (Weeks 1-4)

| Week | Deliverable | Owner |
|------|-------------|-------|
| 1 | Repository setup, schema design | Tech Lead |
| 2 | Basic benchmark runner (Claude only) | Tech Lead |
| 2 | RA onboarding, CONTRIBUTING.md | Data Lead |
| 3 | Initial terms (500) from glossary expansion | RA Team |
| 4 | First benchmark run, baseline established | Tech Lead |

### Phase 2: Dataset Expansion (Weeks 5-10)

| Week | Deliverable | Owner |
|------|-------------|-------|
| 5-6 | Sentence dataset (250) | RA Team |
| 7-8 | Paragraph dataset (50) | RA Team |
| 9 | Multi-model support (GPT, Gemini) | Tech Lead |
| 10 | Complete terms (1000) | RA Team |

### Phase 3: Dashboard & Integration (Weeks 11-14)

| Week | Deliverable | Owner |
|------|-------------|-------|
| 11-12 | GitHub Pages dashboard | Tech Lead |
| 13 | action-translation integration | Tech Lead |
| 14 | Full benchmark run, final report | All |

### Milestones

- [ ] **M1**: Repository live with CI/CD (Week 1)
- [ ] **M2**: First benchmark baseline (Week 4)
- [ ] **M3**: 1000 terms validated (Week 10)
- [ ] **M4**: Dashboard live (Week 12)
- [ ] **M5**: Integration complete (Week 14)

---

## 7. Budget & Resources

### API Costs (Estimated)

| Model | Cost per 1K tokens | Est. Monthly |
|-------|-------------------|--------------|
| Claude Opus | $15/$75 (in/out) | $50 |
| Claude Sonnet | $3/$15 (in/out) | $20 |
| GPT-4 | $10/$30 (in/out) | $40 |
| Gemini Pro | $1.25/$5 (in/out) | $15 |
| **Total** | | **~$125/month** |

### RA Time Allocation

| Task | Hours/Week | Duration |
|------|------------|----------|
| Terms entry | 4h | 10 weeks |
| Sentences entry | 4h | 6 weeks |
| Paragraphs entry | 4h | 4 weeks |
| Review | 2h | Ongoing |
| **Total per RA** | **~6h/week** | |

---

## 8. Success Criteria

### Quantitative

- [ ] 1,000+ validated terms
- [ ] 500+ validated sentences
- [ ] 100+ validated paragraphs
- [ ] 4+ models benchmarked
- [ ] Dashboard with historical tracking
- [ ] 90%+ glossary compliance maintained

### Qualitative

- [ ] RA team productive and engaged
- [ ] Reproducible benchmark process
- [ ] Clear quality improvement in action-translation
- [ ] Documentation comprehensive

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| RA availability fluctuation | Dataset delays | Flexible deadlines, buffer time |
| API cost overruns | Budget exceeded | Cost caps, sampling strategies |
| Quality inconsistency | Unreliable benchmark | Strict review process, CI validation |
| Model API changes | Benchmark breaks | Provider abstraction layer |
| Scope creep | Timeline slips | Fixed milestones, MVP focus |

---

## 10. Open Questions

1. **Bidirectional translation?** Should we include ZH→EN in addition to EN→ZH?
2. **Additional languages?** Persian (fa), Japanese (ja) in future phases?
3. **External collaboration?** Partner with other translation research groups?
4. **Publication potential?** Academic paper on benchmark results?

---

## Appendix A: Taxonomy Reference

### Domain Tags

```
economics/
├── microeconomics
├── macroeconomics
├── econometrics
├── game-theory
├── dynamic-programming
├── asset-pricing
└── monetary-economics

mathematics/
├── linear-algebra
├── calculus
├── optimization
├── probability
├── real-analysis
└── numerical-methods

statistics/
├── estimation
├── hypothesis-testing
├── bayesian
├── time-series
└── regression
```

### Difficulty Levels

| Level | Description | Example |
|-------|-------------|---------|
| **basic** | Undergraduate intro | "supply and demand" |
| **intermediate** | Upper undergrad | "Bellman equation" |
| **advanced** | Graduate level | "Kolmogorov forward equation" |

---

## Appendix B: Related Documents

**Internal**:
- [ARCHITECTURE.md](../ARCHITECTURE.md) - action-translation architecture
- [TESTING.md](../TESTING.md) - Current testing approach
- [CLAUDE-MODELS.md](../CLAUDE-MODELS.md) - Model information
- [glossary/zh-cn.json](../../glossary/zh-cn.json) - Current glossary

---

## Appendix C: External Resources

### Existing Benchmarks & Datasets

| Resource | URL | Use For |
|----------|-----|---------|
| **WMT Conference** | [statmt.org/wmt24](http://www2.statmt.org/wmt24/) | Evaluation methodology, metrics shared task |
| **XTREME** | [github.com/google-research/xtreme](https://github.com/google-research/xtreme) | Cross-lingual benchmark reference |
| **OPUS** | [opus.nlpl.eu](https://opus.nlpl.eu/) | Parallel corpora mining |
| **Hugging Face Datasets** | [huggingface.co/datasets](https://huggingface.co/datasets?task_categories=task_categories:translation) | Dataset hosting, community standards |
| **FLORES+** | [huggingface.co/datasets/openlanguagedata/flores_plus](https://huggingface.co/datasets/openlanguagedata/flores_plus) | Multi-language evaluation sets |

### Evaluation Tools

| Tool | URL | Purpose |
|------|-----|---------|
| **COMET** | [github.com/Unbabel/COMET](https://github.com/Unbabel/COMET) | Neural MT evaluation metric |
| **XCOMET** | [huggingface.co/Unbabel/XCOMET-XL](https://huggingface.co/Unbabel/XCOMET-XL) | Explainable quality + error detection |
| **SacreBLEU** | [github.com/mjpost/sacrebleu](https://github.com/mjpost/sacrebleu) | Reproducible BLEU scoring |
| **BERTScore** | [github.com/Tiiiger/bert_score](https://github.com/Tiiiger/bert_score) | Semantic similarity metric |

### Key Papers

1. **COMET** - Rei et al. (2020) "COMET: A Neural Framework for MT Evaluation" - EMNLP
2. **XCOMET** - Guerreiro et al. (2023) "xCOMET: Transparent MT Evaluation through Fine-grained Error Detection"
3. **WMT Metrics** - Kocmi et al. (2024) "Findings of the WMT 2024 Shared Task on Machine Translation"
4. **XTREME** - Hu et al. (2020) "XTREME: A Massively Multilingual Multi-task Benchmark"

---

**Document Version**: 1.1  
**Last Updated**: December 2025  
**Author**: QuantEcon Team
