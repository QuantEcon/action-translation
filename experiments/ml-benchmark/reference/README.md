# Reference translation

`getting_started.md` is Adisankar Manoj Thanuja's hand-crafted Malayalam
translation of the `lecture-python-programming` lecture of the same name. It
is the style ground truth for the ml benchmark (see `../PLAN.md`, issue #189).

**Provenance**: fetched byte-exact (GitHub contents API, base64) from
[adisankarmt/quantecon-malayalam](https://github.com/adisankarmt/quantecon-malayalam)
at commit `c30578f` (2026-07-10). Verified on commit: 6706 Malayalam
codepoints, 10 ZWJ/ZWNJ preserved, 34342 bytes, no mojibake markers.

## Verification procedure (re-run after any update)

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
