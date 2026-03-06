#!/bin/bash
# Build script for Translation Sync Action presentation

set -e

echo "Building Translation Sync Action presentation..."

# Navigate to presentations directory
cd "$(dirname "$0")"

# Step 1: Generate Mermaid diagrams as PNG
echo "1. Generating Mermaid diagrams..."
if command -v mmdc &> /dev/null; then
    mmdc -i diagrams/workflow.mmd -o diagrams/workflow.png -t neutral -b transparent
    echo "   ✓ Generated diagrams/workflow.png"
else
    echo "   ⚠️  Mermaid CLI not found. Install with: npm install -g @mermaid-js/mermaid-cli"
    echo "   Skipping diagram generation..."
fi

# Step 2: Build PDF with Marp
echo "2. Building PDF presentation..."
if command -v marp &> /dev/null; then
    marp action-translation-sync.md -o action-translation-sync.pdf --allow-local-files
    echo "   ✓ Generated action-translation-sync.pdf"
else
    echo "   ⚠️  Marp CLI not found. Install with: npm install -g @marp-team/marp-cli"
    exit 1
fi

# Step 3: Build HTML (optional)
echo "3. Building HTML presentation..."
marp action-translation-sync.md -o action-translation-sync.html --allow-local-files
echo "   ✓ Generated action-translation-sync.html"

echo ""
echo "✅ Build complete!"
echo "   - action-translation-sync.pdf"
echo "   - action-translation-sync.html"
