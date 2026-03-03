# Resync CLI

Analyze translated documents for improvements worth backporting to the English source.

## Quick Start

### 1. Clone both repos locally

```bash
# SOURCE (English)
git clone https://github.com/QuantEcon/lecture-python-intro.git

# TARGET (translated)
git clone https://github.com/QuantEcon/lecture-python-intro.zh-cn.git
```

### 2. Build the CLI

```bash
cd /path/to/action-translation
npm install
npm run build:cli
```

### 3. Run backward analysis

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Analyze a single file
node dist/cli/index.js backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -f solow.md

# Use --test mode (no API key needed, deterministic mock responses)
node dist/cli/index.js backward \
  -s ~/repos/lecture-python-intro \
  -t ~/repos/lecture-python-intro.zh-cn \
  -f solow.md \
  --test
```

Reports are written to `./reports/` by default.

## Commands

### `backward`

Analyzes a translated document for improvements worth suggesting back to the English source.

```
resync backward [options]

Options:
  -s, --source <path>         Path to SOURCE (English) repository (required)
  -t, --target <path>         Path to TARGET (translated) repository (required)
  -f, --file <filename>       File to analyze, relative to docs-folder (required)
  -d, --docs-folder <folder>  Documentation folder within repos (default: "lectures")
  -l, --language <code>       Target language code (default: "zh-cn")
  -o, --output <dir>          Output directory for reports (default: "./reports")
  -m, --model <model>         Claude model (default: "claude-sonnet-4-5-20250929")
  --json                      Output reports as JSON instead of Markdown
  --test                      Use deterministic mock responses (no LLM calls)
  --min-confidence <number>   Minimum confidence for reporting (default: "0.6")
```

**How it works** — two-stage pipeline:

1. **Stage 1 (Document Triage)**: One LLM call compares the entire source and target document. If the translation is faithful (`IN_SYNC`), no further analysis is needed. This is recall-biased — when in doubt, it flags the file for closer inspection.

2. **Stage 2 (Section Analysis)**: For flagged files, sections are matched by position (with heading-map validation), and each matched pair gets one LLM call. Produces structured suggestions with category, confidence, and specific changes.

## Examples

### Test with the test repositories

```bash
# Clone test repos
git clone https://github.com/QuantEcon/test-translation-sync.git
git clone https://github.com/QuantEcon/test-translation-sync.zh-cn.git

# Run in test mode (no API calls)
node dist/cli/index.js backward \
  -s test-translation-sync \
  -t test-translation-sync.zh-cn \
  -f intro.md \
  --test
```

### Test with QuantEcon lecture repos

```bash
# Clone lecture repos
git clone https://github.com/QuantEcon/lecture-python-intro.git
git clone https://github.com/QuantEcon/lecture-python-intro.zh-cn.git

# Analyze a specific lecture (requires ANTHROPIC_API_KEY)
node dist/cli/index.js backward \
  -s lecture-python-intro \
  -t lecture-python-intro.zh-cn \
  -f solow.md

# JSON output for programmatic use
node dist/cli/index.js backward \
  -s lecture-python-intro \
  -t lecture-python-intro.zh-cn \
  -f solow.md \
  --json
```

### Use a different model

```bash
node dist/cli/index.js backward \
  -s lecture-python-intro \
  -t lecture-python-intro.zh-cn \
  -f solow.md \
  -m claude-sonnet-4-5-20250929
```

### Custom docs folder

```bash
# If docs are in a different folder than "lectures"
node dist/cli/index.js backward \
  -s /path/to/source \
  -t /path/to/target \
  -f my-doc.md \
  -d docs
```

## Report Format

### Markdown (default)

Reports are written to `{output}/{filename}-backward.md`:

```markdown
# Backward Analysis: solow.md

**Generated**: 2026-03-03T10:00:00.000Z
**SOURCE last modified**: 2024-06-01 by Alice
**TARGET last modified**: 2024-09-15 by Bob

## Stage 1: Document Triage
**Verdict**: CHANGES_DETECTED
**Notes**: Formula correction found in Steady State section.

## Suggestions (1 found)

### ## Steady State (HIGH confidence: 0.92)
**Category**: BUG_FIX

The steady state formula was corrected to include the technology parameter A.

**formula correction**:
*Current English*:
> k* = (s/δ)^(1/(1-α))

*Suggested improvement*:
> k* = (sA/δ)^(1/(1-α))

**Reasoning**: The translation corrected a missing technology parameter.
```

### JSON (`--json`)

Same data structure as `BackwardReport` type — useful for programmatic consumption.

## Test Mode

Use `--test` to run the full pipeline with deterministic mock responses:

- No API key required
- No LLM calls made
- Files with "aligned" or "intro" in the name → `IN_SYNC`
- All other files → `CHANGES_DETECTED` (Stage 1), `NO_BACKPORT` (Stage 2)
- Useful for CI, development, and verifying the pipeline works end-to-end

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (unless `--test`) | Claude API key for LLM calls |
