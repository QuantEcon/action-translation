# tool-onboarding

> ⚠️ **DEPRECATED - FOR REFERENCE ONLY**
>
> This tool is no longer actively developed. Its functionality has been superseded by the
> **`translate` CLI** built into action-translation (`src/cli/`), which provides:
> - **Section-based analysis** instead of block-by-block matching
> - **Integrated CLI** — `translate backward`, `translate forward`, `translate status`
> - **Better accuracy** — LLM evaluates whole sections, not individual code blocks
> - **Shared modules** — reuses parser.ts, heading-map.ts from action-translation
>
> **Why deprecated**: The block-level divergence mapping approach breaks when code blocks
> are added or deleted in the target. See [feedback in issue #677](https://github.com/QuantEcon/lecture-python-intro/issues/677).
>
> For a detailed record of approaches tried and lessons learned, see
> [docs/developer/legacy-tools.md](../docs/developer/legacy-tools.md).

---

CLI tool to check translation alignment between source and target repositories using a **hybrid analysis approach**: deterministic code comparison + Claude AI for prose.

## Purpose

Analyzes existing translation repositories to determine if they are ready for the `action-translation` sync workflow. Compares source documents (English) with translated documents to identify:

- ✅ **Aligned** files ready for automatic sync
- 📋 **Review** files with drift detected - needs human decision on sync direction
- 📄 **Translate** files in source only - needs translation
- 🎯 **Target-only** files to consider adding to source

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
export ANTHROPIC_API_KEY=your_api_key

node dist/index.js \
  -s /path/to/source-repo \
  -t /path/to/target-repo \
  -d lectures \
  -l zh-cn \
  -o reports
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --source <path>` | Source repository path | **required** |
| `-t, --target <path>` | Target repository path | **required** |
| `-d, --docs-folder <folder>` | Docs folder within repos | `lectures` |
| `-l, --language <code>` | Target language ISO code | `zh-cn` |
| `-m, --model <model>` | Claude model to use | `claude-sonnet-4-20250514` |
| `-o, --output <path>` | Output directory for reports | `./reports` |
| `-f, --file <filename>` | Analyze only this specific file | (all files) |
| `--limit <n>` | Limit files to compare (for testing) | (all files) |
| `--code-only` | Skip prose analysis (no API calls) | false |
| `--check-config` | Include config file analysis | false |

### Language Codes

| Code | Language |
|------|----------|
| `zh-cn` | Simplified Chinese |
| `zh-tw` | Traditional Chinese |
| `ja` | Japanese |
| `ko` | Korean |
| `es` | Spanish |
| `fr` | French |
| `de` | German |
| `fa` | Farsi (Persian) |

## How It Works

### Hybrid Analysis Approach

**1. Code Analysis (Deterministic)**
- Extracts code blocks from markdown
- Compares blocks by position using divergence mapping
- Normalizes comments/strings for fair comparison
- Detects i18n-only changes (font config) as acceptable

**2. Prose Analysis (Claude AI)**
- Compares section headings and prose content
- Evaluates translation accuracy
- Classifies issues as TITLE, CONTENT, or both

### Code Block Status Types

| Status | Meaning |
|--------|---------|
| 🟢 ALIGNED | Exact or normalized match |
| 🟡 MODIFIED | Code logic differs |
| 🔴 MISSING | Block missing in target |
| 🔵 INSERTED | Extra block in target |
| 🔵 +i18n | i18n setup block (acceptable) |

### Action Types

| Action | Direction | When to Use |
|--------|-----------|-------------|
| **SYNC** | SOURCE → TARGET | Update target from source |
| **BACKPORT** | TARGET → SOURCE | Merge target improvements to source |
| **ACCEPT LOCALISATION** | Keep target | i18n-specific change (fonts, locale) |
| **MANUAL REVIEW** | Human decision | Conflict too complex for simple action |

## Example Output

```
🚀 Onboarding Analysis

Source: lecture-python-intro
Target: lecture-intro.zh-cn
Docs: lectures
Language: Simplified Chinese (zh-cn)

Processing: cagan_adaptive.md → ⚠️ review

📊 Summary:
  Aligned: 0
  Review: 1

🎯 Actions:
  SYNC: 2
  BACKPORT: 8
  ACCEPT: 0
  MANUAL: 2
```

## Testing

```bash
# Run test suite (84 tests across 5 test files)
npm test

# Run with coverage
npm test -- --coverage

# Watch mode for development
npm test -- --watch
```

Test with a single file:
```bash
node dist/index.js -s SOURCE -t TARGET -d lectures -l zh-cn -f intro.md
```

Test code-only (no API calls):
```bash
node dist/index.js -s SOURCE -t TARGET -d lectures -l zh-cn --code-only
```

## Cost

Approximate cost for a typical lecture series (51 files):

- **Model**: Claude Sonnet 4
- **Total**: ~**$2.20** per full analysis

Use `-f` or `--limit` to test on a subset before running full analysis.

## Architecture

Modular implementation with clear separation of concerns:

```
src/
├── index.ts          # CLI entry point & orchestration (329 lines)
├── types.ts          # TypeScript interfaces (147 lines)
├── constants.ts      # Thresholds, patterns, prompts (167 lines)
├── discovery.ts      # File discovery & git metadata (139 lines)
├── extraction.ts     # Code block extraction (199 lines)
├── analysis/
│   ├── code.ts      # Deterministic code comparison (283 lines)
│   ├── prose.ts     # Claude prose analysis (215 lines)
│   └── config.ts    # Config file comparison (218 lines)
├── decision.ts       # Convert analysis to decisions (232 lines)
└── report.ts         # Report generation (388 lines)
```

**Total**: ~2,300 lines across 10 modules

### Why Hybrid?

1. **Code requires accuracy** - Claude can hallucinate about code; deterministic comparison is 100% accurate
2. **Prose requires understanding** - Translation nuances need AI judgment
3. **Fast + Accurate** - Code analysis is instant; Claude focuses on prose only
4. **Clear reporting** - Separate sections for code and prose issues

## Report Format

Reports are generated in `reports/{source}↔{target}/`:

```
reports/
└── lecture-python-intro↔lecture-intro.zh-cn/
    ├── summary.md          # Overview with file table
    ├── cagan_adaptive.md   # Per-file decisions
    └── ...
```

Each file report includes:
- **Summary table**: Region-by-region status
- **Code Analysis**: Block comparison with issues
- **Prose Analysis**: Section-by-section review
- **Decisions**: Action checkboxes with recommendations

## Development

```bash
# Build
npm run build

# Run tests
npm test

# Run directly with ts-node
npm run onboard -- -s SOURCE -t TARGET -l zh-cn
```

## Related Tools

- **action-translation**: Automated sync on PR merge (main project)
- **tool-bulk-translator**: Creates initial translations from scratch
- **tool-onboarding**: Assesses existing manual translations (this tool)

## License

MIT
