"""Measure the held-rule-edits arm (action-translation#404) on raw drafts.

usage: python3 -I analyze.py ENGINE_ROOT ENGLISH_DIR REFERENCE_DIR ARM_DIR
Writes ARM_DIR/records.jsonl (one row per draft; the ablation arms are in records-ablation.jsonl) and prints the summary tables.
ENGINE_ROOT supplies experiments/ml-benchmark/scripts/ml_metrics.py, the round-4
arm's align.py, glossary/ml.json and dist/verbatim-directives.js.
"""
import json, random, re, subprocess, sys
from collections import Counter, defaultdict
from math import comb
from pathlib import Path

root, en_dir, ref_dir, arm_dir = map(Path, sys.argv[1:5])
sys.path.insert(0, str(root / "experiments/ml-benchmark/scripts"))
sys.path.insert(0, str(root / "experiments/ml-benchmark/arms/2026-09-28-round4-prompt-trims"))
import ml_metrics as M  # noqa: E402
from align import align  # noqa: E402

LECTURES = ["pandas", "numpy", "functions"]
ARMS = ["control", "candidate"]
ML = re.compile("[ഀ-ൿ]")
CELL = re.compile(r"^```\{code-cell\}[^\n]*\n.*?^```\s*$", re.S | re.M)
BULLET = re.compile(r"^\s*(\*|-|\d+\.)\s")

# *now* sites, labelled by the reviewed edition's rendering at each (see README)
NOW_SITES = {
    "pandas": [("you can now proceed", "next"), ("We could now write", "next"),
               ("that we can now manipulate", "next"), ("Plotting as before now yields", "moment"),
               ("For now let's work through", "moment")],
    "numpy": [("Now `b` is an independent copy", "moment"), ("Now, let's look at the output of the htop", "moment")],
    "functions": [("Now that we've defined this function", "next"), ("Now, when we call the function", "next")],
}
FORMULAS = {"pandas": ["In essence,", "In practice,"], "numpy": ["In essence,"], "functions": []}
LEAD_IN = {"pandas": "For the `.apply()` method"}
NODE = """
const { findVerbatimViolations } = require(process.argv[1]);
const fs = require('fs');
console.log(findVerbatimViolations(fs.readFileSync(process.argv[2], 'utf8'), fs.readFileSync(process.argv[3], 'utf8')).length);
"""


def keyed(pairs):
    """(anchor, en, occurrence) -> translated paragraph."""
    seen, out = Counter(), {}
    for p in pairs:
        k = (p["anchor"], p["en"])
        out[(k, seen[k])] = p["tr"]
        seen[k] += 1
    return out


def measure(lec, arm, draw, path, en, ref_keyed):
    text = path.read_text(encoding="utf-8")
    src_path = en_dir / "lectures" / f"{lec}.md"
    res = subprocess.run([sys.executable, "-I", str(root / "experiments/ml-benchmark/scripts/ml_metrics.py"),
                          "--output", str(path), "--source", str(src_path),
                          "--glossary", str(root / "glossary/ml.json"), "--json"],
                         capture_output=True, text=True, cwd=root)
    m = json.loads(res.stdout)
    L = m["lint"]
    tp = L["terminal_punctuation"]
    bare = sum(1 for x in tp if x["kind"].startswith("bare ending"))
    verb = int(subprocess.run(["node", "-e", NODE, str(root / "dist/verbatim-directives.js"), str(src_path), str(path)],
                              capture_output=True, text=True, check=True).stdout)
    pairs, skipped = align(en, text)
    dk = keyed(pairs)

    # Q1: English label-list items that came out translated, by English item
    labels = L["label_list_translated"]
    # lead-in kept: its words match the English, with or without an added colon
    lead = None
    if lec in LEAD_IN:
        hits = [p["tr"] for p in pairs if p["en"].strip() == LEAD_IN[lec]]
        lead = bool(hits) and hits[0].strip().rstrip(":").strip() == LEAD_IN[lec]
    # over-application: a bullet outside a label list that the reviewed edition has in
    # Malayalam, left byte-identical to the English
    label_en = set()
    en_lines = en.split("\n")
    for b in M.list_blocks(en):
        if M.is_label_list(b, en_lines):
            label_en.update(en_lines[n - 1].strip() for n in b["items"])
    over = []
    for k, tr in dk.items():
        (anchor, en_par), _ = k
        if not BULLET.match(en_par) or en_par.strip() in label_en:
            continue
        ref = ref_keyed.get(k)
        if ref and ML.search(ref) and tr.strip() == en_par.strip():
            over.append(en_par.strip()[:60])
    # R5: the rendering of *now* at each labelled site
    now = []
    for needle, sense in NOW_SITES[lec]:
        hits = [p["tr"] for p in pairs if needle in p["en"].replace("\n", " ")]
        if not hits:
            now.append({"site": needle, "sense": sense, "form": "unaligned"})
            continue
        t = hits[0]
        form = "both" if ("ഇനി" in t and "ഇപ്പോൾ" in t) else "ഇനി" if "ഇനി" in t else "ഇപ്പോൾ" if "ഇപ്പോൾ" in t else "neither"
        now.append({"site": needle, "sense": sense, "form": form})
    # formulas: kept English at the head of the sentence
    formulas = []
    for f in FORMULAS[lec]:
        hits = [p["tr"] for p in pairs if p["en"].startswith(f)]
        if hits:  # a formula inside an exercise or solution block is not aligned: no site
            formulas.append({"formula": f, "kept": hits[0].startswith(f)})
    return {
        "lecture": lec, "arm": arm, "draw": draw,
        "fail": m.get("fail", []),
        "headings_identical": m["headings"]["identical"],
        "code_cells_identical": CELL.findall(en) == CELL.findall(text),
        "verbatim_violations": verb,
        "pinned_lost": len(m["pinned_retention"]["lost"]),
        "bare_endings": bare, "bare_mode": bare >= 10,
        "para_no_punct": sum(1 for x in tp if x["kind"].startswith("paragraph without")),
        "lowercase": len(L["lowercase_initial"]), "banned": len(L["banned_renderings"]),
        "plural": len(L["malayalam_plural_on_english_noun"]), "um_pair_no_comma": len(L["um_pair_without_comma"]),
        "over_translation_watch": len(L["over_translation_watch"]),
        "splice_per100": m["comma_splice_rate"]["per_100_lines"],
        "label_translated": [x["english"].strip() for x in labels], "lead_in_kept": lead,
        "over_applied": over, "now": now, "formulas": formulas,
        "aligned_pairs": len(pairs), "skipped_en_paras": skipped,
    }


