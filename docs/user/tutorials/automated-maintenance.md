---
title: "Tutorial: Automated Maintenance"
subtitle: Set up scheduled status checks and backward analysis via GitHub Actions
---

# Tutorial: Automated Maintenance

The CLI tools (`status`, `backward`, `review`) are designed for local use, but you can also run them on a schedule via GitHub Actions to catch drift and discover backport suggestions automatically.

This tutorial sets up two maintenance workflows:

1. **Weekly status check** — posts sync status to an Issue (free, no LLM calls)
2. **Monthly backward analysis** — runs LLM analysis and uploads the report as an artifact

**Cost:** Status checks are free. Monthly backward analysis is ~$0.85 for a 51-file project.

## Prerequisites

| Requirement | Check |
|---|---|
| Source and target repos connected via action-translation | Sync workflow active |
| `.translate/` metadata bootstrapped | `translate status --write-state` done |
| `ANTHROPIC_API_KEY` secret set | In the repo running the workflows |
| `TRANSLATION_PAT` secret set | A GitHub PAT with access to the target repo (needed to checkout private/cross-repo targets) |

---

## Workflow 1: Weekly status check

This workflow runs `translate status` weekly and posts the results as a comment on a tracking Issue. No API key needed — it's a free structural comparison.

### Create a tracking Issue

In your **source** repository, create a GitHub Issue titled "Translation sync status" (or similar). Note the Issue number — you'll reference it in the workflow.

### Create the workflow

Create `.github/workflows/translation-status.yml` in the **source** repository:

```yaml
name: Translation Status Check

on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9:00 UTC
  workflow_dispatch:        # Manual trigger

permissions:
  issues: write

jobs:
  check-status:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout source
        uses: actions/checkout@v4
        with:
          fetch-depth: 0    # Full history for git metadata

      - name: Checkout target
        uses: actions/checkout@v4
        with:
          repository: QuantEcon/lecture-intro.zh-cn
          path: target
          token: ${{ secrets.TRANSLATION_PAT }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install action-translation CLI
        run: |
          git clone https://github.com/QuantEcon/action-translation.git /tmp/action-translation
          cd /tmp/action-translation
          npm ci
          npm run build:cli

      - name: Run status check
        id: status
        run: |
          cd /tmp/action-translation
          npx translate status \
            -s ${{ github.workspace }} \
            -t ${{ github.workspace }}/target \
            --json > /tmp/status.json

          # Generate summary for Issue comment
          echo "## Translation Status — $(date -u +%Y-%m-%d)" > /tmp/status-comment.md
          echo "" >> /tmp/status-comment.md
          echo '```' >> /tmp/status-comment.md
          npx translate status \
            -s ${{ github.workspace }} \
            -t ${{ github.workspace }}/target >> /tmp/status-comment.md
          echo '```' >> /tmp/status-comment.md
          echo "" >> /tmp/status-comment.md

          # Count statuses from JSON
          ALIGNED=$(jq '[.entries[] | select(.status == "ALIGNED")] | length' /tmp/status.json)
          OUTDATED=$(jq '[.entries[] | select(.status == "OUTDATED")] | length' /tmp/status.json)
          TOTAL=$(jq '.entries | length' /tmp/status.json)
          echo "aligned=$ALIGNED" >> "$GITHUB_OUTPUT"
          echo "outdated=$OUTDATED" >> "$GITHUB_OUTPUT"
          echo "total=$TOTAL" >> "$GITHUB_OUTPUT"

          if [ "$OUTDATED" -gt 0 ]; then
            echo "" >> /tmp/status-comment.md
            echo "⚠️ **$OUTDATED of $TOTAL files are outdated.** Consider running \`translate forward\` to resync." >> /tmp/status-comment.md
          else
            echo "✅ **All $TOTAL files are aligned.**" >> /tmp/status-comment.md
          fi

      - name: Post to tracking Issue
        uses: peter-evans/create-or-update-comment@v4
        with:
          issue-number: 1    # ← Replace with your tracking Issue number
          body-path: /tmp/status-comment.md
```

### What you get

Every Monday, the tracking Issue receives a comment like:

> ## Translation Status — 2026-03-16
>
> ```
> Sync Status: lecture-python-intro ↔ lecture-intro.zh-cn (zh-cn)
>
>   File                              Status
>   ────────────────────────────────  ────────────────────
>   cobweb.md                         ✅ ALIGNED
>   solow.md                          ✅ ALIGNED
>   cagan_adaptive.md                 ⏳ OUTDATED
> ```
>
> ⏳ **1 of 3 files are outdated.** Consider running `translate forward` to resync.

---

## Workflow 2: Monthly backward analysis

This workflow runs `translate backward` monthly and uploads the report as a workflow artifact. A maintainer can download the report and run `translate review` locally to create Issues.

Create `.github/workflows/translation-backward.yml` in the **source** repository:

```yaml
name: Monthly Backward Analysis

on:
  schedule:
    - cron: '0 9 1 * *'  # 1st of every month at 9:00 UTC
  workflow_dispatch:        # Manual trigger

permissions:
  issues: write

