# Project C: Glossary Expansion & Academic Terminology

> **Type**: Domain expertise, bilingual curation  
> **Ideal RA profile**: Strong economics background, bilingual fluency (English + Chinese), familiarity with Chinese academic textbooks  
> **Time**: 4–7 hrs/week for 12 weeks  
> **Repository**: Glossary lives in `QuantEcon/action-translation` (`glossary/zh-cn.json`); extended dataset in `QuantEcon/project-translation-benchmark`

## Goal

Expand the translation glossary from 357 terms to 1,000+ and build a structured database of academic economics language — not just single terms, but the phrases, expressions, and conventions that characterise technical writing in economics and mathematics.

## Why This Matters

When `action-translation` translates a lecture, it uses a glossary to ensure technical terms are translated consistently. But 357 terms is thin coverage for the breadth of QuantEcon's content. When a term isn't in the glossary:

- The model picks its own translation, which may differ across sections
- Common alternatives may be used inconsistently (e.g., 最优化 vs. 优化)
- Specialised terms may be translated too literally

Beyond single terms, academic writing uses stock phrases and constructions that have standard Chinese equivalents. Capturing these makes translations read like real textbooks, not machine output.

## What You'll Build

### 1. Expanded Term Glossary

The existing glossary (`glossary/zh-cn.json`) has 357 entries in this format:

```json
{
  "en": "Bellman equation",
  "zh-cn": "贝尔曼方程",
  "context": "dynamic programming"
}
```

Your job: add 600+ more terms, organised by domain. Focus on terms that appear in QuantEcon lectures.

**Domains to cover** (pick based on your interest):

| Domain | Example Terms |
|--------|--------------|
| Dynamic programming | value function, policy function, contraction mapping |
| Linear algebra | eigenvalue, spectral radius, positive definite |
| Probability & statistics | law of large numbers, central limit theorem, conditional expectation |
| Game theory | Nash equilibrium, dominant strategy, subgame perfect |
| General equilibrium | Walras' law, Pareto optimal, competitive equilibrium |
| Macroeconomics | aggregate demand, fiscal multiplier, Phillips curve |
| Econometrics | OLS, instrumental variable, heteroskedasticity |
| Time series | autoregressive, stationarity, impulse response |
| Asset pricing | risk-neutral pricing, stochastic discount factor, no-arbitrage |
| Optimal control | Hamiltonian, Pontryagin maximum principle, transversality condition |
| Finance | present value, yield curve, Black-Scholes |

### 2. Academic Phrase Database

Go beyond single terms. Capture common academic phrases and their standard Chinese translations:

**Transitional & logical phrases:**

| English | Chinese | Context |
|---------|---------|---------|
| It can be shown that... | 可以证明... | proofs |
| Without loss of generality | 不失一般性 | proofs |
| Under the assumption that... | 在...的假设下 | model setup |
| By the law of large numbers | 由大数定律 | probability |
| It follows that... | 由此可得... | derivations |
| In what follows, we... | 在接下来的内容中，我们... | structure |
| Consider the following problem | 考虑如下问题 | problem setup |
| The proof is left as an exercise | 证明留作练习 | exercises |

**Mathematical phrasing:**

| English | Chinese | Context |
|---------|---------|---------|
| Let $x$ denote... | 设 $x$ 表示... | definitions |
| Suppose that... | 假设... | assumptions |
| It suffices to show that... | 只需证明... | proofs |
| which completes the proof | 证毕 | proofs |
| the right-hand side of | 右边的 / 等式右边 | equations |

**Economics-specific phrasing:**

| English | Chinese | Context |
|---------|---------|---------|
| the representative agent | 代表性个体 | macro models |
| the first-order condition | 一阶条件 | optimisation |
| in steady state | 在稳态下 | dynamic models |
| the budget constraint | 预算约束 | consumer theory |

Store these in a separate JSON file in the benchmark repo:

```json
{
  "id": "phrase-001",
  "en": "Without loss of generality",
  "zh": "不失一般性",
  "category": "proof-language",
  "usage_context": "Used before simplifying assumptions in proofs",
  "source": "standard mathematical writing"
}
```

### 3. Economist Names

Standardise translations of economist/mathematician names that appear in QuantEcon lectures:

| English | Chinese | Notes |
|---------|---------|-------|
| Richard Bellman | 理查德·贝尔曼 | Dynamic programming |
| Kenneth Arrow | 肯尼斯·阿罗 | General equilibrium |
| Gérard Debreu | 热拉尔·德布鲁 | General equilibrium |
| John Nash | 约翰·纳什 | Game theory |
| Thomas Sargent | 托马斯·萨金特 | Macroeconomics |
| Robert Lucas | 罗伯特·卢卡斯 | Rational expectations |

