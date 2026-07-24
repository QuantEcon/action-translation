# Reference translation (pending)

This directory will hold Adisankar Manoj Thanuja's hand-crafted Malayalam
translation of `getting_started.md` (source lecture:
`lecture-python-programming`). It is the style ground truth for the ml
benchmark (see `../PLAN.md`, issue #189).

**Not yet committed** — the copy circulated by chat arrived with encoding
damage (UTF-8 read as Latin-1, some bytes unrecoverable). The file must be
committed from Adisankar's original, not reconstructed.

## Verification before committing

Malayalam text depends on invisible characters (ZWJ/ZWNJ in chillu and
conjunct formations) that copy-paste chains silently strip. After placing the
file here, verify:

    python3 - <<'EOF'
    data = open('experiments/ml-benchmark/reference/getting_started.md', 'rb').read()
    text = data.decode('utf-8')  # must not raise
    ml = sum(1 for c in text if 'ഀ' <= c <= 'ൿ')
    assert ml > 1000, f"only {ml} Malayalam codepoints — wrong or damaged file?"
    assert 'Ã' not in text and 'à´' not in text, "mojibake markers found"
    zw = sum(1 for c in text if c in '‌‍')
    print(f"OK: {ml} Malayalam codepoints, {zw} ZWJ/ZWNJ, {len(data)} bytes")
    EOF

Keep the file byte-identical to the original: no editor autoformat, no
trailing-whitespace strip, no newline conversion (`git config core.autocrlf`
must not rewrite it).

Known content quirks to preserve as-is (they are part of the artifact):
typos "eentire" and "substanial", and several fully-English sentences —
whether those are deliberate style or draft remnants is open question 2 in
`../PLAN.md`.
