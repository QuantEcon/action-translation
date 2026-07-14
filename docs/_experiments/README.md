# docs/_experiments — temporary experiment pages

Static passthrough for **temporary** experiment pages (e.g. blind translation
review packets) that we want to host on the docs site for a while and then take
down. The underscore prefix keeps MyST from processing this folder; the
`deploy-docs` workflow copies each **subfolder** here into the built site (this
README and other top-level files are *not* published — only subfolders are, and
the step no-ops when there are none).

- **Served at:** `https://quantecon.github.io/action-translation/experiments/<...>`
  (a folder here → `/experiments/<folder>/`). Put an `index.html` in each folder.
- **Files are served as-is.** Use self-contained HTML (inline CSS/JS, no external
  assets) so pages work regardless of the site's base URL.

## Publish

Drop a self-contained page/folder here and push to `main` (any change under
`docs/**` triggers the deploy):

```
node experiments/thinking-sonnet5/scripts/make-review-packets.mjs --out docs/_experiments/thinking-sonnet5
git add docs/_experiments/thinking-sonnet5 && git commit -m "publish thinking-eval review packets" && git push
```

→ live at `/experiments/thinking-sonnet5/`.

## Take down (when the experiment is finished)

```
git rm -r docs/_experiments/thinking-sonnet5 && git commit -m "take down thinking-eval review packets" && git push
```

The next deploy serves the site without it.

## ⚠️ Never put secrets here

Everything in this folder is **published publicly**. Un-blinding keys, API keys,
tokens, or anything private must stay out — e.g. the review packet generator
writes its `id→variant` key to a private, git-ignored path and refuses to write
it under `docs/`.
