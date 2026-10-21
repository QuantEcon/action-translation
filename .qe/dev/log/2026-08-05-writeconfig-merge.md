# 2026-08-05 — writeConfig read-modify-write (#243)

`writeConfig` now merges over the existing `.translate/config.yml` instead of rebuilding it from the caller's object, so unknown top-level keys (the `editors:` block Stage 2 routing needs, per QuantEcon/project-translation#15 Decision 5) survive `init`/`setup`/`status --write-state`.

Three shape decisions, argued in the issue thread (2026-08-05 review comment) and confirmed by Matt:

- **Merge read is lenient, not `readConfig`** — `readConfig` rejects a file missing any core field, which is exactly the mid-repair state a bootstrap re-run exists to fix; using it as the merge source would clobber the keys it was meant to save.
- **Fail-loud on unparseable YAML** — silently rebuilding a corrupt file reproduces the invisible-deletion failure one syntax error away. All callers are operator-run CLI commands; the error names the file and refuses to overwrite.
- **Shallow merge, existing-first spread** — caller authoritative per top-level key, existing key order preserved (minimal diff churn; the file is committed in edition repos), nested merge deliberately not attempted.

Considered and rejected: a separate human-owned `.translate/editors.yml`. The plan places `review:` and `editors:` in config.yml, and the merge fix is needed for any future key regardless.

Delivery is CLI-side (no action-path caller), so it reaches operators via checkout update; no release urgency, but it gates the `editors:` block landing in any edition repo.

## Adversarial-review addendum (same day, pre-PR)

A six-lens adversarial workflow over the diff (findings verified by independent refuters, several by execution) caught three things the first cut missed, all fixed before the PR opened:

- **DEFAULT_SCHEMA re-typed preserved values** — `since: 2026-08-05` in a hand-maintained block loaded as a JS Date and was rewritten as `2026-08-05T00:00:00.000Z`, silently mutating exactly the content the fix exists to preserve. Load and dump now use `CORE_SCHEMA`; bare dates round-trip as written.
- **The mapping guard was bypassed by object-typed scalars** — a config whose entire content was `2026-08-05` loaded as a Date, passed the `typeof` guard, spread to `{}`, and was silently rebuilt (the exact outcome the throw exists to prevent); `!!binary` loaded as a Uint8Array and would have merged numeric index keys into the file. The guard is now a plain-mapping prototype check, and under CORE_SCHEMA both inputs fail loudly anyway. The scalar branch of the guard is now test-pinned too (it previously had no test — a plausible simplification would have regressed it silently).
- **Comment stripping was undisclosed** — js-yaml cannot preserve comments, so every rewrite deletes them; that is the same invisible-deletion class this fix targets, in the exact blocks operators will annotate. Accepted as a limitation (a CST-preserving library is not worth the dependency today) but now stated in the doc comment and CHANGELOG, and pinned by a test so the behaviour is at least falsifiable.
