# Presentations

Modern presentation for the Translation Sync Action project built with Marp and Mermaid.

## Quick Start

Build the presentation:

```bash
./build.sh
```

This generates:
- `action-translation-sync.pdf` - PDF presentation
- `action-translation-sync.html` - HTML presentation  
- `diagrams/workflow.png` - Pre-rendered Mermaid diagram

## Files

- `action-translation-sync.md` - Marp Markdown source (default theme)
- `diagrams/workflow.mmd` - Mermaid diagram source
- `diagrams/workflow.png` - Generated diagram (created by build script)
- `build.sh` - Automated build script

## Prerequisites

Install the required tools:

```bash
# Install Marp CLI
npm install -g @marp-team/marp-cli

# Install Mermaid CLI (for diagram generation)
npm install -g @mermaid-js/mermaid-cli
```

## Building

### Full Build

```bash
./build.sh
```

This script:
1. Generates Mermaid diagrams as PNG (using `mmdc`)
2. Builds PDF presentation (using `marp`)
3. Builds HTML presentation (using `marp`)

### Manual Build

Generate diagram:
```bash
mmdc -i diagrams/workflow.mmd -o diagrams/workflow.png -t neutral -b transparent
```

Build PDF:
```bash
marp action-translation-sync.md -o action-translation-sync.pdf --allow-local-files
```

Build HTML:
```bash
marp action-translation-sync.md -o action-translation-sync.html --allow-local-files
```

## Presentation Contents

6 slides covering:

1. **Title** - Project introduction
2. **What It Does** - Key capabilities and workflow
3. **How It Works** - Section-based translation approach
4. **Translation Workflow** - Visual Mermaid diagram (pre-rendered)
5. **LLM Integration** - Claude Sonnet 4.5 translation modes (UPDATE and NEW)
6. **Status & Resources** - Current state and getting started

## Editing

### Markdown Source

Edit `action-translation-sync.md` - standard Markdown with Marp directives.

The presentation uses Marp's **default theme** with custom CSS for two-column layouts.

### Diagrams

Edit `diagrams/workflow.mmd` - standard Mermaid syntax (horizontal LR layout, 1100px width).

Run build script to regenerate PNG after changes.

### Theme

Using Marp's built-in **default** theme - clean and simple, works well for content-heavy presentations.

## Presenting

**PDF:** Open `action-translation-sync.pdf` in any PDF viewer  
**HTML:** Open `action-translation-sync.html` in a browser (arrow keys to navigate)

## Changelog

### 2025-10-23
- Created Marp presentation with default theme
- Pre-render Mermaid diagrams with CLI for reliable rendering
- Added automated build script
- 6 slides covering project overview and technical details
- Horizontal workflow diagram (LR layout, 1100px width)
- Two-column layouts using CSS Grid
- Both UPDATE and NEW modes show glossary usage
