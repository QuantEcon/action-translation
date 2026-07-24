# 2026-07-24 — #167 (PR J): dead toc-file input deleted; language docs tell the truth

Small PR, done as specified. `toc-file` deleted (not wired) from action.yml, ActionInputs,
inputs.ts, the default-pinning unit test, and the action-reference row — it was parsed and
tested but read by nothing; `_toc.yml` has always been hardcoded.

F126: three docs promised any language code works; the Action throws on anything outside
LANGUAGE_CONFIGS. Docs now state the split contract: Action validates (en, zh-cn, fa, fr,
ml — ml new since the audit, from #71), CLI genuinely never validates. faq.md's stale
zh-cn/fa enumeration refreshed; examples/README's list gains ml. Durable half: a
`<!-- supported-languages: ... -->` marker in language-config.md that
language-config.test.ts parses and set-compares with getSupportedLanguages() — adding a
language now fails the suite until the doc is updated.
