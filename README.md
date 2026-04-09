# action-translation

A GitHub Action and CLI tool for managing translations of MyST Markdown documents using Claude AI.

**Version**: v0.11.2 | **Tests**: 909 (39 suites) | [Full Documentation](docs/)

## What it does

**GitHub Action** — Runs in your CI pipeline with two modes:
- **Sync mode**: When a PR is merged in the English source repo, automatically translates changed sections and opens a PR in the target language repo.
- **Review mode**: When a translation PR is opened, posts an AI quality review with scores and suggestions.

**CLI tool (`translate`)** — Eight commands for translation management:
- `status` — Fast structural diagnostic (no LLM)
- `backward` — Discover improvements in translations worth backporting to the source
- `review` — Interactive walk-through of backward suggestions, creates GitHub Issues
- `forward` — Recover from drift via whole-file RESYNC
- `init` — Bulk-translate an entire project from scratch
- `setup` — Scaffold a new target translation repository
- `doctor` — Health check for target translation repos
- `headingmap` — Generate heading-maps from source/target comparison (no LLM)

## Quick start

### GitHub Action

```yaml
# .github/workflows/sync-translations.yml (in SOURCE repo)
name: Sync Translations
on:
  pull_request:
    types: [closed]
    paths: ['lectures/**/*.md']
  issue_comment:
    types: [created]

jobs:
  sync:
    if: >
      (github.event_name == 'pull_request' && github.event.pull_request.merged == true) ||
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '\translate-resync'))
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: quantecon/action-translation@v0.11
        with:
          mode: sync
          target-repo: 'quantecon/lecture-python.zh-cn'
          target-language: 'zh-cn'
          docs-folder: 'lectures/'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.TRANSLATION_PAT }}
```

The `issue_comment` trigger enables the `\translate-resync` command — comment it on any merged PR to re-trigger sync (useful for recovering from failures). To retrigger only one language, add the code: `\translate-resync fa` or `\translate-resync zh-cn`.

### CLI

```bash
npx translate status -s ~/repos/lecture-python-intro -t ~/repos/lecture-intro.zh-cn
npx translate backward -s SOURCE -t TARGET -o reports/
npx translate review reports/my-report --dry-run
npx translate forward -s SOURCE -t TARGET -f intro.md
npx translate init -s SOURCE -t TARGET --target-language zh-cn --dry-run
```

See the [Quickstart guide](docs/user/quickstart.md) for full setup instructions.

## Documentation

| Section | Description |
|---------|-------------|
| [Quickstart](docs/user/quickstart.md) | Get running in 3 steps |
| [Action Reference](docs/user/action-reference.md) | All inputs, outputs, workflow examples |
| [CLI Reference](docs/user/cli-reference.md) | All commands, options, examples |
| [Glossary](docs/user/glossary.md) | Built-in and custom glossaries |
| [Heading Maps](docs/user/heading-maps.md) | Cross-language section matching |
| [Language Config](docs/user/language-config.md) | Language-specific rules |
| [FAQ](docs/user/faq.md) | Common questions and troubleshooting |
| [Architecture](docs/developer/architecture.md) | Design, modules, data flow |
| [Testing](docs/developer/testing.md) | Test structure and how to write tests |
| [Roadmap](docs/developer/roadmap.md) | Future features under consideration |

## Development

```bash
npm install          # Install dependencies
npm test             # Run all 909 tests
npm run build        # Compile TypeScript
npm run package      # Bundle for distribution
```

## License

MIT

## Acknowledgements

- [@HumphreyYang](https://github.com/HumphreyYang)
- [@nisha617](https://github.com/nisha617)
