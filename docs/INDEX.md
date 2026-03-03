# Documentation Index

Complete documentation for the Translation Action (GitHub Action).

**Current Version**: v0.8.0  
**Status**: Resync CLI Phase 1 Complete

---

## 🚀 Getting Started

**New to the project?** Start here:

1. **[Quick Start Guide](QUICKSTART.md)** - Get up and running in 10 minutes
2. **[Test Repositories Setup](TEST-REPOSITORIES.md)** - Create isolated test repos for safe validation
3. **[Main README](../README.md)** - Project overview, features, and usage

---

## 📐 Design & Architecture

**Understanding the system:**

1. **[Project Design](PROJECT-DESIGN.md)** - Design decisions and philosophy
2. **[Architecture](ARCHITECTURE.md)** - System architecture and component design
3. **[Sync Workflow](SYNC-WORKFLOW.md)** - Complete sync lifecycle and all modes
4. **[Implementation](IMPLEMENTATION.md)** - Comprehensive technical guide (~3,000 lines of code)

---

## 📚 Feature Guides

**Deep dives into key features:**

1. **[Heading Maps](HEADING-MAPS.md)** - Robust cross-language section matching system
2. **[Claude Models](CLAUDE-MODELS.md)** - Model selection and configuration
3. **[Translation Glossary](../glossary/README.md)** - Built-in glossary system (357 terms for zh-cn, fa)
4. **[Language Configuration](IMPLEMENTATION.md#language-configuration)** - Language-specific translation rules (v0.5.1)
5. **Review Mode** - AI-powered translation quality assessment (v0.7.0)

---

## 🧪 Testing & Development

**For contributors and testers:**

1. **[Testing Guide](TESTING.md)** - Test suite design and how to write tests (409 tests)
2. **[Test Repositories](TEST-REPOSITORIES.md)** - GitHub integration testing setup (24 scenarios)
3. **[CHANGELOG](../CHANGELOG.md)** - Version history and release notes

---

## 🛠️ Companion Tools

**Standalone tools for different workflows:**

1. **[Resync CLI](../src/cli/README.md)** - Backward analysis: find improvements in translations worth backporting ([design](DESIGN-RESYNC.md))
2. **[Bulk Translator](../tool-bulk-translator/README.md)** - One-time bulk translation for initial setup
3. **[GitHub Test Tool](../tool-test-action-on-github/README.md)** - Automated GitHub testing + quality evaluation
4. **[Onboarding Tool](../tool-onboarding/README.md)** - ⚠️ DEPRECATED - see Resync CLI
5. **[Alignment Tool](../tool-alignment/README.md)** - ⚠️ DEPRECATED - see Resync CLI

---

## 🔮 Future Planning

**Roadmap and feature planning:**

1. **[Future Features Plan](PLAN-FUTURE-FEATURES.md)** - Resync tools, multi-language architecture, bidirectional suggestions

---

## 📋 Release Notes

**Version history:** See [CHANGELOG.md](../CHANGELOG.md) for full release history.

**Recent releases:**

- **[v0.8.0](../CHANGELOG.md#080---2026-03-03)** - Resync CLI Phase 1, backward analysis command
- **[v0.7.0](../CHANGELOG.md#070---2025-12-05)** - Review mode, repository rename
- **[v0.6.0](../CHANGELOG.md#060---2025-12-03)** - Input validation, error handling
- **[v0.5.1](../CHANGELOG.md#051---2025-11-06)** - Language configuration system
- **[v0.5.0](../CHANGELOG.md#050---2025-11-06)** - TOC files, file deletions
- **[v0.4.7](../CHANGELOG.md#047---2025-10-24)** - Full recursive heading support
- **[v0.3.0](../CHANGELOG.md#030---2025-10-15)** - Section-based architecture

---

## 🔍 Quick Lookup

**Need to...**

| Task | Documentation |
|------|---------------|
| Get started quickly | [QUICKSTART.md](QUICKSTART.md) |
| Understand the architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Understand heading-maps | [HEADING-MAPS.md](HEADING-MAPS.md) |
| Set up testing | [TEST-REPOSITORIES.md](TEST-REPOSITORIES.md) |
| Understand the tests | [TESTING.md](TESTING.md) |
| Choose a Claude model | [CLAUDE-MODELS.md](CLAUDE-MODELS.md) |
| Add glossary terms | [../glossary/README.md](../glossary/README.md) |
| Configure language rules | [Language Config](IMPLEMENTATION.md#language-configuration) |
| Check version history | [CHANGELOG.md](../CHANGELOG.md) |
| Plan future features | [PLAN-FUTURE-FEATURES.md](PLAN-FUTURE-FEATURES.md) |
| Bulk translate initial setup | [../tool-bulk-translator/README.md](../tool-bulk-translator/README.md) |
| Test with GitHub PRs | [../tool-test-action-on-github/README.md](../tool-test-action-on-github/README.md) |

---

## 📂 Documentation Structure

```
docs/
├── INDEX.md                 # This file - documentation hub
├── QUICKSTART.md            # Get started in 10 minutes
├── PROJECT-DESIGN.md        # Design decisions and philosophy
├── ARCHITECTURE.md          # System architecture (diagrams, flow)
├── IMPLEMENTATION.md        # Comprehensive technical guide
├── HEADING-MAPS.md          # Cross-language matching system
├── CLAUDE-MODELS.md         # Model selection and configuration
├── TESTING.md               # Test suite guide (409 tests)
├── TEST-REPOSITORIES.md     # GitHub integration testing setup
├── PLAN-FUTURE-FEATURES.md  # Future roadmap and planning
└── presentations/           # Marp slide deck
```

**Total**: 10 focused documentation files

---

## 🔗 External Links

- **Main README**: [../README.md](../README.md)
- **Glossary System**: [../glossary/README.md](../glossary/README.md)
- **Examples**: [../examples/](../examples/)
- **GitHub Repository**: https://github.com/quantecon/action-translation
- **Issues**: https://github.com/quantecon/action-translation/issues

---

## 📊 Project Metrics

- **Core Code**: ~3,400 lines across 9 modules + ~1,600 lines CLI (8 modules)
- **Test Coverage**: 409 tests (100% passing)
- **GitHub Tests**: 24 automated scenarios
- **Glossary Terms**: 357 (Chinese), 357 (Persian)
- **Bundle Size**: ~1.9MB
- **Languages Supported**: English, Simplified Chinese, Persian/Farsi (Japanese, Spanish planned)

---

## 💡 Key Concepts

**Essential understanding for working with this action:**

1. **Section-Based Translation**: Translates entire `## Section` blocks for better context
2. **Position-Based Matching**: Matches sections by position (1st → 1st), not content
3. **Recursive Structure**: Full support for nested headings (##-######)
4. **Heading-Maps**: Language-independent mapping system (English ID → translated heading)
5. **Language Configuration**: Extensible system for language-specific rules (v0.5.1)

See [PROJECT-DESIGN.md](PROJECT-DESIGN.md) for detailed explanations.

---

**Last Updated**: March 3, 2026 (v0.8.0)
