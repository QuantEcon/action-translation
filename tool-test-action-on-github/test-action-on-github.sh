#!/bin/bash
#
# Test Action on GitHub
# 
# This script resets and sets up the test-translation-sync repositories for 
# comprehensive end-to-end testing of the translation action.
#
# Usage: ./tool-test-action-on-github/test-action-on-github.sh [--dry-run] [--action-ref <tag|branch>]
#
# Options:
#   --dry-run       Show what would be done without making any changes
#   --action-ref    Tag or branch of action-translation the sync workflows check
#                   out. Defaults to v<package.json version>. Raw commit SHAs are
#                   not accepted: `git ls-remote` cannot verify one, and pinning
#                   to a ref this script cannot confirm exists is how the harness
#                   ended up silently testing v0.16.1 in the first place.
#
# Prerequisites:
# - GitHub CLI (gh) must be installed and authenticated
# - Repositories must already exist on GitHub:
#   - QuantEcon/test-translation-sync
#   - QuantEcon/test-translation-sync.zh-cn
#   - QuantEcon/test-translation-sync.fa
# - ANTHROPIC_API_KEY secret must be configured in test-translation-sync
#
# What this script does:
# 1. Clones/updates both test repositories
# 2. Force pushes base state to main (clean slate)
# 3. Closes all open PRs on both source and target repos
# 4. Creates 26 fresh test PRs covering the scenario matrix (see the `scenarios` array below)
# 5. Adds 'test-translation' label to each PR
# 6. Prints summary of created PRs
#

set -e  # Exit on error

# Parse arguments
DRY_RUN=false
ACTION_REF=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --action-ref)
            ACTION_REF="$2"
            if [ -z "$ACTION_REF" ]; then
                echo "--action-ref requires a value (a tag or branch)" >&2
                exit 1
            fi
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Usage: $0 [--dry-run] [--action-ref <tag|branch>]" >&2
            exit 1
            ;;
    esac
done

# Configuration
OWNER="QuantEcon"
SOURCE_REPO="test-translation-sync"
TARGET_REPO="test-translation-sync.zh-cn"
TARGET_REPO_FA="test-translation-sync.fa"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/test-action-on-github-data"
WORK_DIR="."  # Clone to current directory
TEST_FILE_MINIMAL="lecture-minimal.md"
TEST_FILE_LECTURE="lecture.md"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

#
# Resolve the action version under test.
#
# The harness has two halves and they resolve the action differently:
#
#   sync   — the workflow templates check out this repo at an explicit ref and
#            run `uses: ./action`. That ref is substituted below, so it is never
#            hand-maintained. It used to be hard-coded, and sat at v0.16.1 for
#            eight releases while the docs claimed it tracked `main`.
#   review — `review-translations.yml` lives in the target repos and runs
#            `uses: QuantEcon/action-translation@v0`, deliberately, so the
#            harness exercises whether the floating tag resolves (see #109).
#            That means the review half tests whatever `@v0` points at *now*,
#            which is not necessarily the ref under test. We report both rather
#            than silently conflating them.
#
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ACTION_REPO_URL="https://github.com/$OWNER/action-translation.git"

# Resolve a remote ref to the commit it ultimately points at, and echo nothing if
# it does not exist. An annotated tag resolves to a *tag object*, with the commit
# on the peeled `^{}` ref — prefer that, or v0.23.0 and v0 compare unequal while
# naming the same commit.
resolve_remote_commit() {
    git ls-remote "$ACTION_REPO_URL" \
        "refs/tags/$1^{}" "refs/tags/$1" "refs/heads/$1" 2>/dev/null \
        | awk '{ if (substr($2, length($2) - 2) == "^{}") peeled = $1
                 else if (!first) first = $1 }
               END { print (peeled ? peeled : first) }'
}

if [ -z "$ACTION_REF" ]; then
    ACTION_REF="v$(node -p "require('$REPO_ROOT/package.json').version")"
    ACTION_REF_SOURCE="package.json"
else
    ACTION_REF_SOURCE="--action-ref"
fi

