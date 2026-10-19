"""Per-draft checks in the round-5 arm's checks.jsonl schema.

usage: python3 -I checks.py ENGINE_ROOT ENGLISH_SOURCE DRAFT [DRAFT ...]
ENGINE_ROOT supplies experiments/ml-benchmark/scripts/ml_metrics.py, glossary/ml.json and
dist/verbatim-directives.js (findVerbatimViolations).
"""
import json, re, subprocess, sys
from pathlib import Path

root = Path(sys.argv[1])
sys.path.insert(0, str(root / "experiments/ml-benchmark/scripts"))
import ml_metrics as M  # noqa: E402

src_path = Path(sys.argv[2])
src = src_path.read_text()
CELL = re.compile(r"^```\{code-cell\}[^\n]*\n.*?^```\s*$", re.S | re.M)
NODE = """
const { findVerbatimViolations, extractVerbatimBlocks } = require(process.argv[1]);
const fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8'), t = fs.readFileSync(process.argv[3], 'utf8');
const blocks = extractVerbatimBlocks ? extractVerbatimBlocks(s).length : -1;
console.log(JSON.stringify({ violations: findVerbatimViolations(s, t).length, blocks }));
"""


def verbatim(draft: Path):
    js = str(root / "dist/verbatim-directives.js")
    out = subprocess.run(["node", "-e", NODE, js, str(src_path), str(draft)], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


for p in map(Path, sys.argv[3:]):
    text = p.read_text()
    res = subprocess.run([sys.executable, "-I", str(root / "experiments/ml-benchmark/scripts/ml_metrics.py"),
                          "--output", str(p), "--source", str(src_path), "--glossary", str(root / "glossary/ml.json"), "--json"],
                         capture_output=True, text=True, cwd=root)
    m = json.loads(res.stdout)
    L = m["lint"]
    tp = L["terminal_punctuation"]
    v = verbatim(p)
    row = {
        "draft": p.name,
        "fail": m.get("fail", []),
        "headings_identical": m["headings"]["identical"],
        "code_cells_identical": CELL.findall(src) == CELL.findall(text),
        "verbatim_violations": v["violations"],
        "verbatim_blocks": v["blocks"],
        "bare_endings": sum(1 for x in tp if x["kind"].startswith("bare ending")),
        "para_no_punct": sum(1 for x in tp if x["kind"].startswith("paragraph without")),
        "lowercase": len(L["lowercase_initial"]),
        "banned": len(L["banned_renderings"]),
        "plural": len(L["malayalam_plural_on_english_noun"]),
        "um_pair_no_comma": len(L["um_pair_without_comma"]),
        "splice_per100": m["comma_splice_rate"]["per_100_lines"],
        "splice_resumptive": m["comma_splice_rate"]["resumptive"],
        "splice_repairable": m["comma_splice_rate"]["repairable"],
        "over_translation_watch": len(L["over_translation_watch"]),
        # rule: a sentence-initial "For example," stays English (5 sites in pandas)
        "for_example_kept": sum(1 for l in text.split("\n") if l.startswith("For example,")),
        "for_example_ml": sum(1 for l in text.split("\n") if l.startswith("ഉദാഹരണത്തിന്")),
        "pinned_lost": [f"{x.get('term')} {x.get('source')}->{x.get('output')}" if isinstance(x, dict) else str(x) for x in m["pinned_retention"]["lost"]],
    }
    print(json.dumps(row, ensure_ascii=False))
