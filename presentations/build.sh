#!/bin/bash
# Build script for action-translation presentation

set -e

echo "Building action-translation presentation..."

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
    marp action-translation.md -o action-translation.pdf --allow-local-files
    echo "   ✓ Generated action-translation.pdf"
else
    echo "   ⚠️  Marp CLI not found. Install with: npm install -g @marp-team/marp-cli"
    exit 1
fi

# Step 3: Build HTML (optional)
echo "3. Building HTML presentation..."
marp action-translation.md -o action-translation.html --allow-local-files
echo "   ✓ Generated action-translation.html"

echo ""
echo "✅ Build complete!"
echo "   - action-translation.pdf"
echo "   - action-translation.html"
