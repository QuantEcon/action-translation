#!/usr/bin/env python3
"""Rank reference-vs-output divergences into a bounded adjudication list (#228 Stage 1).

The reference has 151 prose paragraphs. A naive paragraph diff hands a volunteer
reviewer 150 items and gets no reply, so this ranks divergences into the three
classes #228 specifies and caps the result:

  1. term-treatment    — a source term kept in Latin by one rendering and put into
                         Malayalam script by the other. Highest yield: each answer
                         is a glossary entry.
  2. morphology        — the same English root carrying a different case-suffix or a
                         different attachment form (hyphenated vs bare) between the
                         two renderings. The class where a native speaker is
                         irreplaceable.
  3. ratio-outlier     — paragraphs whose Malayalam share sits far from the
                         reference's own rendering of the same paragraph. Catches
                         over- and under-translation in one measure.

Everything the deterministic FAIL gates in `ml_metrics.py` already decide is
excluded by construction — this script is only for questions a script cannot
settle. Divergences below the cap are still emitted (with `above_cap: false`) so
the report can carry them as evidence without putting them to the reviewer.

Byte fidelity: every quoted string is sliced from the file, never reconstructed.
Malayalam ZWJ/ZWNJ survive.

Usage:
    python3 divergences.py --source EN.md --reference REF.md --output OUT.md \
        --glossary ../../../glossary/ml.json --cap 30 [--json]
"""

import argparse
import json
import re
import statistics
import sys
import unicodedata
from pathlib import Path

MALAYALAM = re.compile(r"[ഀ-ൿ]")
LATIN_WORD = re.compile(r"[A-Za-z][A-Za-z0-9_.]*(?:'[a-z]+)?")
# an English root immediately followed by Malayalam, with or without a joiner
MORPH = re.compile(r"([A-Za-z][A-Za-z0-9_.]*)([-‐‑]?)([ഀ-ൿ‌‍]+)")
FENCE = re.compile(r"^\s*(`{3,}|~{3,})")
HEADING = re.compile(r"^#{1,6}\s")

STOP = set("""a an the and or but if then else for of to in on at by with from as is are was were be been
being do does did doing have has had having this that these those it its he she they we you i not no nor
so than too very can will just should now s t don d ll m o re ve y ain aren couldn didn doesn hadn hasn
haven isn ma mightn mustn needn shan shouldn wasn weren won wouldn about above after again against all
am any because before below between both by during each few further here how into itself more most
once only other our out over own same some such through under until up what when where which while who
whom why your also may might must shall would could there their them then they've you're we'll let lets
one two three first second next last e.g i.e etc via per""".split())


def strip_to_prose(text: str) -> str:
    """Drop fenced blocks and headings — the same convention ml_metrics.py uses."""
    out, in_fence, marker = [], False, ""
    for line in text.split("\n"):
        m = FENCE.match(line)
        if m:
            tok = m.group(1)
            if not in_fence:
                in_fence, marker = True, tok[0]
            elif tok[0] == marker:
                in_fence = False
            continue
        if in_fence:
            continue
        if HEADING.match(line):
            continue
        out.append(line)
    return "\n".join(out)


def paragraphs(prose: str) -> list[str]:
    return [p for p in re.split(r"\n\s*\n", prose) if p.strip()]


def ratio(p: str) -> float | None:
    ml = len(MALAYALAM.findall(p))
    la = len(re.findall(r"[A-Za-z]", p))
    return ml / (ml + la) if ml + la >= 12 else None


