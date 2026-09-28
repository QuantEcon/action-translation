#!/usr/bin/env python3
"""Deterministic quality metrics for Malayalam (ml) translations.

The ml policy (issue #70, PR #71) is keep-English-dominant: technical terms
must survive in Latin script with Malayalam prose wrapping around them. That
makes the core checks scriptable — see experiments/ml-benchmark/PLAN.md for
metric definitions and gate semantics.

Usage:
    ml_metrics.py --output translated.md [--source english.md]
                  [--glossary glossary/ml.json] [--reference reference.md]
                  [--top-tokens 30] [--json]

Exit code 1 if any FAIL gate breaches (requires --source), else 0.
Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

MALAYALAM_RE = re.compile(r"[ഀ-ൿ]")
LATIN_RE = re.compile(r"[A-Za-z]")
FENCE_RE = re.compile(r"^(```|~~~)")
HEADING_RE = re.compile(r"^#{1,6} ")


def strip_to_prose(text: str) -> str:
    """Drop YAML frontmatter and fenced blocks (code cells, directives)."""
    lines = text.split("\n")
    out: list[str] = []
    i = 0
    if lines and lines[0].strip() == "---":
        i = 1
        while i < len(lines) and lines[i].strip() != "---":
            i += 1
        i += 1
    in_fence = False
    fence_marker = ""
    for line in lines[i:]:
        stripped = line.lstrip()
        m = FENCE_RE.match(stripped)
        if m:
            if not in_fence:
                in_fence, fence_marker = True, m.group(1)
            elif stripped.startswith(fence_marker):
                in_fence = False
            continue
        if not in_fence:
            out.append(line)
    return "\n".join(out)


def headings(text: str) -> list[str]:
    # rstrip is deliberate: the gate compares heading text, not invisible
    # trailing whitespace — a whitespace-only diff is not a translation defect.
    return [ln.rstrip() for ln in strip_to_prose(text).split("\n") if HEADING_RE.match(ln)]


def term_pattern(term: str) -> re.Pattern[str]:
    # Left boundary: not preceded by a Latin letter. Right: no further
    # lowercase letter — which permits the hyphenated Malayalam suffix
    # attachment the policy mandates (economy-യിലെ) but NOT English plurals.
    # Plural folding is deliberately absent: "+s" collides with verbs the
    # policy correctly translates (means, demands, yields → Malayalam), and on
    # the reference lecture folding produced only a false FAIL ("mean" 2->0
    # via the verb "means") and zero true extra matches. Exact matching is
    # symmetric between source and output, so plural occurrences are merely
    # invisible to the gate, never false failures.
    return re.compile(r"(?<![A-Za-z])" + re.escape(term) + r"(?![a-z])", re.IGNORECASE)


def count_term(term: str, prose: str) -> int:
    return len(term_pattern(term).findall(prose))


def surface_forms(term: str, prose: str) -> list[str]:
    return sorted(set(term_pattern(term).findall(prose)))


def paragraph_ratios(prose: str, min_letters: int = 12) -> list[float]:
    """Per-paragraph Malayalam share of alphabetic characters."""
    ratios = []
    for para in re.split(r"\n\s*\n", prose):
        if HEADING_RE.match(para.strip()):
            continue
        ml = len(MALAYALAM_RE.findall(para))
        la = len(LATIN_RE.findall(para))
        if ml + la >= min_letters:
            ratios.append(ml / (ml + la))
    return ratios


def ratio_stats(ratios: list[float]) -> dict:
    if not ratios:
        return {"n": 0}
    if len(ratios) == 1:
        v = round(ratios[0], 3)
        return {"n": 1, "mean": v, "median": v, "p10": v, "p90": v}
    # method='inclusive' never extrapolates beyond the observed min/max — the
    # default exclusive method produces out-of-range quantiles (even negative
    # "ratios") on small samples.
    qs = statistics.quantiles(ratios, n=10, method="inclusive")
    return {
        "n": len(ratios),
        "mean": round(statistics.mean(ratios), 3),
        "median": round(statistics.median(ratios), 3),
        "p10": round(qs[0], 3),
        "p90": round(qs[-1], 3),
    }


def malayalam_tokens(prose: str, top: int) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for tok in re.findall(r"[ഀ-ൿ‌‍]+", prose):
        if len(tok) > 1:
            counts[tok] = counts.get(tok, 0) + 1
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:top]


# -- Round-2 lints (lecture-python-programming.ml#7, 2026-09-01) -------------
# Deterministic proxies for the three largest classes of the second native
# review round, per QuantEcon/project-translation
# reports/2026-09-01-ml-functions-review-disposition.md. Prototype status:
# they report as LINT (never FAIL) until #189 Phase 3 decides what graduates
# into diff-checks. Calibration: the reviewed text of `functions` (ml main
# c1200fa) must come out clean; the pre-review seed (5ffae4e) should light up.

CELL_OR_MATH_RE = re.compile(r"^\s*(```|~~~)\{(code-cell|math)\}")
LIST_ITEM_RE = re.compile(r"^\s*([*+-]|\d+\.)\s+")
# Skips directive options (`:class: dropdown`), labels (`(name)=`), cell breaks
# and comments. Only a whole-line label is skipped: a prose paragraph that opens
# with "(" is prose (round 4, ml#23: five such lines, 197 among them, were
# invisible to every lint). A prose line that opens with a MyST role
# ({ref}`…`, {doc}`…`) is prose too — the rules name sentence-initial link text.
DIRECTIVE_LINE_RE = re.compile(r"^\s*(:|\([^)\s]+\)=\s*$|\+\+\+|```|~~~|<!--)")
ROLE_PREFIX_RE = re.compile(r"^\{[a-z-]+\}`")
FENCE_LINE_RE = re.compile(r"^(`{3,}|~{3,})\s*(.*)$")
DIRECTIVE_NAME_RE = re.compile(r"^\{([A-Za-z][A-Za-z0-9-]*)\}")
# Directives whose body is translated Malayalam prose: scanned like the text
# around them (ml#23 line 483, a comma splice inside {note}). Exercise-family
# bodies ({exercise}, {exercise-start}, {hint}, {solution}, …) are English by
# decision (D-2026-09-03-ml-all-exercise-content-stays-english, restored from
# source by src/verbatim-directives.ts), as are figures and epigraphs, so they
# are not scanned — python_by_example's round-1 exercise text, translated before
# that decision, is therefore no longer linted.
PROSE_DIRECTIVES = {
    "note", "tip", "warning", "admonition", "important", "seealso",
    "attention", "caution", "danger", "error",
}
BANNED_RENDERINGS: list[tuple[str, str]] = [
    # (substring, what the rules say instead) — one entry per rule-bound rendering
    ("ഒരു നൽകിയ", "'a given N' → തന്നിരിക്കുന്ന N"),
    ("കണക്കിലെടുക്ക", "'consider X' → X നോക്കാം (കണക്കിലെടുക്കുക only for 'take into account' — check the sense)"),
    ("കുറച്ചുകൂടെ", "spelling → കുറച്ചുകൂടി"),
    ("ഉപയോഗപ്രദ", "'useful' stays English"),
    ("ആവശ്യപ്പെടുന്നു", "'is required' → ആവശ്യമായിവരുന്നു"),
    ("കൈകാര്യം", "'cover' → cover ചെയ്യും"),
    ("മറ്റൊരു വിധത്തിൽ പറഞ്ഞാൽ", "'in other words' → അതായത്"),
    ("മിക്കവാറും എപ്പോഴും", "'almost always' → മിക്ക സമയത്തും"),
    ("വാസ്തവത്തിൽ", "'In fact,' stays English"),
    ("മറുവശത്ത്", "'On the other hand,' stays English"),
    ("ആവർത്തിച്ച്", "'repeatedly' stays English"),
    ("സൂചിപ്പിക്കുന്നു", "'refer' → refer ചെയ്യുന്നു"),
    # round 3 (lecture-python-programming.ml#13)
    ("ലളിതമായ", "'simple' stays English (simple ആയ)"),
    ("നീക്കം ചെയ്യ", "'remove' → remove ചെയ്യാൻ"),
    ("explicit ആയ", "'explicit' → വ്യക്തമായ / വ്യക്തമായി"),
    ("dictionary-like", "'X-like' → X പോലെയുള്ള, before the name"),
    ("പിന്തുടര", "'follow (what is going on)' → മനസ്സിലാക്കുക — check the sense"),
]
# (The round-2 future-hortative watch was retired in round 4: since rule 13
# landed it made 2 hits on reviewed seeds and the editor acted on neither — it
# flagged a later-lecture promise he kept (ml#23 1092) and missed another
# (1005) — while the engine already writes the hortative at 72 of 81 sites.)
# The editor's answers on lecture-python-programming.ml#22 (2026-09-19).
# A Malayalam plural (-കൾ / -ുകൾ, oblique -കള…) built on a Latin-script
# singular — object-ുകൾ, function call-കളിൽ — where he wants the English
# plural plus the suffix (objects, function calls-ൽ). Deterministic.
ML_PLURAL_ON_LATIN_RE = re.compile(r"[A-Za-z`]-?ു?ക[ൾള]")
# Two adjacent hyphen-suffixed -ഉം items with no comma between them
# (Columns-ഉം rows-ഉം, Step 1-ഉം 2-ഉം): he wants the comma always, single
# words included. Only the hyphenated form is matched — a bare -ും is also the
# future verb ending (ചെയ്യാനും കഴിയും), which would make this a noise source.
UM_PAIR_NO_COMMA_RE = re.compile(r"\S+-ഉം\s+\S+-ഉം")

# -- Round-4 comma splices (lecture-python-programming.ml#23, 2026-09-28) -----
# The largest class of the fourth review: two finite clauses joined by a comma
# where the editor writes a full stop (20 flags; the engine runs at ~17 sites
# per 100 prose lines across nine numpy draws, his text at ~3). Only 6 of the 23
# sites mirror an English comma splice — the rest render an English relative
# clause, "so that", a participle or an appositive as comma + resumptive
# pronoun — so rule 12's "split at comma splices" does not reach them.
#
# FIN is a finite verb ending. A bare -ും is NOT one (it is also the additive /
# concessive clitic: ആയതും, ആണെങ്കിലും, ശേഷവും), so future forms are listed.
_SPLICE_FUT = r"(?:ചെയ്യും|പ്പെടും|(?<!-)ക്കും|കഴിയും|കാണും|(?<!-)ആകും|ാകും|നൽകും|വരും|പോകും)"
_SPLICE_FIN = rf"(?:ുന്നു|ആണ്|ാണ്|ഉണ്ട്|ുണ്ട്|ില്ല|അല്ല|ാം|ുക|ഉള്ളൂ|ുള്ളൂ|{_SPLICE_FUT})"
_SPLICE_CLOSER = r"\*?(?:\s*\((?:[^()]|\([^()]*\))*\))?"
SPLICE_SITE_RE = re.compile(rf"(?P<fin>[^\s,]*{_SPLICE_FIN})(?P<closer>{_SPLICE_CLOSER}),\s+(?P<next>\S+)")
# The repairable subset: the next word is a resumptive pronoun or one of two
# connectives, and the clause carries on after it on the same line. He removed
# the comma at 13 of 13 such round-4 seed sites (10 with this exact full stop,
# 3 folded into a converb) and at the 12 such sites he edited in rounds 1-2
# (full stop 9, em-dash 2, semicolon 1; a 13th sits in a solution he reverted
# to English) — a full stop at 19 of 25. The pattern fires on none of his 70
# untouched round-4 lines or his four reviewed pages.
# An explicit list, never an open ഇവ\S* / അവ\S* (അവസ്ഥ, അവിടെ, ഇവിടെ).
SPLICE_RESUMPTIVE_RE = re.compile(
    r"^(?:ഇത്|ഇതിനെ|അത്|അതിനെ|(?:ഇവ|അവ)(?:യെ|യുടെ|യിൽ|യ്ക്ക്|യെല്ലാം|യോടൊപ്പം)?|അതിനാൽ|അതേസമയം)(?![ഀ-ൿ])"
)
# Not clauses, so not splices: a trailing "as shown" tag and a line-final list
# conjunction (", ഒപ്പം" before the next bullet).
SPLICE_TAG_TAIL_RE = re.compile(
    r"^\s*(?:താഴെ\s+\S+\s+(?:പോലെ|രീതിയിൽ)|`[^`]*`\s+(?:എന്ന\s+(?:പോലെ|രീതിയിൽ)|എന്നതുപോലെ|എന്നത്\s+പോലെ))\s*[.:]?\s*$"
)
# Finite-looking forms whose comma he keeps: the fronted imperatives rules 13/14
# require (ശ്രദ്ധിക്കുക, / ഓർക്കുക,) and എല്ലാം ("all", which ends like the modal
# -ാം — his reviewed python_by_example 275 "objects-ന് എല്ലാം, അവയിൽ …" is kept
# only by this). The concessive and additive endings are defensive: FIN admits
# no bare -ും today, and they keep it that way if the future list grows.
_SPLICE_KEEP_FIN_RE = re.compile(r"(?:ശ്രദ്ധിക്കുക|ഓർക്കുക|ങ്കിലും|ാലും|ായും|ുകയും|പോലും|ല്ലാം)\*?$")


def splice_sites(line: str) -> list[dict]:
    """Comma-joined finite clauses on one line. Each site carries `resumptive`
    (the repairable subset) and the span of the ", " to replace with ". "."""
    out: list[dict] = []
    for m in SPLICE_SITE_RE.finditer(line):
        fin = m.group("fin")
        before = line[: m.start("fin")]
        # The finite token must not open its sentence (തീർച്ചയായും, / ശ്രദ്ധിക്കുക,).
        head = LIST_ITEM_RE.sub("", re.split(r"[.:?!]\s", before)[-1])
        if not head.strip():
            continue
        if _SPLICE_KEEP_FIN_RE.search(fin):
            continue
        bare = fin.strip("*")
        # "X-ഉം അല്ല, Y-ഉം അല്ല" is the neither-nor coordination whose comma he
        # adds (ml#23 #7), and "*അല്ല*, ഇത് …" is a contrast he keeps.
        negator = bare in ("അല്ല", "ഇല്ല")
        tail = line[m.start("next"):]
        if SPLICE_TAG_TAIL_RE.match(tail) or re.match(r"ഒപ്പം\s*$", tail):
            continue
        if negator and re.search(r"ഉം\s+\*?$", before):
            continue
        # A pronoun that ends the line opens a list ("…ആവശ്യമാണ്, അത്" + bullets):
        # splitting there leaves a verbless "അത്:" sentence, so it is not repaired.
        carries_on = bool(line[m.end("next"):].strip(" :;"))
        out.append({
            "resumptive": bool(SPLICE_RESUMPTIVE_RE.match(m.group("next"))) and not negator and carries_on,
            "comma_start": m.end("closer"),
            "next_start": m.start("next"),
            "text": line[m.start("fin"): m.end("next")],
        })
    return out


def split_resumptive_splices(line: str) -> tuple[str, int]:
    """Replace the ", " of every resumptive splice on `line` with ". " (the
    editor's most common form: 19 of the 25 such sites he edited). Consumed by
    ml_repair.py, so the lint and the repair share one classifier. Never adds a
    comma after the connective."""
    sites = [s for s in splice_sites(line) if s["resumptive"]]
    for s in reversed(sites):
        line = line[: s["comma_start"]] + ". " + line[s["next_start"]:]
    return line, len(sites)


def _fence(stripped: str) -> tuple[str, int, str, str | None] | None:
    """(char, length, info, directive name) if the line is a fence line."""
    m = FENCE_LINE_RE.match(stripped)
    if not m:
        return None
    info = m.group(2).strip()
    d = DIRECTIVE_NAME_RE.match(info)
    # docutils lowercases directive names, so ```{Note} is a note
    return m.group(1)[0], len(m.group(1)), info, d.group(1).lower() if d else None


def _closes(f: tuple[str, int, str, str | None] | None, opener: tuple[str, int, str, str | None]) -> bool:
    # CommonMark: a closing fence is bare and at least as long as its opener.
    return f is not None and not f[2] and f[0] == opener[0] and f[1] >= opener[1]


def prose_line_info(text: str) -> list[dict]:
    """Every prose line outside frontmatter and non-prose fences — including the
    bodies of PROSE_DIRECTIVES — with its paragraph position, so a hard-wrapped
    paragraph is checked at its start (capitalisation) and end (punctuation)
    rather than on every wrapped line.

    Fences follow CommonMark, unlike strip_to_prose's toggle: a fence's body is
    raw content until a bare closing fence at least as long as its opener, so a
    fence line with an info string (```` ```{hint} ```` inside an unclosed
    ```` ```{exercise-start} ````) never closes or re-opens anything. The toggle
    lost parity there in python_by_example and linted a code cell as prose.
    Inside a prose directive one nested level is tracked, so a code cell inside
    a longer-fenced {note} is not scanned."""
    lines = text.split("\n")
    i = 0
    if lines and lines[0].strip() == "---":
        i = 1
        while i < len(lines) and lines[i].strip() != "---":
            i += 1
        i += 1
    outer = inner = None
    is_prose = [False] * len(lines)
    for idx in range(i, len(lines)):
        line = lines[idx]
        stripped = line.lstrip()
        f = _fence(stripped)
        if outer is None:
            if f is not None:
                outer = f
                continue
        elif _closes(f, outer):
            outer = inner = None
            continue
        elif inner is not None:
            if _closes(f, inner):
                inner = None
            continue
        elif outer[3] not in PROSE_DIRECTIVES:
            continue
        elif f is not None:
            inner = f
            continue
        if not stripped or HEADING_RE.match(stripped) or DIRECTIVE_LINE_RE.match(line):
            continue
        is_prose[idx] = True
    out: list[dict] = []
    in_item = False
    for idx, line in enumerate(lines):
        if not is_prose[idx]:
            continue
        nxt = next((lines[j] for j in range(idx + 1, len(lines)) if lines[j].strip()), None)
        is_item = bool(LIST_ITEM_RE.match(line))
        prev_prose = idx > 0 and is_prose[idx - 1]
        next_prose = idx + 1 < len(lines) and is_prose[idx + 1]
        next_item = next_prose and bool(LIST_ITEM_RE.match(lines[idx + 1]))
        starts_para = is_item or not prev_prose
        if starts_para:
            in_item = is_item
        out.append({
            "n": idx + 1, "line": line, "next": nxt,
            "starts_para": starts_para,
            "ends_para": not next_prose or next_item,
            # a list item, or a wrapped continuation of one
            "in_item": in_item,
        })
    return out


def prose_lines(text: str) -> list[tuple[int, str, str | None]]:
    """(1-based line number, line, next non-blank line) for every prose line;
    see prose_line_info."""
    return [(p["n"], p["line"], p["next"]) for p in prose_line_info(text)]


def round2_lints(text: str) -> dict:
    """Terminal punctuation, sentence-initial capitalisation, banned renderings,
    plurals, -ഉം pairs and comma splices — only on lines that carry Malayalam,
    so an English-retained line (kept byte-identical to source) is never flagged."""
    punct: list[dict] = []
    caps: list[dict] = []
    banned: list[dict] = []
    plural: list[dict] = []
    um_pair: list[dict] = []
    splice_watch: list[dict] = []
    splice_resumptive: list[dict] = []
    for p in prose_line_info(text):
        n, line, nxt = p["n"], p["line"], p["next"]
        has_ml = bool(MALAYALAM_RE.search(line))
        body = line.rstrip()
        if has_ml and not p["in_item"] and p["ends_para"]:
            # The editor's own convention (ml#7): a colon when the sentence
            # points forward ("… താഴെ കാണാം:"), a full stop when it merely
            # precedes the cell, a comma before a list it opens. Only a BARE
            # ending — the engine's habit of mirroring an unpunctuated English
            # line — is a defect, so that is all this flags. A closing bracket
            # is terminated only when a stop precedes it: "(… memory.)" is, and
            # "(… memory)" is not (he added the stop at ml#23 197 and at
            # functions 286 in round 2; he accepted "...)").
            introduces = nxt is not None and (CELL_OR_MATH_RE.match(nxt) or LIST_ITEM_RE.match(nxt))
            if introduces and not re.search(r"(?:[.:,]|[.!?:…]\))$", body):
                punct.append({"line": n, "kind": "bare ending before a cell or list (colon or full stop expected)", "text": body[-60:]})
            elif not introduces and not re.search(r"(?:[.:?!]|[.:?!…]\))$", body):
                punct.append({"line": n, "kind": "paragraph without terminal punctuation", "text": body[-60:]})
        if has_ml and p["starts_para"]:
            head = LIST_ITEM_RE.sub("", body).lstrip("(")
            # A sentence may open with a MyST role — test the link text, since
            # the rule requires {ref}`Previous lecture …`, not `previous`.
            head = ROLE_PREFIX_RE.sub("", head)
            # A plain lowercase English word opening the sentence; identifiers
            # and code-like tokens (if/else, np.random, x_t) are exempt.
            if re.match(r"[a-z][a-z-]*(\s|$)", head):
                caps.append({"line": n, "text": head[:50]})
        for sub, fix in BANNED_RENDERINGS:
            if sub in line:
                banned.append({"line": n, "rendering": sub, "rule": fix})
        if has_ml:
            for m in ML_PLURAL_ON_LATIN_RE.finditer(body):
                plural.append({"line": n, "text": body[max(0, m.start() - 20) : m.end() + 6]})
            for m in UM_PAIR_NO_COMMA_RE.finditer(body):
                um_pair.append({"line": n, "text": m.group(0)})
            for s in splice_sites(body):
                splice_watch.append({"line": n, "text": s["text"]})
                if s["resumptive"]:
                    splice_resumptive.append({"line": n, "text": s["text"]})
    return {
        "terminal_punctuation": punct,
        "lowercase_initial": caps,
        "banned_renderings": banned,
        "malayalam_plural_on_english_noun": plural,
        "um_pair_without_comma": um_pair,
        # Report-only: every comma-joined finite clause. His reviewed pages keep
        # 1-4 per lecture from round 2 on (parallel clauses, "…ആണ്, പക്ഷേ …:"),
        # so 0 is not the target; read it with comma_splice_rate. A secondary
        # best-of-N key at most — never a primary one.
        "comma_splice_watch": splice_watch,
        # The subset ml_repair.py splits into two sentences.
        "comma_splice_resumptive": splice_resumptive,
    }


def comma_splice_rate(text: str) -> dict:
    """Splice sites per 100 Malayalam prose lines. Reference, 2026-09-28: nine
    numpy draws 13.1-21.0 (mean 17.2); the editor's reviewed pages numpy 2.8,
    functions 2.8, matplotlib 1.6 (rounds 2-4) and python_by_example 8.7
    (round 1, before he was splitting these)."""
    ml_lines = [p for p in prose_line_info(text) if MALAYALAM_RE.search(p["line"])]
    sites = [s for p in ml_lines for s in splice_sites(p["line"].rstrip())]
    n = len(ml_lines)
    return {
        "malayalam_prose_lines": n,
        "sites": len(sites),
        "resumptive": sum(s["resumptive"] for s in sites),
        "per_100_lines": round(100 * len(sites) / n, 1) if n else 0.0,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output", required=True, type=Path, help="translated ml document")
    ap.add_argument("--source", type=Path, help="English source (enables FAIL gates)")
    ap.add_argument("--glossary", type=Path, default=Path("glossary/ml.json"))
    ap.add_argument("--reference", type=Path, help="native-speaker reference (ratio band)")
    ap.add_argument("--top-tokens", type=int, default=30)
    ap.add_argument("--json", action="store_true", dest="as_json")
    args = ap.parse_args()

    out_text = args.output.read_text(encoding="utf-8")
    out_prose = strip_to_prose(out_text)
    glossary = json.loads(args.glossary.read_text(encoding="utf-8"))
    pinned = [t for t in glossary["terms"] if t["en"] == t["ml"]]
    everyday = [t for t in glossary["terms"] if t["en"] != t["ml"]]

    result: dict = {"output": str(args.output), "fail": [], "warn": []}

    # -- Heading fidelity + pinned-term retention (need the source) ----------
    if args.source:
        src_text = args.source.read_text(encoding="utf-8")
        src_prose = strip_to_prose(src_text)

        src_h, out_h = headings(src_text), headings(out_text)
        result["headings"] = {"source": len(src_h), "output": len(out_h), "identical": src_h == out_h}
        if src_h != out_h:
            diffs = [
                {"index": i, "source": s, "output": o}
                for i, (s, o) in enumerate(zip(src_h, out_h))
                if s != o
            ]
            if len(src_h) != len(out_h):
                diffs.append({"index": "count", "source": len(src_h), "output": len(out_h)})
            result["headings"]["diffs"] = diffs
            result["fail"].append(f"heading fidelity: {len(diffs)} difference(s)")

        retention = []
        for t in pinned:
            s_n, o_n = count_term(t["en"], src_prose), count_term(t["en"], out_prose)
            if s_n > 0:
                retention.append({"term": t["en"], "source": s_n, "output": o_n, "ok": o_n >= s_n})
        lost = [r for r in retention if not r["ok"]]
        result["pinned_retention"] = {"checked": len(retention), "lost": lost}
        if lost:
            result["fail"].append(
                "pinned-term retention: " + ", ".join(f"{r['term']} {r['source']}->{r['output']}" for r in lost)
            )

        result["everyday_terms"] = [
            {
                "en": t["en"],
                "ml": t["ml"],
                "source_en": count_term(t["en"], src_prose),
                "output_ml_exact": out_prose.count(t["ml"]),
                "note": "informational — inflection alters endings",
            }
            for t in everyday
        ]

    # -- Casing consistency (output only) ------------------------------------
    inconsistent = []
    for t in pinned:
        forms = surface_forms(t["en"], out_prose)
        # Tolerate sentence-initial capitalization of an otherwise-lowercase term
        folded = {f.lower() for f in forms}
        if len(folded) == 1 and len(forms) > 1 and not any(f.isupper() for f in forms):
            continue
        if len(forms) > 1:
            inconsistent.append({"term": t["en"], "forms": forms})
    result["casing"] = inconsistent
    if inconsistent:
        result["warn"].append(
            "casing variants: " + ", ".join(f"{c['term']} {c['forms']}" for c in inconsistent)
        )

    # -- Script-ratio band ----------------------------------------------------
    out_stats = ratio_stats(paragraph_ratios(out_prose))
    result["script_ratio"] = {"output": out_stats}
    if args.reference:
        ref_prose = strip_to_prose(args.reference.read_text(encoding="utf-8"))
        ref_stats = ratio_stats(paragraph_ratios(ref_prose))
        result["script_ratio"]["reference"] = ref_stats
        if out_stats["n"] and ref_stats["n"]:
            lo, hi = ref_stats["p10"] - 0.05, ref_stats["p90"] + 0.05
            if not (lo <= out_stats["mean"] <= hi):
                direction = "over-translation" if out_stats["mean"] > hi else "untranslated prose"
                result["warn"].append(
                    f"script ratio mean {out_stats['mean']} outside reference band "
                    f"[{round(lo, 3)}, {round(hi, 3)}] — suggests {direction}"
                )

    # -- Round-2 lints (LINT, not FAIL — prototype until Phase 3 graduation) --
    result["lint"] = round2_lints(out_text)
    result["comma_splice_rate"] = comma_splice_rate(out_text)

    # -- Token list for the manual transliteration scan -----------------------
    result["malayalam_tokens_top"] = malayalam_tokens(out_prose, args.top_tokens)

    if args.as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"== ml metrics: {args.output} ==")
        for key in ("headings", "pinned_retention", "script_ratio", "comma_splice_rate"):
            if key in result:
                print(f"{key}: {json.dumps(result[key], ensure_ascii=False)}")
        print(f"casing variants: {len(result['casing'])}")
        lint = result["lint"]
        print(
            "round-2 lints: "
            + ", ".join(f"{k}={len(v)}" for k, v in lint.items())
        )
        for key, items in lint.items():
            for it in items:
                detail = it.get("kind") or it.get("rule") or ""
                print(f"  LINT {key} L{it['line']}: {detail} — {it.get('text') or it.get('rendering')}")
        print("top Malayalam tokens (scan for transliterated English):")
        for tok, n in result["malayalam_tokens_top"]:
            print(f"  {n:4d}  {tok}")
        for w in result["warn"]:
            print(f"WARN: {w}")
        for f in result["fail"]:
            print(f"FAIL: {f}")
        if not result["fail"] and not result["warn"]:
            print("all gates clean")

    return 1 if result["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
