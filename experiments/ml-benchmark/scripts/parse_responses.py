#!/usr/bin/env python3
"""Extract a reviewer's answers from a filled-in PACKET.md.

`PACKET.md` puts every question above a fenced block tagged with its id:

    ```answer A1
    Yes, deliberate — those read as loanwords to a Kerala student.
    ```

This pulls those out as JSON or a summary table, so a reply comes back as data
rather than something to re-read by hand. Blank boxes are reported as skipped, so
"which questions still need an answer" is a fact rather than an impression.

Byte fidelity is the point of doing this in a script. Malayalam uses ZWJ/ZWNJ
(U+200D/U+200C) and they do not survive some editors or clipboards; answers are
sliced from the file, never retyped. `--check-zw` *counts* those characters so a
returned file can be compared against what was sent — it does not judge whether
any were stripped, because no reliable local test for that exists (see
`zero_width_report`).

Usage:
    python3 parse_responses.py --filled PACKET-adisankar.md
    python3 parse_responses.py --filled reply.md --template PACKET.md --json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# ```answer A1   ...   ```
ANSWER_BLOCK = re.compile(
    r"^[ \t]*```[ \t]*answer[ \t]+([A-Za-z]+[0-9]+)[ \t]*\n(.*?)^[ \t]*```[ \t]*$",
    re.M | re.S,
)

# Escapes rather than literals, deliberately. A script whose whole subject is
# zero-width characters getting silently stripped in transit should not carry
# invisible ones in its own source: an edit that passed through a stripping tool
# would turn these into empty strings, and `body.count("")` returns len+1 rather
# than raising — so the report would fill with absurd counts instead of failing.
ZWJ, ZWNJ = "\u200D", "\u200C"

MALAYALAM = re.compile(r"[ഀ-ൿ]")
# U+0D7A-U+0D7F only: the six ATOMIC chillu codepoints. It deliberately does not
# match the legacy consonant + virama + ZWJ spelling of the same letters, which is
# the distinction the zero-width report turns on — see zero_width_report().
CHILLU = re.compile(r"[ൺ-ൿ]")


def answers(text: str) -> dict[str, str]:
    """id -> answer text, byte-exact, with surrounding blank lines trimmed."""
    out: dict[str, str] = {}
    for qid, body in ANSWER_BLOCK.findall(text):
        out[qid.upper()] = body.strip("\n")
    return out


def sort_key(qid: str):
    m = re.match(r"([A-Za-z]+)([0-9]+)", qid)
    return (m.group(1), int(m.group(2))) if m else (qid, 0)


def zero_width_report(ans: dict[str, str]) -> dict:
    """Report zero-width-character counts in Malayalam answers. Counts only.

    Deliberately makes no "looks corrupted" judgement, because the obvious
    heuristic is wrong. Modern Malayalam encodes chillu as atomic codepoints
    (U+0D7A–U+0D7F) which need no ZWJ at all; only the legacy encoding spelled
    them consonant + virama + ZWJ. So "contains chillu but no ZWJ" describes
    perfectly correct text, and an earlier version of this function flagged the
    very first sample answer it saw. A check that cries wolf on correct input
    trains its reader to ignore it.

    What the counts are actually for: comparing a returned file against what was
    sent. If the packet went out with ZWNJ in its examples and comes back with
    none, something in the round trip stripped them — that is a fact about the
    transport, and it is the reason the covering note asks for plain markdown
    rather than a converted document. Judge by the difference, not by the level.
    """
    rows = []
    for qid, body in sorted(ans.items(), key=lambda kv: sort_key(kv[0])):
        ml = len(MALAYALAM.findall(body)) if body else 0
        if not ml:
            continue
        rows.append({
            "id": qid,
            "malayalam_chars": ml,
            "zwj": body.count(ZWJ),
            "zwnj": body.count(ZWNJ),
            "atomic_chillu": len(CHILLU.findall(body)),
        })
    return {
        "answers_with_malayalam": rows,
        "totals": {
            "zwj": sum(r["zwj"] for r in rows),
            "zwnj": sum(r["zwnj"] for r in rows),
            "malayalam_chars": sum(r["malayalam_chars"] for r in rows),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--filled", type=Path, required=True,
                    help="the returned, filled-in packet")
    ap.add_argument("--template", type=Path,
                    help="the blank packet, to list questions that were skipped")
    ap.add_argument("--check-zw", action="store_true",
                    help="count zero-width characters in Malayalam answers "
                         "(counts only, not a corruption verdict)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    filled = args.filled.read_text(encoding="utf-8")
    got = answers(filled)
    if not got:
        print("No `answer` blocks found. Was the file returned as plain markdown, "
              "or converted by an editor?", file=sys.stderr)
        return 2

    expected = set(answers(args.template.read_text(encoding="utf-8"))) if args.template else set(got)
    answered = {k: v for k, v in got.items() if v.strip()}
    blank = sorted(set(expected) - set(answered), key=sort_key)
    unexpected = sorted(set(got) - expected, key=sort_key)

    report = {
        "source": str(args.filled),
        "questions": len(expected),
        "answered": len(answered),
        "blank": blank,
        "unexpected_ids": unexpected,
        "answers": {k: answered[k] for k in sorted(answered, key=sort_key)},
    }
    if args.check_zw:
        report["zero_width"] = zero_width_report(answered)

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    print(f"{len(answered)} of {len(expected)} answered"
          + (f"; skipped: {', '.join(blank)}" if blank else "; none skipped"))
    if unexpected:
        print(f"ids not in the template (typo, or added by hand?): {', '.join(unexpected)}")
    print()
    for qid in sorted(answered, key=sort_key):
        body = answered[qid].replace("\n", "\n     ")
        print(f"  {qid}: {body}\n")

    if args.check_zw:
        zw = report["zero_width"]
        print("-- zero-width characters in Malayalam answers (counts, not a verdict) --")
        for r in zw["answers_with_malayalam"]:
            print(f"  {r['id']}: {r['malayalam_chars']} Malayalam chars, "
                  f"ZWJ={r['zwj']} ZWNJ={r['zwnj']} atomic-chillu={r['atomic_chillu']}")
        t = zw["totals"]
        if zw["answers_with_malayalam"]:
            print(f"  totals: {t['malayalam_chars']} Malayalam chars, "
                  f"ZWJ={t['zwj']} ZWNJ={t['zwnj']}")
            print("  Zero is not itself a problem — atomic chillu needs no joiner. "
                  "Compare against what was sent.")
        else:
            print("  no Malayalam in the answers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
