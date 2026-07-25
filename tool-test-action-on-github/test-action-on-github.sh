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
#   --action-ref    Tag or branch of action-translation that EVERY workflow this
#                   harness writes will run. Defaults to `main`. Raw commit SHAs
#                   are not accepted: `git ls-remote` cannot verify one, and
#                   pinning to a ref this script cannot confirm exists is how
#                   the harness ended up silently testing v0.16.1 for eight
#                   releases.
#
#                   `--action-ref v0` renders the floating tag into every
#                   workflow, which is the post-release smoke that exercises tag
#                   resolution (QuantEcon/action-translation#109) without
#                   embedding two versions in one run (#202).
#
# Prerequisites:
# - GitHub CLI (gh) must be installed and authenticated, with the `workflow`
#   scope — this script pushes .github/workflows/ to four repos.
# - The source repo and one target repo per entry in LANGUAGES must exist.
# - ANTHROPIC_API_KEY and QUANTECON_SERVICES_PAT secrets configured.
#
# What this script does:
# 1. Clones/updates the source repo and every target repo
# 2. Force pushes base state to main (clean slate), rendering ALL workflows —
#    one sync workflow per language in the source repo, plus review and rebase
#    in each target — every one pinned to the same ref
# 3. Closes all open PRs on the source and every target repo
# 4. Creates fresh test PRs covering the scenario matrix (see `scenarios` below)
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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/test-action-on-github-data"
EXAMPLES_DIR="$(cd "$SCRIPT_DIR/../examples" && pwd)"
WORK_DIR="$(pwd)"   # repos are cloned here; every step cd's from it absolutely
TEST_FILE_MINIMAL="lecture-minimal.md"
TEST_FILE_LECTURE="lecture.md"

# Every language the harness drives, as `code|Display name`. Everything else is
# derived, so adding a language is one line here plus its three base fixtures:
#   target repo    = $SOURCE_REPO.<code>
#   sync workflow  = .github/workflows/sync-translations-<code>.yml
#   fixtures       = base-{minimal,lecture}-<code>.md, base-toc-<code>.yml
#
# This replaced three near-duplicate per-repo blocks that had already drifted
# three ways: `.github/` was deleted in the fa reset but not zh-cn's (which
# destroyed fa's review and rebase workflows on every run), `.translate/` was
# deleted in the targets but not the source, and ml was absent entirely while
# its hand-made workflow fired and failed on all 26 PRs of every run.
LANGUAGES=(
  "zh-cn|Chinese"
  "fa|Farsi"
  "ml|Malayalam"
)

lang_code() { echo "${1%%|*}"; }
lang_name() { echo "${1##*|}"; }

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
# ONE ref reaches every workflow. This used to be two independent halves — sync
# workflows at an explicit ref, target-repo workflows permanently on `@v0` — so
# a single run tested two versions at once and reported it as one. Worse, the
# split was not even honest: the hand-made ml sync workflow was ALSO on `@v0`,
# invisible to the banner, failing on all 26 PRs of every run.
#
# Every template now carries the ref on its `uses:` line, so `--action-ref`
# reaches all of them. The floating-tag check that #109 wanted is preserved by
# making `--action-ref v0` a first-class mode rather than by leaving some
# workflow permanently floating: run the release gate pinned, move the tag, then
# re-run with `--action-ref v0`. Nothing is repointed and no check is deleted —
# the check moves to after the tag move, which is the only point where its
# answer means anything (#202).
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

# ── Repo helpers ────────────────────────────────────────────────────────────
# Every one runs its body in a subshell with an absolute cd, so no step depends
# on the working directory another step happened to leave behind.

clone_or_refresh() {   # $1 = repo name
    cd "$WORK_DIR"
    if [ -d "$1" ]; then
        ( cd "$1" && git fetch origin -q && git checkout -q main && git reset -q --hard origin/main )
    else
        git clone -q "https://github.com/$OWNER/$1.git"
    fi
}