def latin_terms(prose: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for w in LATIN_WORD.findall(prose):
        lw = w.lower().rstrip(".")  # `programs.` and `programs` are one term
        if not lw or lw in STOP or len(lw) < 3 or lw.isdigit():
            continue
        counts[lw] = counts.get(lw, 0) + 1
    return counts


def morph_forms(prose: str) -> dict[str, dict[str, int]]:
    """Latin root -> {suffix-with-joiner: count}."""
    res: dict[str, dict[str, int]] = {}
    for root, joiner, suffix in MORPH.findall(prose):
        lr = root.lower()
        if lr in STOP or len(root) < 3:
            continue
        key = f"{joiner}{suffix}"
        res.setdefault(lr, {})
        res[lr][key] = res[lr].get(key, 0) + 1
    return res


def anchor_tokens(para: str) -> set[str]:
    """Language-independent content anchors: Latin words, URLs and code spans.

    A Malayalam translation of a QuantEcon paragraph keeps its technical terms,
    library names, URLs and inline code in Latin script, so these survive
    translation and identify the paragraph across two independent renderings.
    """
    toks = set()
    for url in re.findall(r"https?://[^\s)\]]+", para):
        toks.add(url.rstrip(".,)"))
    for span in re.findall(r"`([^`\n]+)`", para):
        toks.add("`" + span.strip().lower() + "`")
    for w in LATIN_WORD.findall(para):
        lw = w.lower().rstrip(".")
        if lw and lw not in STOP and len(lw) >= 3:
            toks.add(lw)
    return toks


def align_paragraphs(rp: list[str], op: list[str], floor: float = 0.30):
    """Monotonic best-overlap alignment between two paragraph sequences.

    Needleman-Wunsch over Jaccard similarity of anchor-token sets, with a zero
    score for gaps. Returns (pairs, stats) where pairs is [(ref_i, out_j, sim)]
    for matches at or above `floor`; anything weaker is left unpaired and counted,
    because a guessed pair becomes a nonsense question in the reviewer's packet.
    """
    ra = [anchor_tokens(p) for p in rp]
    oa = [anchor_tokens(p) for p in op]

    def sim(i: int, j: int) -> float:
        a, b = ra[i], oa[j]
        if not a or not b:
            return 0.0
        inter = len(a & b)
        return inter / len(a | b) if inter else 0.0

    n, m = len(rp), len(op)
    # DP table; band the search to +/-12 to keep it cheap and to forbid wild jumps
    band = 12
    NEG = float("-inf")
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    bk = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            if abs(i - j) > band or dp[i][j] == NEG:
                continue
            cur = dp[i][j]
            if i < n and j < m:
                s = cur + sim(i, j)
                if s > dp[i + 1][j + 1]:
                    dp[i + 1][j + 1], bk[i + 1][j + 1] = s, (i, j, "match")
            if i < n and cur > dp[i + 1][j]:
                dp[i + 1][j], bk[i + 1][j] = cur, (i, j, "gap-ref")
            if j < m and cur > dp[i][j + 1]:
                dp[i][j + 1], bk[i][j + 1] = cur, (i, j, "gap-out")

    # walk back from the best reachable terminal cell
    best, bi, bj = NEG, n, m
    for i in range(n + 1):
        for j in range(m + 1):
            if dp[i][j] > NEG and (i == n or j == m) and dp[i][j] > best:
                best, bi, bj = dp[i][j], i, j
    path = []
    i, j = bi, bj
    while bk[i][j] is not None:
        pi, pj, kind = bk[i][j]
        if kind == "match":
            path.append((pi, pj))
        i, j = pi, pj
    path.reverse()

    pairs, weak = [], 0
    for i, j in path:
        s = sim(i, j)
        if s >= floor:
            pairs.append((i, j, s))
        else:
            weak += 1
    stats = {
        "reference_paragraphs": n,
        "output_paragraphs": m,
        "aligned": len(pairs),
        "below_floor": weak,
        "unmatched_reference": n - len(path),
        "unmatched_output": m - len(path),
        "floor": floor,
        "mean_similarity": round(sum(p[2] for p in pairs) / len(pairs), 3) if pairs else 0.0,
    }
    return pairs, stats


def lemma(word: str) -> str:
    """Crude inflectional collapse so `use`/`using`/`used` form one question.

    Deliberately not a real stemmer: the point is only to stop the same English
    word producing several contradictory rows, and an aggressive stemmer would
    merge genuinely distinct technical terms (`index`/`indices` is fine to merge,
    `array`/`arrange` is not).
    """
    w = word.lower()
    for suf in ("'s", "ing", "ies", "es", "ed", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            stem = w[: -len(suf)]
            if suf == "ies":
                return stem + "y"
            if suf == "ing" and len(stem) > 2 and stem[-1] == stem[-2]:
                return stem[:-1]
            # `process` -> `proces` is not a lemma; a stem still ending in the
            # suffix letter means the word was never inflected in the first place
            if suf in ("s", "es") and stem.endswith("s"):
                return w
            return stem
    return w


def technical_vocabulary(raw_source: str, pinned: set[str]) -> set[str]:
    """Terms with positive evidence of being technical rather than ordinary prose.

    Signals, in the source document only (never in a translation, which would let
    a rendering decide its own question):
      * pinned in the glossary
      * appears inside backticks or a fenced code block
      * carries an internal dot or underscore (`np.array`, `sys_path`)
      * capitalised somewhere other than sentence-initial position
    """
    tech = set(pinned)
    for span in re.findall(r"`([^`\n]+)`", raw_source):
        for w in LATIN_WORD.findall(span):
            tech.add(w.lower())
            tech.add(lemma(w))
    for m in re.finditer(r"\b[A-Za-z][A-Za-z0-9]*[._][A-Za-z0-9_.]+\b", raw_source):
        tech.add(m.group(0).lower())
    # capitalised mid-sentence: preceded by a word character run and a space, but
    # not immediately after a sentence terminator
    for m in re.finditer(r"(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{2,})\b", raw_source, re.M):
        tech.add(m.group(1).lower())
        tech.add(lemma(m.group(1)))
    for t in list(tech):
        tech.add(lemma(t))
    return tech


def contexts(prose: str, needle: str, limit: int = 2, width: int = 110) -> list[str]:
    """Byte-exact excerpts around a needle, for evidence in the packet."""
    out, start = [], 0
    low, nlow = prose.lower(), needle.lower()
    while len(out) < limit:
        i = low.find(nlow, start)
        if i < 0:
            break
        a = max(0, i - width // 2)
        b = min(len(prose), i + len(needle) + width // 2)
        out.append(prose[a:b].replace("\n", " ").strip())
        start = i + len(needle)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--reference", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--glossary", type=Path)
    ap.add_argument("--cap", type=int, default=30)
    ap.add_argument("--min-count", type=int, default=2,
                    help="minimum source occurrences for a term-treatment question")
    ap.add_argument("--delta-floor", type=float, default=0.30,
                    help="minimum absolute difference in Malayalam share between the "
                         "two renderings of a paragraph to raise it as a question")
    ap.add_argument("--align-floor", type=float, default=0.30,
                    help="minimum anchor-token Jaccard for a paragraph pair to be "
                         "trusted; weaker pairs are counted, never questioned")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    src = strip_to_prose(args.source.read_text(encoding="utf-8"))
    ref = strip_to_prose(args.reference.read_text(encoding="utf-8"))
    out = strip_to_prose(args.output.read_text(encoding="utf-8"))

    pinned: set[str] = set()
    if args.glossary and args.glossary.exists():
        g = json.loads(args.glossary.read_text(encoding="utf-8"))
        terms = g.get("terms", g)
        it = terms.items() if isinstance(terms, dict) else [
            (t.get("source") or t.get("term"), t) for t in terms]
        for k, _ in it:
            if k:
                pinned.add(str(k).lower())

    raw_src = args.source.read_text(encoding="utf-8")
    technical = technical_vocabulary(raw_src, pinned)

    s_terms = latin_terms(src)
    r_terms, o_terms = latin_terms(ref), latin_terms(out)
    findings = []

    # -- class 1: term treatment ---------------------------------------------
    # Grouped by lemma first: `use`/`using`/`used` are one question, not three,
    # and reporting them separately produced contradictory "kept by reference" /
    # "kept by output" rows for the same word in the first version of this script.
    groups: dict[str, dict] = {}
    for term, n in s_terms.items():
        if n < args.min_count:
            continue
        in_ref, in_out = r_terms.get(term, 0), o_terms.get(term, 0)
        if (in_ref == 0) == (in_out == 0):
            continue
        lem = lemma(term)
        g = groups.setdefault(lem, {"surface": {}, "src": 0, "ref": 0, "out": 0})
        g["surface"][term] = n
        g["src"] += n
        g["ref"] += in_ref
        g["out"] += in_out

    ordinary = []
    for lem, g in sorted(groups.items(), key=lambda kv: -kv[1]["src"]):
        if g["ref"] == 0 and g["out"] == 0:
            continue
        kept = "reference" if g["ref"] > g["out"] else "output"
        is_tech = any(s in technical for s in g["surface"]) or lem in technical
        item = {
            "class": "term-treatment",
            "term": lem,
            "surface_forms": sorted(g["surface"]),
            "source_count": g["src"],
            "reference_count": g["ref"],
            "output_count": g["out"],
            "kept_english_by": kept,
            "translated_by": "output" if kept == "reference" else "reference",
            "pinned": lem in pinned,
            "technical": is_tech,
            "resolves_to": "glossary entry",
        }
        if is_tech:
            item["score"] = g["src"] * 10 + (5 if lem in pinned else 0)
            item["reference_context"] = contexts(ref, lem)
            item["output_context"] = contexts(out, lem)
            findings.append(item)
        else:
            ordinary.append(item)

    # The ordinary-vocabulary cases are one register question, not N glossary
    # questions. Enumerating them individually is what made the first run of this
    # script produce thirty rows about `use`, `top`, `right` and `green` — a bad
    # use of a volunteer's afternoon, and the wrong shape of question besides:
    # the answer is a language-config rule, not thirty glossary entries.
    if ordinary:
        by_ref = [o for o in ordinary if o["kept_english_by"] == "reference"]
        by_out = [o for o in ordinary if o["kept_english_by"] == "output"]
        findings.append({
            "class": "term-treatment",
            "term": "(clustered) ordinary English vocabulary",
            "cluster": True,
            "count": len(ordinary),
            "kept_english_by_reference": sorted(o["term"] for o in by_ref),
            "kept_english_by_output": sorted(o["term"] for o in by_out),
            "score": 10_000,  # ranks first: it subsumes the largest divergence class
            "resolves_to": "language-config rule change",
            "members": ordinary,
        })

    # -- class 2: morphology -------------------------------------------------
    # Clustered by the *transformation* rather than by root: if the reference
    # writes `-ലെ` where the output writes `-യിലെ` on five different English
    # roots, that is one rule question, not five. Idiosyncratic single-root
    # differences stay individual — those are the ones that may be plain errors.
    r_morph, o_morph = morph_forms(ref), morph_forms(out)
    morph_items = []
    for root in sorted(set(r_morph) & set(o_morph)):
        rs, os_ = set(r_morph[root]), set(o_morph[root])
        if rs == os_:
            continue
        r_join = any(k.startswith(("-", "‐", "‑")) for k in rs)
        o_join = any(k.startswith(("-", "‐", "‑")) for k in os_)
        morph_items.append({
            "root": root,
            "kind": "attachment" if r_join != o_join else "suffix",
            "reference_forms": sorted(rs),
            "output_forms": sorted(os_),
            "ref_only": sorted(rs - os_),
            "out_only": sorted(os_ - rs),
            "reference_total": sum(r_morph[root].values()),
            "output_total": sum(o_morph[root].values()),
        })

    sig_groups: dict[tuple, list[dict]] = {}
    for it in morph_items:
        sig_groups.setdefault((tuple(it["ref_only"]), tuple(it["out_only"])), []).append(it)

    for (ref_only, out_only), members in sorted(
            sig_groups.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        if len(members) >= 2:
            findings.append({
                "class": "morphology",
                "root": f"(clustered) {len(members)} roots",
                "cluster": True,
                "kind": members[0]["kind"],
                "reference_only_forms": list(ref_only),
                "output_only_forms": list(out_only),
                "roots": sorted(m["root"] for m in members),
                "score": 60 + 5 * len(members),
                "reference_context": contexts(ref, members[0]["root"]),
                "output_context": contexts(out, members[0]["root"]),
                "resolves_to": "rule change or accepted-as-is",
                "members": members,
            })
        else:
            m = members[0]
            findings.append({
                "class": "morphology",
                **m,
                "score": (8 if m["kind"] == "attachment" else 4)
                         + min(m["output_total"], 6),
                "reference_context": contexts(ref, m["root"]),
                "output_context": contexts(out, m["root"]),
                "resolves_to": "rule change or accepted-as-is",
            })

    # -- class 3: ratio outliers --------------------------------------------
    # These MUST be compared on genuinely corresponding paragraphs. Pairing by
    # index does not work and silently produces nonsense: the reference splits a
    # paragraph the output keeps whole (reference index 20 on getting_started.md),
    # so everything after it is off by one and the class filled up with
    # comparisons between an anchor line like `(install_anaconda)=` and an
    # unrelated prose sentence. The two documents having the same paragraph count
    # (156 each) was coincidence — offsetting splits and merges — so a count
    # check does not detect it either.
    #
    # Alignment therefore runs on content: both renderings keep the same Latin
    # technical tokens, URLs and code spans, so paragraphs are matched by Latin
    # token overlap under a monotonicity constraint. Pairs below the similarity
    # floor are reported as unalignable rather than guessed at.
    rp, op = paragraphs(ref), paragraphs(out)
    rr = [r for r in (ratio(p) for p in rp) if r is not None]
    band_lo = statistics.quantiles(rr, n=10, method="inclusive")[0]
    band_hi = statistics.quantiles(rr, n=10, method="inclusive")[-1]

    pairs, align_stats = align_paragraphs(rp, op, floor=args.align_floor)
    for i, j, sim in pairs:
        a, b = rp[i], op[j]
        ra, rb = ratio(a), ratio(b)
        if ra is None or rb is None:
            continue
        delta = rb - ra
        # Trigger on the DISAGREEMENT between the two renderings only.
        #
        # An earlier version also triggered when the output paragraph fell outside
        # the reference's p10-p90 band, which is a guaranteed false-positive
        # generator: by construction ~20% of any distribution lies outside its own
        # p10-p90. Comparing the reference against itself produced 28 "outliers" on
        # 151 paragraphs — pairs where the two renderings are byte-identical. Band
        # membership is a distributional summary, not a per-paragraph acceptance
        # range, so it is kept as annotation and never as a trigger.
        if abs(delta) < args.delta_floor:
            continue
        findings.append({
            "class": "ratio-outlier",
            "reference_paragraph": i,
            "output_paragraph": j,
            "alignment_similarity": round(sim, 3),
            "reference_ratio": round(ra, 3),
            "output_ratio": round(rb, 3),
            "delta": round(delta, 3),
            "direction": "more Malayalam in output" if delta > 0 else "more English in output",
            "outside_band": not (band_lo <= rb <= band_hi),
            "score": int(abs(delta) * 20) + int(sim * 5),
            "reference_text": a.replace("\n", " ").strip()[:400],
            "output_text": b.replace("\n", " ").strip()[:400],
            "resolves_to": "depends on direction",
        })

    class_rank = {"term-treatment": 0, "morphology": 1, "ratio-outlier": 2}
    findings.sort(key=lambda f: (class_rank[f["class"]], -f["score"]))

    # #228 ranks the classes 1-2-3, but filling the cap strictly in class order
    # spends all thirty slots on classes 1 and 2 and puts *zero* ratio outliers to
    # the reviewer — and the outliers are the sharpest items in the set (a
    # paragraph the reference left wholly English and the output rendered 87%
    # Malayalam is a better question than a single-occurrence suffix difference).
    # So the cap is allocated as a quota per class, preserving the priority
    # ordering while guaranteeing every class is represented. Unused quota flows
    # to the next class so the cap is always filled.
    quota = {"term-treatment": 8, "morphology": 12, "ratio-outlier": 10}
    scale = args.cap / sum(quota.values())
    budget = {k: max(1, round(v * scale)) for k, v in quota.items()}
    selected, taken = [], {k: 0 for k in quota}
    for cls in ("term-treatment", "morphology", "ratio-outlier"):
        for f in findings:
            if f["class"] != cls or taken[cls] >= budget[cls]:
                continue
            selected.append(f)
            taken[cls] += 1
    if len(selected) < args.cap:  # spill: fill remaining slots by class priority
        chosen = {id(f) for f in selected}
        for f in findings:
            if len(selected) >= args.cap:
                break
            if id(f) not in chosen:
                selected.append(f)
    sel_ids = {id(f) for f in selected[: args.cap]}
    ordered = selected[: args.cap] + [f for f in findings if id(f) not in sel_ids]
    findings = ordered
    for i, f in enumerate(findings):
        f["rank"] = i + 1
        f["above_cap"] = i < args.cap
    quota_report = {"budget": budget, "taken": taken}

    summary = {
        "source": str(args.source),
        "reference": str(args.reference),
        "output": str(args.output),
        "alignment": align_stats,
        "reference_band": {"p10": round(band_lo, 3), "p90": round(band_hi, 3)},
        "counts": {k: sum(1 for f in findings if f["class"] == k) for k in class_rank},
        "total": len(findings),
        "cap": args.cap,
        "above_cap": min(args.cap, len(findings)),
        "quota": quota_report,
    }

    if args.json:
        print(json.dumps({"summary": summary, "findings": findings},
                         ensure_ascii=False, indent=2))
        return 0

    print(json.dumps(summary, indent=2))
    print()
    for f in findings[: args.cap]:
        if f["class"] == "term-treatment":
            if f.get("cluster"):
                print(f"[{f['rank']:2d}] term-treatment CLUSTER  {f['count']} ordinary words  "
                      f"→ {f['resolves_to']}")
                print(f"       kept English by reference, translated by output "
                      f"({len(f['kept_english_by_reference'])}): "
                      f"{', '.join(f['kept_english_by_reference'])}")
                if f["kept_english_by_output"]:
                    print(f"       kept English by output, translated by reference "
                          f"({len(f['kept_english_by_output'])}): "
                          f"{', '.join(f['kept_english_by_output'])}")
            else:
                print(f"[{f['rank']:2d}] term-treatment  {f['term']!r} "
                      f"{f['surface_forms']}  src×{f['source_count']}  "
                      f"ref×{f['reference_count']} out×{f['output_count']}  "
                      f"kept-English-by={f['kept_english_by']}"
                      f"{'  PINNED' if f['pinned'] else ''}")
        elif f["class"] == "morphology":
            if f.get("cluster"):
                print(f"[{f['rank']:2d}] morphology CLUSTER  ({f['kind']})  "
                      f"ref-only={f['reference_only_forms']} "
                      f"out-only={f['output_only_forms']}  on {len(f['roots'])} roots: "
                      f"{', '.join(f['roots'])}")
            else:
                print(f"[{f['rank']:2d}] morphology  {f['root']!r}  ({f['kind']})  "
                      f"ref={f['reference_forms']}  out={f['output_forms']}")
        else:
            print(f"[{f['rank']:2d}] ratio-outlier  ref¶{f['reference_paragraph']}"
                  f"/out¶{f['output_paragraph']} (sim {f['alignment_similarity']})  "
                  f"ref={f['reference_ratio']} out={f['output_ratio']} "
                  f"delta={f['delta']:+.3f}  {f['direction']}"
                  f"{'  OUTSIDE-BAND' if f['outside_band'] else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