def fisher_greater(a, n1, b, n2):
    """One-sided exact P(candidate count >= b) given the margins (candidate higher)."""
    K, N = a + b, n1 + n2
    return sum(comb(n2, k) * comb(n1, K - k) for k in range(b, min(K, n2) + 1)) / comb(N, K)


def perm_greater(xs, ys, iters=20000, seed=7):
    """One-sided permutation p for mean(ys) - mean(xs) >= observed."""
    if not xs or not ys:
        return float("nan")
    obs, pool, n = sum(ys) / len(ys) - sum(xs) / len(xs), xs + ys, len(ys)
    rng, hit = random.Random(seed), 0
    for _ in range(iters):
        rng.shuffle(pool)
        if sum(pool[:n]) / n - sum(pool[n:]) / len(xs) >= obs - 1e-12:
            hit += 1
    return hit / iters


def main():
    rows = []
    for lec in LECTURES:
        en = (en_dir / "lectures" / f"{lec}.md").read_text(encoding="utf-8")
        ref_keyed = keyed(align(en, (ref_dir / f"{lec}.md").read_text(encoding="utf-8"))[0])
        for arm in ARMS:
            for p in sorted(arm_dir.glob(f"{lec}-{arm}-draw*.md"), key=lambda q: int(re.search(r"draw(\d+)", q.name)[1])):
                if "refused" in p.name:
                    continue
                rows.append(measure(lec, arm, int(re.search(r"draw(\d+)", p.name)[1]), p, en, ref_keyed))
    with open(arm_dir / "records.jsonl", "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    summarise(rows)


def summarise(rows):
    by = defaultdict(list)
    for r in rows:
        by[(r["lecture"], r["arm"])].append(r)
    refusals = Counter()
    for f in arm_dir.glob("*-refused*.log-tail"):
        lec, arm = f.name.split("-")[:2]
        refusals[(lec, arm)] += 1

    def share(lec, arm, pred):
        rs = by[(lec, arm)]
        return sum(1 for r in rs if pred(r)), len(rs)

    def line(label, pred, worse_is_higher=True, lectures=LECTURES, pooled=True):
        cells, tot = [], {"control": [0, 0], "candidate": [0, 0]}
        for lec in lectures:
            (a, n1), (b, n2) = share(lec, "control", pred), share(lec, "candidate", pred)
            for arm, (k, n) in (("control", (a, n1)), ("candidate", (b, n2))):
                tot[arm][0] += k
                tot[arm][1] += n
            p = fisher_greater(a, n1, b, n2)  # candidate higher: worse or better per the label
            cells.append(f"{lec} {a}/{n1} → {b}/{n2} (p={p:.3f})")
        if pooled and len(lectures) > 1:
            (a, n1), (b, n2) = tot["control"], tot["candidate"]
            p = fisher_greater(a, n1, b, n2)
            cells.append(f"pooled {a}/{n1} → {b}/{n2} (p={p:.3f})")
        print(f"- {label}: " + "; ".join(cells))

    print("== drafts and refusals")
    for lec in LECTURES:
        print(f"- {lec}: control {len(by[(lec, 'control')])} (refused {refusals[(lec, 'control')]}), "
              f"candidate {len(by[(lec, 'candidate')])} (refused {refusals[(lec, 'candidate')]})")
    print("\n== Q1 targets (p: candidate better, one-sided)")
    line("all label items English", lambda r: not r["label_translated"], worse_is_higher=False,
         lectures=["pandas", "functions"], pooled=False)
    for lec in ("pandas", "functions"):
        for arm in ARMS:
            c = Counter(x for r in by[(lec, arm)] for x in r["label_translated"])
            print(f"  {lec} {arm}: translated items {dict(c) or '{}'}")
    line("lead-in kept English", lambda r: r["lead_in_kept"], worse_is_higher=False, lectures=["pandas"])
    print("\n== over-application (p: candidate worse)")
    line("drafts with ≥1 Malayalam-reviewed bullet left English", lambda r: bool(r["over_applied"]))
    for lec in LECTURES:
        for arm in ARMS:
            c = Counter(x for r in by[(lec, arm)] for x in r["over_applied"])
            if c:
                print(f"  {lec} {arm}: {dict(c)}")
    print("\n== R5: *now* by sense (site-draws)")
    for sense, want in (("next", "ഇനി"), ("moment", "ഇപ്പോൾ")):
        for lec in LECTURES:
            cells = []
            for arm in ARMS:
                forms = Counter(s["form"] for r in by[(lec, arm)] for s in r["now"] if s["sense"] == sense)
                if forms:
                    cells.append(f"{arm} {dict(forms)}")
            if cells:
                print(f"- {sense} → {want}, {lec}: " + " | ".join(cells))
        tot = {}
        for arm in ARMS:
            k = sum(1 for (lec, a), rs in by.items() if a == arm for r in rs for s in r["now"] if s["sense"] == sense and s["form"] == want)
            n = sum(1 for (lec, a), rs in by.items() if a == arm for r in rs for s in r["now"] if s["sense"] == sense)
            tot[arm] = (k, n)
        (a, n1), (b, n2) = tot["control"], tot["candidate"]
        print(f"  pooled {sense}: {want} {a}/{n1} → {b}/{n2} (p candidate better={fisher_greater(a, n1, b, n2):.3f}; "
              f"site-draws are not independent within a draft)")
    print("  per site (want ഇനി at next, ഇപ്പോൾ at moment):")
    for lec in LECTURES:
        for needle, sense in NOW_SITES[lec]:
            cells = []
            for arm in ARMS:
                forms = Counter(s["form"] for r in by[(lec, arm)] for s in r["now"] if s["site"] == needle)
                cells.append(f"{arm} {dict(forms)}")
            print(f"    {lec} [{sense}] {needle!r}: " + " | ".join(cells))
    for sense, want in (("next", "ഇനി"), ("moment", "ഇപ്പോൾ")):
        for lec in LECTURES:
            xs = [sum(1 for s in r["now"] if s["sense"] == sense and s["form"] == want) for r in by[(lec, "control")]]
            ys = [sum(1 for s in r["now"] if s["sense"] == sense and s["form"] == want) for r in by[(lec, "candidate")]]
            if any(s["sense"] == sense for r in by[(lec, "control")] for s in r["now"]):
                print(f"  per-draft {sense} → {want}, {lec}: mean {sum(xs)/len(xs):.2f} → {sum(ys)/len(ys):.2f} "
                      f"(permutation p candidate better={perm_greater(xs, ys):.3f})")
    print("\n== formulas kept English (site-draws)")
    for lec in ("pandas", "numpy"):
        for arm in ARMS:
            k = sum(1 for r in by[(lec, arm)] for f in r["formulas"] if f["kept"])
            n = sum(len(r["formulas"]) for r in by[(lec, arm)])
            print(f"- {lec} {arm}: {k}/{n}")
    print("\n== regression panel (p: candidate worse, one-sided)")
    line("bare-endings mode (≥10)", lambda r: r["bare_mode"])
    line("headings not identical", lambda r: not r["headings_identical"])
    line("code cells not identical", lambda r: not r["code_cells_identical"])
    line("exercise-block violations", lambda r: r["verbatim_violations"] > 0)
    line("pinned-term gate lost", lambda r: r["pinned_lost"] > 0)
    for key in ("bare_endings", "para_no_punct", "lowercase", "banned", "plural", "um_pair_no_comma",
                "over_translation_watch", "splice_per100"):
        cells = []
        for lec in LECTURES:
            xs = [r[key] for r in by[(lec, "control")]]
            ys = [r[key] for r in by[(lec, "candidate")]]
            if xs and ys:
                cells.append(f"{lec} {sum(xs)/len(xs):.1f} → {sum(ys)/len(ys):.1f} (p={perm_greater(xs, ys):.3f})")
        print(f"- {key} (mean per draft): " + "; ".join(cells))


if __name__ == "__main__":
    main()