commit_and_push() {    # $1 = commit message   (cwd = a clone)
    git add -A
    if ! git diff --cached --quiet; then
        git commit -q -m "$1"
    fi
    # A swallowed commit failure must not masquerade as a clean no-op reset:
    # the old code ran `git commit || echo "No changes to commit"` and pushed
    # regardless, so a genuine failure looked identical to nothing-to-do.
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${RED}✗ reset left uncommitted changes in $(pwd)${NC}" >&2
        exit 1
    fi
    git push -f -q origin main
}

render_sync_workflow() {   # $1 = code, $2 = display name   (cwd = source clone)
    sed -e "s|__ACTION_REF__|$ACTION_REF|g" \
        -e "s|__LANG_NAME__|$2|g" \
        -e "s|__LANG__|$1|g" \
        "$DATA_DIR/sync-workflow-template.yml" \
        > ".github/workflows/sync-translations-$1.yml"
}

# Target-repo workflows are rendered from examples/ — the canonical templates
# users receive (#161) — rather than from harness copies, so the harness cannot
# drift from what it is supposed to be testing. Only the ref, the source repo
# and the docs folder differ.
render_target_workflows() {   # (cwd = target clone)
    mkdir -p .github/workflows
    for wf in review rebase; do
        sed -e "s|QuantEcon/action-translation@v0|QuantEcon/action-translation@$ACTION_REF|g" \
            -e "s|QuantEcon/lecture-python-intro|$OWNER/$SOURCE_REPO|g" \
            -e "s|docs-folder: 'lectures'|docs-folder: '.'|g" \
            "$EXAMPLES_DIR/$wf-translations.yml" \
            > ".github/workflows/$wf-translations.yml"
    done
}

# Fails the run rather than letting a placeholder reach GitHub, where it would
# surface as an unresolvable action 26 PRs deep.
assert_no_placeholders() {   # (cwd = a clone)
    local leftover
    leftover="$(grep -rl '__ACTION_REF__\|__LANG__\|__LANG_NAME__\|__SOURCE_REPO__' .github/workflows 2>/dev/null || true)"
    if [ -n "$leftover" ]; then
        echo -e "${RED}✗ placeholder survived substitution in: $leftover${NC}" >&2
        exit 1
    fi
}

# Default to `main`, not the package.json version. The version bump happens IN
# the release commit, so between releases package.json holds the LAST RELEASED
# version — a package.json default therefore tested the previous release rather
# than the code under development, and refused to run at all during a release
# PR (the tag does not exist yet). Release gating is now an explicit
# `--action-ref vX.Y.Z` step in the release checklist. The banner prints the
# resolved SHA either way, so a `main` run is still attributable after the fact;
# the old objection to `main` was that it was SILENT, and it no longer is.
if [ -z "$ACTION_REF" ]; then
    ACTION_REF="main"
    ACTION_REF_SOURCE="default"
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

