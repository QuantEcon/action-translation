# Contributing

Thanks for your interest in improving **action-translation**! This guide covers
the local workflow for code, tests, and documentation.

## Prerequisites

- Node.js 24 (matches the GitHub Actions `node24` runtime)
- npm

## Setup

```bash
git clone https://github.com/QuantEcon/action-translation.git
cd action-translation
npm install
```

## Development workflow

```bash
npm test             # Run the full Jest suite (~1005 tests)
npm run lint         # ESLint (must pass with no errors)
npm run build        # tsc compile (dist/) + esbuild bundle (dist-action/index.js)
npm run build:cli    # CLI-only TypeScript compile (dist/)
npm run format       # Prettier
```

Before opening a pull request, make sure `npm run lint`, `npm test`, and
`npm run build` all succeed. CI runs the same checks on every PR.

### Rebuilding the action bundle

The GitHub Action runs from the committed `dist-action/index.js` bundle. If you
change any source under `src/`, **rebuild and commit the bundle**:

```bash
npm run build
git add dist-action
```

CI fails if `dist-action/` is out of date relative to the source.

## Pull requests

1. Branch from `main` (e.g. `fix/short-description` or `feat/short-description`).
2. Keep changes focused; add or update tests for behavior changes.
3. Update relevant docs under [`docs/`](docs/) and the [CHANGELOG](CHANGELOG.md)
   (under the `[Unreleased]` heading).
4. Ensure lint, tests, and build pass.
5. Open the PR against `main` with a clear description.

## Tests

Tests live in `src/__tests__/` and `src/cli/__tests__/`. See
[docs/developer/testing.md](docs/developer/testing.md) for structure and
conventions on writing new tests.

## Contributing glossary terms

Translation glossaries live in [`glossary/`](glossary/). See
[glossary/README.md](glossary/README.md) for the file format, quality
guidelines, and the process for adding terms or new languages.

## Architecture

For a tour of the modules, operational modes, and data flow, read
[docs/developer/architecture.md](docs/developer/architecture.md).

## License

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](https://opensource.org/licenses/MIT).