Some names have multiple accepted transliterations — document the most standard one and note alternatives.

### 4. Cross-Reference with Chinese Textbooks

To ensure your translations match what students actually encounter, cross-reference with standard Chinese economics and mathematics textbooks:

- 高级宏观经济学 (Advanced Macroeconomics) — Romer / 戴维·罗默
- 微观经济学：现代观点 (Microeconomics) — Varian / 范里安
- 概率论与数理统计 (Probability and Statistics) — standard university textbooks
- 高等数学 (Advanced Mathematics) — standard university textbooks

This doesn't mean reading entire textbooks — skim the table of contents and key term definitions to verify that your translations match the accepted Chinese academic standard.

## Week-by-Week Plan

### Weeks 1–2: Audit Existing Glossary

- [ ] Read through all 357 terms in `glossary/zh-cn.json`
- [ ] Flag any terms with incorrect or non-standard translations
- [ ] Note which QuantEcon topic areas have thin coverage
- [ ] Pick 2–3 domains to focus on based on your interest

### Weeks 3–5: Term Expansion (First Batch)

- [ ] Add 150+ new terms (aim for 500 total in glossary)
- [ ] Focus on your chosen domains
- [ ] Cross-reference with Chinese textbooks for standard translations
- [ ] Submit as PRs to `action-translation` for review

### Weeks 6–8: Academic Phrases & Names

- [ ] Build the academic phrase database (100+ phrases)
- [ ] Compile economist/mathematician name translations (50+)
- [ ] Store in `project-translation-benchmark` data files
- [ ] Continue adding terms (target: 700 total)

### Weeks 9–10: Cross-Reference & Validation

- [ ] Cross-reference all terms against 2–3 standard Chinese textbooks
- [ ] Resolve any conflicts (where multiple translations exist, document why you chose one)
- [ ] Peer review with bilingual team members (Project B RA if available)

### Weeks 11–12: Coverage Report & Handoff

- [ ] Produce a domain coverage report: which QuantEcon topics have good terminology coverage?
- [ ] Submit final glossary expansion PR (target: 1,000 terms)
- [ ] Export validated phrase data for use in Project A's benchmark dataset
- [ ] Document any terms you couldn't resolve (for future work)

## Deliverables

1. **Expanded glossary** — `glossary/zh-cn.json` grown from 357 to 1,000+ terms via PRs to `action-translation`
2. **Academic phrase database** — JSON file with 100+ standard academic phrases and their Chinese equivalents
3. **Economist names list** — Standardised name translations for economists/mathematicians in QuantEcon content
4. **Domain coverage report** — Which topic areas have good coverage, which need more work
5. **Textbook cross-reference notes** — Documentation of which Chinese textbooks were consulted and any translation conflicts found

## Quality Standards

- **Every term** must include a `context` field indicating the domain
- **Alternatives** should be noted when multiple translations exist (e.g., 最优化 vs. 优化)
- **Source** — note where you found or verified the translation (textbook, standard usage, etc.)
- **Peer review** — all PRs reviewed by at least one other bilingual team member before merge

## How Your Work Connects to the Other Projects

- **→ Project A**: Your terms become part of the benchmark test dataset. Glossary compliance scoring uses your terms as ground truth.
- **→ Project B**: When the PR reviewer finds mistranslated terms, they'll flag them for you to add. When you add terms, future translations improve.
- **← Project B**: The PR reviewer will identify commonly mistranslated terms that need glossary entries — check in regularly.

## Optional Coding Extensions

If you want to do some programming:

- Write a **glossary coverage checker** — given a QuantEcon lecture, report which technical terms appear in it and which are/aren't in the glossary
- Build a **term frequency analyser** — scan all QuantEcon lectures and rank terms by frequency to prioritise which to add first
- Create a **glossary lookup tool** — a simple web page or CLI that searches the glossary

## Getting Started

1. Open `glossary/zh-cn.json` and read through the existing 357 terms
2. Browse a QuantEcon lecture series you're interested in
3. Start noting terms that appear in the lectures but aren't in the glossary
4. Pick your first domain and begin adding terms
5. Submit your first small PR (10–20 terms) to get feedback on format and quality

## Resources

- [QuantEcon Lectures (Python)](https://python.quantecon.org/) — source content
- [QuantEcon Lectures (Advanced)](https://python-advanced.quantecon.org/) — more advanced topics
- Current glossary: `glossary/zh-cn.json` in this repository
- [Glossary README](../../glossary/README.md) — format documentation
- Standard Chinese economics textbooks (see cross-reference section above)