# Census, not a summary. Every workflow the harness writes is listed by name,
# so "the harness tests version X" is falsifiable at run time instead of being
# asserted in a comment. The predecessor of this block reported two aggregate
# lines — "sync workflows" and "review workflow" — and both were wrong: one of
# the sync workflows (ml) floated on @v0 and was invisible here, and the fa
# target had no review workflow at all because the reset deleted it.
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Action version under test${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "  ref  ${GREEN}${ACTION_REF}${NC} (${ACTION_REF_SHA:0:7}, from ${ACTION_REF_SOURCE})"
if [ -n "$(git ls-remote "$ACTION_REPO_URL" "refs/heads/$ACTION_REF" 2>/dev/null)" ]; then
    echo -e "       ${YELLOW}branch ref — runs whatever dist-action/ that branch has committed${NC}"
fi
echo ""
echo -e "  Workflows this run writes and pins:"
for L in "${LANGUAGES[@]}"; do
    c="$(lang_code "$L")"
    printf "    %-30s %-28s ${GREEN}@%s${NC}\n" "$SOURCE_REPO" "sync-translations-${c}.yml" "$ACTION_REF"
done
for L in "${LANGUAGES[@]}"; do
    c="$(lang_code "$L")"
    printf "    %-30s %-28s ${GREEN}@%s${NC}\n" "${SOURCE_REPO}.${c}" "review + rebase" "$ACTION_REF"
done
echo ""
TOTAL_WORKFLOWS=$(( ${#LANGUAGES[@]} * 3 ))
echo -e "  ${GREEN}${TOTAL_WORKFLOWS}/${TOTAL_WORKFLOWS} workflows on one ref${NC} — a full run tests exactly one version."
if [ "$ACTION_REF" = "v0" ]; then
    echo -e "  ${CYAN}Floating-tag mode: every workflow reads @v0 → ${V0_DESC:-${V0_SHA:0:7}}.${NC}"
    echo -e "  ${CYAN}This is the post-release smoke that exercises tag resolution (#109).${NC}"
else
    echo -e "  ${CYAN}@v0 currently resolves to ${V0_DESC:-${V0_SHA:0:7}} and is NOT exercised by this run.${NC}"
    echo -e "  ${CYAN}After moving the tag, re-run with --action-ref v0 to check it (#109/#202).${NC}"
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

# Check every repo the run will touch. The predecessor of this block checked
# the same three repos twice — once fatally, then again dry-run-tolerantly —
# so the second block's REPOS_EXIST logic was unreachable dead code.
REPOS_EXIST=true
missing=()
for repo in "$SOURCE_REPO" $(for L in "${LANGUAGES[@]}"; do echo "$SOURCE_REPO.$(lang_code "$L")"; done); do
    if ! gh repo view "$OWNER/$repo" &> /dev/null; then
        missing+=("$OWNER/$repo")
    fi
done

if [ ${#missing[@]} -gt 0 ]; then
    if [ "$DRY_RUN" = false ]; then
        echo -e "${RED}Error: these repositories do not exist:${NC}"
        printf '  %s\n' "${missing[@]}"
        echo "Create them first, or remove the language from LANGUAGES."
        exit 1
    fi
    REPOS_EXIST=false
    echo -e "${YELLOW}Note: these repositories do not exist yet:${NC}"
    printf '  %s\n' "${missing[@]}"
fi

# Pushing .github/workflows/ needs the `workflow` OAuth scope. Without it the
# run dies mid-push after already force-pushing content, leaving repos in a
# half-reset state — so check before touching anything.
if [ "$DRY_RUN" = false ] && ! gh auth status 2>&1 | grep -q "'workflow'"; then
    echo -e "${RED}Error: the gh token lacks the 'workflow' scope.${NC}"
    echo "This script writes .github/workflows/ to $(( ${#LANGUAGES[@]} + 1 )) repos."
    echo "Run: gh auth refresh -h github.com -s workflow"
    exit 1
fi

echo -e "${GREEN}✓${NC} Prerequisites check passed"
echo ""

if [ "$DRY_RUN" = true ] && [ "$REPOS_EXIST" = false ]; then
    echo -e "${CYAN}[DRY RUN] This shows what would happen if repos existed.${NC}"
fi

#
# STEP 1: Reset the source repository and render every sync workflow
#
echo -e "${BLUE}Step 1: Preparing source repository...${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}[DRY RUN] Would reset $OWNER/$SOURCE_REPO to base state:${NC}"
    echo -e "${CYAN}  - lecture-minimal.md, lecture.md, _toc.yml${NC}"
    for L in "${LANGUAGES[@]}"; do
        echo -e "${CYAN}  - .github/workflows/sync-translations-$(lang_code "$L").yml @ $ACTION_REF${NC}"
    done
    echo -e "${CYAN}[DRY RUN] Would force push to main${NC}"
else
    (
        set -e
        clone_or_refresh "$SOURCE_REPO"
        cd "$WORK_DIR/$SOURCE_REPO"

        # `.github/` is deleted and re-rendered, never left in place: an orphan
        # workflow from a previous run would keep firing against a version this
        # run knows nothing about. That is what the hand-made ml sync workflow
        # was doing — failing on all 26 PRs of every run, unreported.
        rm -rf ./*.md ./*.yml lectures/ .github/
        cp "$DATA_DIR/base-minimal.md" "$TEST_FILE_MINIMAL"
        cp "$DATA_DIR/base-lecture.md" "$TEST_FILE_LECTURE"
        cp "$DATA_DIR/base-toc.yml" "_toc.yml"

        mkdir -p .github/workflows
        for L in "${LANGUAGES[@]}"; do
            render_sync_workflow "$(lang_code "$L")" "$(lang_name "$L")"
        done
        assert_no_placeholders

        commit_and_push "Reset: base state for testing [$ACTION_REF]"
    )
    echo -e "${GREEN}✓${NC} Source repo reset; ${#LANGUAGES[@]} sync workflow(s) rendered @ $ACTION_REF"
fi

#
# STEP 2: Reset every target repository
#
echo -e "${BLUE}Step 2: Preparing target repositories...${NC}"

for L in "${LANGUAGES[@]}"; do
    code="$(lang_code "$L")"
    name="$(lang_name "$L")"
    repo="$SOURCE_REPO.$code"

    if [ "$DRY_RUN" = true ]; then
        echo -e "${CYAN}[DRY RUN] Would reset $OWNER/$repo ($name):${NC}"
        echo -e "${CYAN}  - base-minimal-$code.md, base-lecture-$code.md, base-toc-$code.yml${NC}"
        echo -e "${CYAN}  - .github/workflows/{review,rebase}-translations.yml @ $ACTION_REF${NC}"
        continue
    fi

    (
        set -e
        clone_or_refresh "$repo"
        cd "$WORK_DIR/$repo"

        # Deleting `.github/` is only safe because render_target_workflows puts
        # it back on the next line. The fa block used to do the delete WITHOUT
        # the render, which silently destroyed that target's review and rebase
        # workflows on every run — fa had none at all until this change.
        rm -rf ./*.md ./*.yml lectures/ .translate/ .github/
        cp "$DATA_DIR/base-minimal-$code.md" "$TEST_FILE_MINIMAL"
        cp "$DATA_DIR/base-lecture-$code.md" "$TEST_FILE_LECTURE"
        cp "$DATA_DIR/base-toc-$code.yml" "_toc.yml"

        render_target_workflows
        assert_no_placeholders

        commit_and_push "Reset: base state for testing ($name) [$ACTION_REF]"
    )
    echo -e "${GREEN}✓${NC} $name target reset; review + rebase rendered @ $ACTION_REF"
done

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

# Close PRs on every target repo
for L in "${LANGUAGES[@]}"; do
    code="$(lang_code "$L")"
    name="$(lang_name "$L")"
    repo="$OWNER/$SOURCE_REPO.$code"

    TARGET_PRS=$(gh pr list --repo "$repo" --state open --json number --jq '.[].number' 2>/dev/null || echo "")
    if [ -z "$TARGET_PRS" ]; then
        echo "No open PRs to close on $name target repo"
        continue
    fi
    for pr_number in $TARGET_PRS; do
        if [ "$DRY_RUN" = true ]; then
            echo -e "${CYAN}[DRY RUN] Would close PR #${pr_number} on $name target${NC}"
        else
            gh pr close "$pr_number" --repo "$repo" --comment "Closing for test reset"
            echo -e "${GREEN}✓${NC} Closed PR #${pr_number} on $name target"
        fi
    done
done

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
    echo "2. Every workflow is pinned to $ACTION_REF (${ACTION_REF_SHA:0:7})"
    echo "3. Check each target repo for translation PRs:"
    for L in "${LANGUAGES[@]}"; do
        echo "     gh pr list --repo $OWNER/$SOURCE_REPO.$(lang_code "$L")   # $(lang_name "$L")"
    done
    echo ""
    echo "View source PRs:"
    echo "  gh pr list --repo $OWNER/$SOURCE_REPO"
    echo ""
    if [ "$ACTION_REF" != "v0" ]; then
        echo "After moving the v0 tag, verify floating-tag resolution (#109):"
        echo "  $0 --action-ref v0"
        echo ""
    fi
    echo "To reset and run again, just execute this script again!"
fi
