---
marp: true
paginate: true
---

<style>
.columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2em;
}
</style>

<!-- _class: lead -->

# Translation Action

**AI-Powered Translation Automation for Lectures**

GitHub Action • Claude Sonnet 4.5 • MyST Markdown

_QuantEcon Project_

---

# What It Does

**Automatically translates and reviews lectures when source content changes**

Monitor merged PRs → Detect changes → Translate → Create PR → AI Review

## Key Capabilities

✓ **Smart Diff Translation** – Only translates modified sections
✓ **MyST Markdown Aware** – Preserves code, math, directives
✓ **Consistent Terminology** – Built-in glossaries (357 terms)
✓ **AI-Powered Review** – Automated quality assessment with scoring
✓ **Language Extensible** – Configurable rules per target language

---

# How It Works

## Section-Based Translation Approach

<div class="columns">
<div>

### ❌ Problem: Block-Level

- Can't match across languages
- Loses translation context
- Complex mapping logic

</div>
<div>

### ✅ Solution: Section-Based

- Match by position
- Translate full sections
- Simple: Add, Update, Delete

</div>
</div>

---

# Translation Workflow

![width:1100px](diagrams/workflow.png)

---

# LLM-Powered Translation (Claude Sonnet 4.5)

<div class="columns">
<div>

### UPDATE Mode
_(changed sections)_

- Sends: old EN + new EN + current translation
- Claude understands what changed
- Preserves style and terminology
- Uses glossary for consistency

</div>
<div>

### NEW Mode
_(new sections)_

- Translates with full context
- Uses glossary for consistency
- Maintains document structure

</div>
</div>

---

# Two Operational Modes

<div class="columns">
<div>

### 🔄 Sync Mode
_(runs in SOURCE repo)_

- Monitors merged PRs
- Detects changed sections
- Translates incrementally
- Creates PR in target repo
- Updates heading-maps

</div>
<div>

### 📝 Review Mode
_(runs in TARGET repo)_

- Evaluates translation PRs
- Scores: accuracy, fluency, terminology
- Checks diff correctness
- Posts review comments
- PASS / WARN / FAIL verdicts

</div>
</div>

---

# Status & Getting Started

<div class="columns">
<div>

## Current Status

📦 **v0.7.0** – Testing & Development
🔄 **Two Modes**: Sync + Review
✅ 183 tests passing
🧪 24 GitHub test scenarios

## Use Cases

- Multi-language documentation
- Educational content
- OSS localization

</div>
<div>

## Resources

**GitHub**: QuantEcon/action-translation

**Docs**: 11 guides in `docs/`

**Tools**: Bulk translator, test framework

**License**: MIT

</div>
</div>
