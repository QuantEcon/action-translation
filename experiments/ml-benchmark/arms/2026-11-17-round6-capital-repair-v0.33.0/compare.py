"""Paired comparison: each fresh draft repaired by ml_repair at main and at the
PR branch, both measured against the editor's reviewed page."""
import sys, json, glob, difflib, importlib.util, statistics as st
S, lec, reviewed, source = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]  # S holds at-main/, at/ (this branch) and val/<lec>/draft-*.md
def load(root, name):
    sys.path.insert(0, f"{root}/experiments/ml-benchmark/scripts")
    for m in ("ml_metrics", "ml_repair"): sys.modules.pop(m, None)
    mm = importlib.import_module("ml_metrics"); mr = importlib.import_module("ml_repair")
    sys.path.pop(0); return mm, mr
src = open(source, encoding="utf-8").read(); ref = open(reviewed, encoding="utf-8").read()
def prose(mm, t): return [p["line"] for p in mm.prose_line_info(t) if mm.MALAYALAM_RE.search(p["line"])]
def run(root, draft):
    mm, mr = load(root, root)
    t = open(draft, encoding="utf-8").read()
    l = mm.round2_lints(t)
    bare = [x["line"] for x in l["terminal_punctuation"] if x["kind"].startswith("bare ending")]
    out, stats = mr.repair(t, bare, [x["line"] for x in l["um_pair_without_comma"]],
                           [x["line"] for x in l["comma_splice_repairable"]], src)
    L = mm.round2_lints(out)
    a, b = prose(mm, out), prose(mm, ref)
    sm = difflib.SequenceMatcher(None, "\n".join(a), "\n".join(b), autojunk=False)
    same = len(set(a) & set(b))
    return {"lower": len(L["lowercase_initial"]), "um": len(L["um_pair_without_comma"]), "plural": len(L["malayalam_plural_on_english_noun"]),
            "watch": len(L["over_translation_watch"]), "sim": sm.ratio(), "lines_equal_ref": same, "ml_lines": len(a),
            "repairs": {k: v for k, v in stats.items() if v}}
rows = []
for d in sorted(glob.glob(f"{S}/val/{lec}/draft-*.md")):
    rows.append({"draft": d.split("/")[-1], "main": run(f"{S}/at-main", d), "pr": run(f"{S}/at", d)})
for r in rows:
    print(r["draft"], "| main:", {k: r["main"][k] for k in ("lower","um","plural","lines_equal_ref")}, f"sim {r['main']['sim']:.3f}",
          "| pr:", {k: r["pr"][k] for k in ("lower","um","plural","lines_equal_ref")}, f"sim {r['pr']['sim']:.3f}", r["pr"]["repairs"])
def agg(arm, k): return sum(r[arm][k] for r in rows)
n = len(rows)
print(f"\n{lec}: {n} drafts")
for k in ("lower", "um", "plural", "watch", "lines_equal_ref", "ml_lines"):
    print(f"  {k:16} main {agg('main',k):4}   pr {agg('pr',k):4}")
dm = [r["pr"]["sim"] - r["main"]["sim"] for r in rows]
print(f"  similarity to reviewed: main mean {st.mean(r['main']['sim'] for r in rows):.4f}  pr mean {st.mean(r['pr']['sim'] for r in rows):.4f}"
      f"  paired diff: {sum(x>0 for x in dm)} up, {sum(x==0 for x in dm)} same, {sum(x<0 for x in dm)} down")
json.dump(rows, open(f"{S}/val/{lec}-compare.json", "w"), ensure_ascii=False, indent=1)