# Fail closed: a ref that does not exist on the remote would make every workflow
# run fail at checkout, 26 PRs deep, for a reason nothing here would explain.
ACTION_REF_SHA="$(resolve_remote_commit "$ACTION_REF")"
if [ -z "$ACTION_REF_SHA" ]; then
    echo -e "${RED}✗ Action ref '$ACTION_REF' (from $ACTION_REF_SOURCE) does not exist on $OWNER/action-translation.${NC}" >&2
    echo "" >&2
    echo "  If you are testing an unreleased version, push the tag first, or pass" >&2
    echo "  an existing ref explicitly:" >&2
    echo "" >&2
    echo "    $0 --action-ref main" >&2
    echo "" >&2
    exit 1
fi

# What the review half will actually run, which may differ from the above.
V0_SHA="$(resolve_remote_commit v0)"
# Annotated tags list their tag-object SHA, with the commit on a peeled `^{}`
# line, so strip that suffix before comparing or v0 never matches a release tag.
V0_DESC="$(git ls-remote --tags "$ACTION_REPO_URL" 2>/dev/null \
    | awk -v sha="$V0_SHA" '
        { ref = $2
          if (substr(ref, length(ref) - 2) == "^{}") ref = substr(ref, 1, length(ref) - 3)
          if ($1 == sha && ref ~ /^refs\/tags\/v[0-9]+\.[0-9]+\.[0-9]+$/) {
              sub("refs/tags/", "", ref); print ref
          } }' \
    | head -1)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Action version under test${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "  sync workflows   ${GREEN}${ACTION_REF}${NC} (${ACTION_REF_SHA:0:7}, from $ACTION_REF_SOURCE)"
if [ -n "$V0_SHA" ] && [ "$V0_SHA" = "$ACTION_REF_SHA" ]; then
    echo -e "  review workflow  ${GREEN}@v0${NC} → ${GREEN}${V0_DESC:-${V0_SHA:0:7}}${NC} — same code"
else
    echo -e "  review workflow  ${YELLOW}@v0${NC} → ${YELLOW}${V0_DESC:-${V0_SHA:0:7}}${NC}"
    echo -e "  ${YELLOW}⚠ The review half is NOT testing $ACTION_REF. Move the v0 tag, or read${NC}"
    echo -e "  ${YELLOW}  review results as applying to ${V0_DESC:-${V0_SHA:0:7}} only.${NC}"