jobs:
  backward-analysis:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout source
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Checkout target
        uses: actions/checkout@v4
        with:
          repository: QuantEcon/lecture-intro.zh-cn
          path: target
          token: ${{ secrets.TRANSLATION_PAT }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install action-translation CLI
        run: |
          git clone https://github.com/QuantEcon/action-translation.git /tmp/action-translation
          cd /tmp/action-translation
          npm ci
          npm run build:cli

      - name: Run backward analysis
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          cd /tmp/action-translation
          npx translate backward \
            -s ${{ github.workspace }} \
            -t ${{ github.workspace }}/target \
            -o /tmp/backward-report \
            --json

      - name: Upload report as artifact
        uses: actions/upload-artifact@v4
        with:
          name: backward-report-${{ github.run_id }}
          path: /tmp/backward-report/
          retention-days: 90

      - name: Post summary to tracking Issue
        run: |
          SUMMARY_DIR=$(ls -d /tmp/backward-report/*/backward-* 2>/dev/null | head -1)
          if [ -n "$SUMMARY_DIR" ] && [ -f "$SUMMARY_DIR/_summary.md" ]; then
            SUGGESTIONS=$(grep -c "SUGGESTION" "$SUMMARY_DIR/_summary.md" || echo "0")
            echo "## Backward Analysis — $(date -u +%Y-%m-%d)" > /tmp/backward-comment.md
            echo "" >> /tmp/backward-comment.md
            echo "Backward analysis completed. Found suggestions in the translation worth reviewing." >> /tmp/backward-comment.md
            echo "" >> /tmp/backward-comment.md
            echo "📥 **Download the report** from [workflow artifacts](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}) and review locally:" >> /tmp/backward-comment.md
            echo "" >> /tmp/backward-comment.md
            echo '```bash' >> /tmp/backward-comment.md
            echo "npx translate review /path/to/downloaded/report --repo ${{ github.repository }}" >> /tmp/backward-comment.md
            echo '```' >> /tmp/backward-comment.md
          else
            echo "## Backward Analysis — $(date -u +%Y-%m-%d)" > /tmp/backward-comment.md
            echo "" >> /tmp/backward-comment.md
            echo "✅ No actionable suggestions found. Translations are in sync with source." >> /tmp/backward-comment.md
          fi

      - name: Comment on Issue
        uses: peter-evans/create-or-update-comment@v4
        with:
          issue-number: 1    # ← Replace with your tracking Issue number
          body-path: /tmp/backward-comment.md
```

### Using the report

When the workflow runs, you'll see a comment on the tracking Issue with a link to the artifact. To review:

1. **Download the artifact** from the GitHub Actions run page
2. **Unzip** the report folder
3. **Run the review command** locally:

```bash
npx translate review \
  /path/to/backward-report/lecture-python-intro/backward-2026-03-16 \
  --repo QuantEcon/lecture-python-intro
```

This walks through suggestions interactively and creates Issues for the ones you accept.

---

## Multi-language maintenance

For projects with multiple target languages, you can run checks for each language in parallel:

```yaml
jobs:
  check-chinese:
    runs-on: ubuntu-latest
    steps:
      # ... same pattern with lecture-intro.zh-cn

  check-japanese:
    runs-on: ubuntu-latest
    steps:
      # ... same pattern with lecture-python-intro.ja
```

Or use a matrix strategy:

```yaml
jobs:
  check-status:
    strategy:
      matrix:
        include:
          - target-repo: QuantEcon/lecture-intro.zh-cn       # Real repo name (predates setup convention)
            language: zh-cn
          - target-repo: QuantEcon/lecture-python-intro.ja  # setup-derived name
            language: ja
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: ${{ matrix.target-repo }}
          path: target
          token: ${{ secrets.TRANSLATION_PAT }}
      # ... rest of pipeline using matrix.language
```

---

## Combining with forward resync

When the status check finds OUTDATED files, you have two options:

### Option A: Wait for natural sync

If the source repo is actively receiving PRs, the sync action handles changes naturally when PRs merge. OUTDATED files resync automatically when the relevant sections are changed.

### Option B: Automated forward resync

For proactive resync, add a step to the status workflow that triggers `forward` when drift is detected:

```yaml
      - name: Resync outdated files
        if: steps.status.outputs.outdated > 0
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          cd /tmp/action-translation
          npx translate forward \
            -s ${{ github.workspace }} \
            -t ${{ github.workspace }}/target \
            --github QuantEcon/lecture-intro.zh-cn
```

This creates one PR per outdated file in the target repo. Use with caution — review the PRs before merging to ensure quality.

:::{warning}
Automated forward resync creates translation PRs without human pre-review of the content changes. This is fine for routine maintenance but may produce unexpected results for large structural changes in the source. Consider running manually for significant drift.
:::

---

## Tuning the schedule

| Frequency | Use case | Cost |
|---|---|---|
| Weekly `status` | Active projects with frequent changes | Free |
| Monthly `backward` | Standard maintenance cadence | ~$0.85/run |
| On-demand (`workflow_dispatch`) | Before releases or intensive work periods | Variable |

Adjust the `cron` expressions to match your project's pace:

```yaml
# Every Monday at 9am UTC
- cron: '0 9 * * 1'

# 1st and 15th of each month
- cron: '0 9 1,15 * *'

# Daily (for very active projects)
- cron: '0 9 * * *'
```

---

## Troubleshooting

### Workflow doesn't trigger on schedule

GitHub Actions may skip scheduled runs if the repository is inactive for 60+ days. Push a commit or manually trigger the workflow to reactivate.

### Clone fails for private target repo

Ensure `TRANSLATION_PAT` has `repo` scope and access to the target repository.

### Backward analysis times out

The default GitHub Actions timeout is 6 hours, which is more than enough. If you have a very large project, consider adding `--exclude` patterns for non-essential files.

## Next steps

- [Tutorial: Backward Analysis & Review](backward-review.md) — detailed walkthrough of the backward → review → Issues workflow
- [Tutorial: Resync a Drifted Target](resync-drifted.md) — manual resync workflow
- [CLI Reference](../cli-reference.md) — full command documentation
