# D-2026-08-11 — Bot identity: quantecon-services machine user, not a GitHub App

**Status**: decided (owner, 2026-08-11, W0 closeout). Migration itself is deferred
until an identity change is imminent; this records the direction so the deciding
evidence is not rediscovered the hard way.

## Decision

When the sync bot's identity moves off the maintainer's personal PAT, it moves to the
**`quantecon-services` machine user** (an ordinary user account with a PAT), not to a
GitHub App. #61 remains open as the migration task; #221 closes with this record.

## Why

The `\translate-resync` trust gate (#192) admits `OWNER`/`MEMBER`/`COLLABORATOR` by
`comment.author_association`. #221 measured (2026-07-26, three unrelated Apps) that
**GitHub Apps always report `NONE`** for that field — structurally, because the field
describes a person's membership and an App installation has none. So:

- **Machine user**: reports `MEMBER`/`COLLABORATOR` once added to the org/repo — the
  gate passes with **zero code change** in any of its ~17 copies.
- **App**: resync silently stops responding for the bot; fixing it means an explicit
  login allowlist in every gate copy plus `src/inputs.ts`.

The failure mode being *silent* is what makes recording this worth a file: on
migration day nothing errors — the command just stops working.

## Constraints that ride along (from #221)

- **Name the token, not just the identity**: comments posted with
  `secrets.GITHUB_TOKEN` never trigger workflows (GitHub's recursion guard), so the
  credential choice decides whether the `issue_comment` event exists at all.
- **Nothing the bot posts may contain the command string** once it posts under a
  trigger-capable credential. Today that holds by accident (`postSuccessComment`
  omits it; the failure issue carries it but issues cannot self-trigger). The
  migration PR should add a test making it hold by construction.

## Migration checklist (when imminent — from #61)

Mint PAT under `quantecon-services` → grant write on source + target repos → rotate
the secret in each source repo (lecture-python-programming, test-translation-sync,
and any wired since) → verify authorship on a test PR → add the command-string test.