fi
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}DRY RUN MODE - No changes will be made${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Action on GitHub - Reset & Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed.${NC}"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI is not authenticated.${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Check if repos exist
if ! gh repo view "$OWNER/$SOURCE_REPO" &> /dev/null; then
    echo -e "${RED}Error: Repository $OWNER/$SOURCE_REPO does not exist.${NC}"
    echo "Please create it first on GitHub."
    exit 1
fi

if ! gh repo view "$OWNER/$TARGET_REPO" &> /dev/null; then
    echo -e "${RED}Error: Repository $OWNER/$TARGET_REPO does not exist.${NC}"
    echo "Please create it first on GitHub."
    exit 1
fi

if ! gh repo view "$OWNER/$TARGET_REPO_FA" &> /dev/null; then
    echo -e "${RED}Error: Repository $OWNER/$TARGET_REPO_FA does not exist.${NC}"
    echo "Please create it first on GitHub."
    exit 1
fi

echo -e "${GREEN}✓${NC} Prerequisites check passed"
echo ""

# Check if repos exist (skip validation in dry-run)
REPOS_EXIST=true
if ! gh repo view "$OWNER/$SOURCE_REPO" &> /dev/null; then
    if [ "$DRY_RUN" = false ]; then
        echo -e "${RED}Error: Repository $OWNER/$SOURCE_REPO does not exist.${NC}"
        echo "Please create it first on GitHub."
        exit 1
    else
        REPOS_EXIST=false
        echo -e "${YELLOW}Note: Repository $OWNER/$SOURCE_REPO does not exist yet.${NC}"
    fi
fi

if ! gh repo view "$OWNER/$TARGET_REPO" &> /dev/null; then
    if [ "$DRY_RUN" = false ]; then
        echo -e "${RED}Error: Repository $OWNER/$TARGET_REPO does not exist.${NC}"
        echo "Please create it first on GitHub."
        exit 1
    else
        REPOS_EXIST=false
        echo -e "${YELLOW}Note: Repository $OWNER/$TARGET_REPO does not exist yet.${NC}"
    fi
fi

if ! gh repo view "$OWNER/$TARGET_REPO_FA" &> /dev/null; then
    if [ "$DRY_RUN" = false ]; then
        echo -e "${RED}Error: Repository $OWNER/$TARGET_REPO_FA does not exist.${NC}"
        echo "Please create it first on GitHub."
        exit 1
    else
        REPOS_EXIST=false
        echo -e "${YELLOW}Note: Repository $OWNER/$TARGET_REPO_FA does not exist yet.${NC}"
    fi
fi

if [ "$DRY_RUN" = true ] && [ "$REPOS_EXIST" = false ]; then
    echo -e "${CYAN}[DRY RUN] This shows what would happen if repos existed.${NC}"
fi

#
# STEP 1: Clone or update source repository
#
echo -e "${BLUE}Step 1: Preparing source repository...${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}[DRY RUN] Would clone/update $OWNER/$SOURCE_REPO${NC}"
    echo -e "${CYAN}[DRY RUN] Would reset to two base files:${NC}"
    echo -e "${CYAN}  - lecture-minimal.md (from base-minimal.md)${NC}"
    echo -e "${CYAN}  - lecture.md (from base-lecture.md)${NC}"
    echo -e "${CYAN}[DRY RUN] Would ensure workflow file exists${NC}"
    echo -e "${CYAN}[DRY RUN] Would force push to main${NC}"
else
    if [ -d "$SOURCE_REPO" ]; then
        echo "Repository already cloned, updating..."
        cd "$SOURCE_REPO"
        git fetch origin
        git checkout main
        git reset --hard origin/main
        cd ..
    else
        echo "Cloning source repository..."
        git clone "https://github.com/$OWNER/$SOURCE_REPO.git"
    fi

    cd "$SOURCE_REPO"

    # Reset to base state
    echo "Resetting to base state..."
    rm -rf *.md *.yml lectures/
    cp "$DATA_DIR/base-minimal.md" "$TEST_FILE_MINIMAL"
    cp "$DATA_DIR/base-lecture.md" "$TEST_FILE_LECTURE"
    cp "$DATA_DIR/base-toc.yml" "_toc.yml"

    # Ensure workflow exists, pinned to the ref reported in the banner above
    mkdir -p .github/workflows
    sed "s|__ACTION_REF__|$ACTION_REF|g" "$DATA_DIR/workflow-template.yml" \
        > .github/workflows/translation-sync.yml
    sed "s|__ACTION_REF__|$ACTION_REF|g" "$DATA_DIR/workflow-template-fa.yml" \
        > .github/workflows/sync-translations-fa.yml

    # A leftover placeholder means the substitution silently missed.
    if grep -q '__ACTION_REF__' .github/workflows/translation-sync.yml \
                                .github/workflows/sync-translations-fa.yml; then
        echo -e "${RED}✗ Action ref placeholder survived substitution${NC}" >&2
        exit 1
    fi

    # Force push to main
    git add -A
    git commit -m "Reset: base state for testing" || echo "No changes to commit"
    git push -f origin main

    echo -e "${GREEN}✓${NC} Source repo reset to base state"

    cd ..
fi

#
# STEP 2: Clone or update target repository
#
echo -e "${BLUE}Step 2: Preparing target repository...${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}[DRY RUN] Would clone/update $OWNER/$TARGET_REPO${NC}"
    echo -e "${CYAN}[DRY RUN] Would reset to two base Chinese files:${NC}"
    echo -e "${CYAN}  - lecture-minimal.md (from base-minimal-zh-cn.md)${NC}"
    echo -e "${CYAN}  - lecture.md (from base-lecture-zh-cn.md)${NC}"
    echo -e "${CYAN}[DRY RUN] Would force push to main${NC}"
else
    if [ -d "$TARGET_REPO" ]; then
        echo "Repository already cloned, updating..."
        cd "$TARGET_REPO"
        git fetch origin
        git checkout main
        git reset --hard origin/main
        cd ..
    else
        echo "Cloning target repository..."
        git clone "https://github.com/$OWNER/$TARGET_REPO.git"
    fi

    cd "$TARGET_REPO"

    # Reset to base state
    echo "Resetting to base state..."
    rm -rf *.md *.yml lectures/ .translate/
    cp "$DATA_DIR/base-minimal-zh-cn.md" "$TEST_FILE_MINIMAL"
    cp "$DATA_DIR/base-lecture-zh-cn.md" "$TEST_FILE_LECTURE"
    cp "$DATA_DIR/base-toc-zh-cn.yml" "_toc.yml"

    # Force push to main
    git add -A
    git commit -m "Reset: base state for testing (Chinese)" || echo "No changes to commit"
    git push -f origin main

    echo -e "${GREEN}✓${NC} Target repo reset to base state"

    cd "../$SOURCE_REPO"
fi

echo ""

#
# STEP 2b: Clone or update Farsi target repository
#
echo -e "${BLUE}Step 2b: Preparing Farsi target repository...${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}[DRY RUN] Would clone/update $OWNER/$TARGET_REPO_FA${NC}"
    echo -e "${CYAN}[DRY RUN] Would reset to two base Farsi files:${NC}"
    echo -e "${CYAN}  - lecture-minimal.md (from base-minimal-fa.md)${NC}"
    echo -e "${CYAN}  - lecture.md (from base-lecture-fa.md)${NC}"
    echo -e "${CYAN}[DRY RUN] Would force push to main${NC}"
else
    # Step 2 left us inside the source repo — go back to parent first
    cd ..

    if [ -d "$TARGET_REPO_FA" ]; then
        echo "Repository already cloned, updating..."
        cd "$TARGET_REPO_FA"
        git fetch origin
        git checkout main
        git reset --hard origin/main
        cd ..
    else
        echo "Cloning Farsi target repository..."
        git clone "https://github.com/$OWNER/$TARGET_REPO_FA.git"
    fi

    cd "$TARGET_REPO_FA"

    # Reset to base state
    echo "Resetting to base state..."
    rm -rf *.md *.yml lectures/ .translate/ .github/
    cp "$DATA_DIR/base-minimal-fa.md" "$TEST_FILE_MINIMAL"
    cp "$DATA_DIR/base-lecture-fa.md" "$TEST_FILE_LECTURE"
    cp "$DATA_DIR/base-toc-fa.yml" "_toc.yml"

    # Force push to main
    git add -A
    git commit -m "Reset: base state for testing (Farsi)" || echo "No changes to commit"
    git push -f origin main

    echo -e "${GREEN}✓${NC} Farsi target repo reset to base state"

    cd ..
    cd "$SOURCE_REPO"
fi

echo ""

#
# STEP 3: Close all open PRs
#
echo -e "${BLUE}Step 3: Closing all open PRs...${NC}"

# Close PRs on source repo
if [ "$DRY_RUN" = true ]; then
    OPEN_PRS=$(gh pr list --repo "$OWNER/$SOURCE_REPO" --state open --json number --jq '.[].number' 2>/dev/null || echo "")
    if [ -z "$OPEN_PRS" ]; then
        echo -e "${CYAN}[DRY RUN] No open PRs to close on source repo${NC}"
    else
        echo -e "${CYAN}[DRY RUN] Would close the following PRs on source repo:${NC}"
        for pr_number in $OPEN_PRS; do
            echo -e "${CYAN}  - PR #${pr_number}${NC}"
        done
    fi
else
    # Get list of open PRs
    OPEN_PRS=$(gh pr list --repo "$OWNER/$SOURCE_REPO" --state open --json number --jq '.[].number')

    if [ -z "$OPEN_PRS" ]; then
        echo "No open PRs to close on source repo"
    else
        for pr_number in $OPEN_PRS; do
            gh pr close "$pr_number" --repo "$OWNER/$SOURCE_REPO" --comment "Closing for test reset"
            echo -e "${GREEN}✓${NC} Closed PR #${pr_number}"
        done
    fi

    # Clean up local branches
    git checkout main
    git branch | grep -v "main" | xargs -r git branch -D 2>/dev/null || true
fi

# Close PRs on target repo
if [ "$DRY_RUN" = true ]; then
    TARGET_PRS=$(gh pr list --repo "$OWNER/$TARGET_REPO" --state open --json number --jq '.[].number' 2>/dev/null || echo "")
    if [ -z "$TARGET_PRS" ]; then
        echo -e "${CYAN}[DRY RUN] No open PRs to close on target repo${NC}"
    else
        echo -e "${CYAN}[DRY RUN] Would close the following PRs on target repo:${NC}"
        for pr_number in $TARGET_PRS; do
            echo -e "${CYAN}  - PR #${pr_number}${NC}"
        done
    fi
else
    TARGET_PRS=$(gh pr list --repo "$OWNER/$TARGET_REPO" --state open --json number --jq '.[].number')

    if [ -z "$TARGET_PRS" ]; then
        echo "No open PRs to close on target repo"
    else
        for pr_number in $TARGET_PRS; do
            gh pr close "$pr_number" --repo "$OWNER/$TARGET_REPO" --comment "Closing for test reset"
            echo -e "${GREEN}✓${NC} Closed PR #${pr_number} on target repo"
        done
    fi
fi

# Close PRs on Farsi target repo
if [ "$DRY_RUN" = true ]; then
    FA_PRS=$(gh pr list --repo "$OWNER/$TARGET_REPO_FA" --state open --json number --jq '.[].number' 2>/dev/null || echo "")
    if [ -z "$FA_PRS" ]; then
        echo -e "${CYAN}[DRY RUN] No open PRs to close on Farsi target repo${NC}"
    else
        echo -e "${CYAN}[DRY RUN] Would close the following PRs on Farsi target repo:${NC}"
        for pr_number in $FA_PRS; do
            echo -e "${CYAN}  - PR #${pr_number}${NC}"
        done
    fi
else
    FA_PRS=$(gh pr list --repo "$OWNER/$TARGET_REPO_FA" --state open --json number --jq '.[].number')

    if [ -z "$FA_PRS" ]; then
        echo "No open PRs to close on Farsi target repo"
    else
        for pr_number in $FA_PRS; do
            gh pr close "$pr_number" --repo "$OWNER/$TARGET_REPO_FA" --comment "Closing for test reset"
            echo -e "${GREEN}✓${NC} Closed PR #${pr_number} on Farsi target repo"
        done
    fi
fi

echo ""

#
# STEP 4: Create test PRs
#
echo -e "${BLUE}Step 4: Creating test PRs...${NC}"

# Ensure the test-translation label exists
if [ "$DRY_RUN" = false ]; then
    if ! gh label list --repo "$OWNER/$SOURCE_REPO" | grep -q "test-translation"; then
        echo "Creating test-translation label..."
        gh label create "test-translation" --repo "$OWNER/$SOURCE_REPO" \
            --description "Trigger translation action in TEST mode" \
            --color "0E8A16" || echo "Label may already exist"
    fi
fi

echo ""

# Array of test scenarios
# Format: "file-prefix:description:target-file"
# target-file: "minimal" = lecture-minimal.md, "lecture" = lecture.md
declare -a scenarios=(
    "01-intro-change-minimal:Intro text updated:minimal"
    "02-title-change-minimal:Title changed:minimal"
    "03-section-content-minimal:Section content updated:minimal"
    "04-section-reorder-minimal:Sections reordered and content changed:minimal"
    "05-add-section-minimal:New section added:minimal"
    "06-delete-section-minimal:Section removed:minimal"
    "07-subsection-change-minimal:Subsection content updated:minimal"
    "08-multi-element-minimal:Multiple elements changed:minimal"
    "09-real-world-lecture:Real-world lecture update:lecture"
    "10-add-subsubsection-lecture:Sub-subsection added (####):lecture"
    "11-change-subsubsection-lecture:Sub-subsection content changed:lecture"
    "12-change-code-cell-lecture:Code cell comments/titles changed:lecture"
    "13-change-display-math-lecture:Display math equations changed:lecture"
    "14-delete-subsection-lecture:Subsection deleted (Matrix Operations):lecture"
    "15-delete-subsubsection-lecture:Sub-subsection deleted (Closure Property):lecture"
    "16-pure-section-reorder-minimal:Pure section reorder (no content change):minimal"
    "17-new-document-toc:New document added (game-theory.md + TOC):toc"
    "18-delete-document-toc:Document deleted (lecture.md + TOC):toc"
    "19-multi-file:Multiple files changed (minimal + lecture):multi"
    "20-rename-document-toc:Document renamed (lecture.md → linear-algebra.md + TOC):rename"
    "21-preamble-only-minimal:Preamble only changed (frontmatter):minimal"
    "22-deep-nesting-lecture:Deep nesting (##### and ######):lecture"
    "23-special-chars-lecture:Special characters in headings:lecture"
    "24-empty-sections-minimal:Empty sections (heading only):minimal"
    "25-pre-title-content-lecture:Pre-title content (anchor + raw block):lecture"
    "26-heading-case-change-lecture:Heading case change (title-case → sentence-case):lecture"
)

# Note: Tests 01-08 modify lecture-minimal.md, tests 09-15 modify lecture.md, test 16 tests pure reordering

# Create PRs for all test scenarios
for scenario in "${scenarios[@]}"; do
    IFS=':' read -r file_prefix description target_file <<< "$scenario"
    branch_name="test/${file_prefix}"
    
    # Extract test number from file_prefix (e.g., "01" from "01-intro-change-minimal")
    test_number=$(echo "$file_prefix" | grep -o '^[0-9]\+')
    
    # Determine which files to modify based on target_file type
    if [ "$target_file" = "minimal" ]; then
        TEST_FILE="$TEST_FILE_MINIMAL"
        pr_title="TEST: ${description} (${test_number} - minimal)"
    elif [ "$target_file" = "lecture" ]; then
        TEST_FILE="$TEST_FILE_LECTURE"
        pr_title="TEST: ${description} (${test_number} - lecture)"
    elif [ "$target_file" = "toc" ]; then
        pr_title="TEST: ${description} (${test_number} - toc)"
    elif [ "$target_file" = "multi" ]; then
        pr_title="TEST: ${description} (${test_number} - multi)"
    elif [ "$target_file" = "rename" ]; then
        pr_title="TEST: ${description} (${test_number} - rename)"
    fi
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${CYAN}[DRY RUN] Would create PR: ${pr_title}${NC}"
        echo -e "${CYAN}  Branch: ${branch_name}${NC}"
        echo -e "${CYAN}  Type: ${target_file}${NC}"
        echo -e "${CYAN}  Label: test-translation${NC}"
        echo ""
    else
        echo -e "${YELLOW}Creating PR: ${pr_title}${NC}"
        
        # Create branch
        git checkout -b "$branch_name" main
        
        # Handle different test types
        if [ "$target_file" = "toc" ]; then
            # TOC tests - update _toc.yml and potentially add/remove files
            cp "$DATA_DIR/${file_prefix}.yml" "_toc.yml"
            
            # Special handling for test 17 (new document)
            if [ "$file_prefix" = "17-new-document-toc" ]; then
                cp "$DATA_DIR/game-theory.md" "game-theory.md"
                git add "game-theory.md"
            fi
            
            # Special handling for test 18 (delete document)
            if [ "$file_prefix" = "18-delete-document-toc" ]; then
                git rm "$TEST_FILE_LECTURE"
            fi
            
            git add "_toc.yml"
        elif [ "$target_file" = "multi" ]; then
            # Multi-file test - update both files
            cp "$DATA_DIR/${file_prefix}-minimal.md" "$TEST_FILE_MINIMAL"
            cp "$DATA_DIR/${file_prefix}-lecture.md" "$TEST_FILE_LECTURE"
            git add "$TEST_FILE_MINIMAL" "$TEST_FILE_LECTURE"
        elif [ "$target_file" = "rename" ]; then
            # Rename test - rename lecture.md to linear-algebra.md and update TOC
            git mv "$TEST_FILE_LECTURE" "linear-algebra.md"
            cp "$DATA_DIR/${file_prefix}.yml" "_toc.yml"
            git add "_toc.yml"
        else
            # Standard single-file tests
            cp "$DATA_DIR/${file_prefix}.md" "$TEST_FILE"
            git add "$TEST_FILE"
        fi
        
        # Commit changes
        git commit -m "Test: ${description}"
        
        # Push branch (force push to overwrite if exists)
        git push -f origin "$branch_name"
        
        # Create draft PR with label
        PR_URL=$(gh pr create \
            --title "${pr_title}" \
            --body "**Test Number**: ${test_number}
**Test Type**: ${target_file}
**Test Scenario**: ${description}

This is an automated test PR to validate the translation action.

**File Modified**: \`${TEST_FILE}\`

**Changes**: See file diff for details.

**Testing**: The \`test-translation\` label will trigger the action." \
            --draft \
            --base main \
            --head "$branch_name")
        
        # Extract PR number from URL
        PR_NUMBER=$(echo "$PR_URL" | grep -o '[0-9]*$')
        
        # Add label
        gh pr edit "$PR_NUMBER" --add-label "test-translation"
        
        echo -e "${GREEN}✓${NC} Created PR #${PR_NUMBER}: ${PR_URL}"
        echo ""
        
        # Return to main
        git checkout main
    fi
done

#
# STEP 5: Summary
#
echo ""
echo -e "${BLUE}========================================${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}DRY RUN Complete - No changes made${NC}"
else
    echo -e "${BLUE}Setup Complete!${NC}"
fi
echo -e "${BLUE}========================================${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}Summary of what would be done:${NC}"
    echo ""
    echo "1. Reset all three repositories to base state (with _toc.yml)"
    echo "2. Close all open PRs on source, zh-cn target, and fa target repos"
    echo "3. Create 24 new test PRs:"
    echo "   Basic Tests (01-08):"
    echo "     - 01: Intro text updated"
    echo "     - 02: Title changed"
    echo "     - 03: Section content updated"
    echo "     - 04: Sections reordered and content changed"
    echo "     - 05: New section added"
    echo "     - 06: Section removed"
    echo "     - 07: Subsection content updated"
    echo "     - 08: Multiple elements changed"
    echo "   Scientific Content Tests (09-16):"
    echo "     - 09: Real-world lecture with code & math"
    echo "     - 10: Sub-subsection added (####)"
    echo "     - 11: Sub-subsection content changed"
    echo "     - 12: Code cell comments/titles changed"
    echo "     - 13: Display math equations changed"
    echo "     - 14: Subsection deleted"
    echo "     - 15: Sub-subsection deleted"
    echo "     - 16: Pure section reorder (no content change)"
    echo "   Document Lifecycle Tests (17-20):"
    echo "     - 17: NEW document added (game-theory.md + TOC)"
    echo "     - 18: Document DELETED (lecture.md + TOC)"
    echo "     - 19: Multiple files changed (minimal + lecture)"
    echo "     - 20: Document RENAMED (lecture → linear-algebra + TOC)"
    echo "   Edge Cases (21-26):"
    echo "     - 21: Preamble only changed (frontmatter)"
    echo "     - 22: Deep nesting (##### and ######)"
    echo "     - 23: Special characters in headings"
    echo "     - 24: Empty sections (heading only)"
    echo "     - 25: Pre-title content (anchor + raw block)"
    echo "     - 26: Heading case change (title-case -> sentence-case)"
    echo "4. Add 'test-translation' label to each PR"
    echo ""
    echo -e "${YELLOW}To actually run these changes, execute without --dry-run:${NC}"
    echo "  ./tool-test-action-on-github/test-action-on-github.sh"
else
    echo -e "${GREEN}Created ${#scenarios[@]} test PRs in ${SOURCE_REPO}${NC}"
    echo -e "Testing action ${GREEN}${ACTION_REF}${NC} (${ACTION_REF_SHA:0:7}) in the sync workflows;"
    echo -e "the review workflow runs @v0 → ${V0_DESC:-${V0_SHA:0:7}}."
    echo ""
    echo "Test Coverage:"
    echo "  - Basic structure changes (8 tests)"
    echo "  - Scientific content (code cells, math) (8 tests)"
    echo "  - Document lifecycle (CRUD operations) (4 tests)"
    echo "  - Edge cases (preamble, nesting, special chars, empty) (4 tests)"
    echo ""
    echo "Next steps:"
    echo "1. Each PR has the 'test-translation' label"
    echo "2. The GitHub Action should trigger automatically"
    echo "3. Check ${TARGET_REPO} and ${TARGET_REPO_FA} for translation PRs"
    echo ""
    echo "View all PRs:"
    echo "  gh pr list --repo $OWNER/$SOURCE_REPO"
    echo ""
    echo "Monitor translation PRs (Chinese):"
    echo "  gh pr list --repo $OWNER/$TARGET_REPO"
    echo ""
    echo "Monitor translation PRs (Farsi):"
    echo "  gh pr list --repo $OWNER/$TARGET_REPO_FA"
    echo ""
    echo "To reset and run again, just execute this script again!"
fi
