"""Fixture tests for the round-4 ml lints and the splice repair.

Positive fixtures are the editor's own lines from the round-4 review
(lecture-python-programming.ml#23); negatives are forms he kept. Each guard in
splice_sites has a fixture that reaches it. Stdlib only:

    python3 -m unittest discover -s experiments/ml-benchmark/scripts -p 'test_*.py'
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ml_metrics import prose_line_info, round2_lints, split_resumptive_splices  # noqa: E402
from ml_repair import repair  # noqa: E402

# (seed line, the editor's suggestion): the repair must reproduce his line exactly.
HIS_SPLITS = [
    # lecture-python-programming.ml#23, line 336
    ('Arrays-ന് useful ആയ methods ഉണ്ട്, ഇവയെല്ലാം carefully optimize ചെയ്തിരിക്കുന്നു:',
     'Arrays-ന് useful ആയ methods ഉണ്ട്. ഇവയെല്ലാം carefully optimize ചെയ്തിരിക്കുന്നു:'),
    # lecture-python-programming.ml#23, line 494
    ('* `for` loops ഒഴിവാക്കാം, ഇത് numerical code വേഗത്തിൽ run ചെയ്യാൻ സഹായിക്കുന്നു, ഒപ്പം',
     '* `for` loops ഒഴിവാക്കാം. ഇത് numerical code വേഗത്തിൽ run ചെയ്യാൻ സഹായിക്കുന്നു, ഒപ്പം'),
    # lecture-python-programming.ml#23, line 841
    ('    - `a -> (2, 2, 2)`, `b -> (1, 2, 2)` ആണെങ്കിൽ, broadcasting `b`-യുടെ ആദ്യത്തെ dimension expand ചെയ്യും, അതിനാൽ `b -> (2, 2, 2)` ആകും;',
     '    - `a -> (2, 2, 2)`, `b -> (1, 2, 2)` ആണെങ്കിൽ, broadcasting `b`-യുടെ ആദ്യത്തെ dimension expand ചെയ്യും. അതിനാൽ `b -> (2, 2, 2)` ആകും;'),
]

# Forms that must not be split, each reaching a different guard.
KEPT = {
    # _SPLICE_KEEP_FIN_RE: എല്ലാം ends like the modal -ാം; his reviewed
    # python_by_example 275 keeps this comma.
    "keep: എല്ലാം": '* Lists, strings തുടങ്ങിയ Python objects-ന് എല്ലാം, അവയിൽ അടങ്ങിയിരിക്കുന്ന data manipulate ചെയ്യാൻ ഉപയോഗിക്കുന്ന methods ഉണ്ട്.',
    # _SPLICE_KEEP_FIN_RE: the fronted imperative rules 13/14 require a comma after.
    "keep: ശ്രദ്ധിക്കുക": "ഈ ഭാഗം നോക്കുക, ശ്രദ്ധിക്കുക, ഇത് ഒരു copy അല്ല.",
    # head test: a finite-looking token that opens its sentence.
    "head: line start": "കാണുക, ഇത് ഒരു copy അല്ല.",
    "head: after a stop": "ഇത് നോക്കാം. കാണുക, ഇത് ഒരു copy അല്ല.",
    # negator: a contrast he keeps (untouched, ml#23 445).
    "negator: contrast": 'In particular, `A * B` എന്നത് matrix product *അല്ല*, ഇത് ഒരു element-wise product ആണ്.',
    # carries_on: a pronoun that ends the line opens a list; splitting would leave
    # a verbless "അത്:" (2026-08-03 opus5 getting_started draw, lines 107 and 170).
    "line-final: അത്": 'ഈ lectures-ന് മുഴുവൻ scientific programming ecosystem-ഉം ആവശ്യമാണ്, അത്',
    "line-final: ഇവയോടൊപ്പം": 'അവ Python-ലേക്ക് ഒരു *browser-based* interface use ചെയ്യുന്നു, ഇവയോടൊപ്പം',
    # the resumptive list: a connective outside it (he wrote ", അങ്ങനെ" himself),
    # and a word that only starts like a pronoun.
    "list: അങ്ങനെ": "ഇത് ഒരു list ആണ്, അങ്ങനെ നമുക്ക് loop ചെയ്യാം.",
    "list: അവിടെ": "ഇത് ഒരു array ആണ്, അവിടെ ഓരോ element-ഉം float ആണ്.",
    # not a finite form at all, so there is no site.
    "no site: തീർച്ചയായും": "തീർച്ചയായും, ഇത് ഒറ്റ step-ൽ ചെയ്യാം.",
}

# Commas that are not splices at all: none may reach comma_splice_watch.
NOT_SPLICES = {
    # neither-nor coordination, whose comma he adds (ml#23 #7)
    "neither-nor": "ഇവിടെ `z` എന്നത് ഒരു **flat** array ആണ് --- row vector-ഉം അല്ല, column vector-ഉം അല്ല.",
    # a trailing "as shown" tag
    "tag tail": "Matrix multiplication-ന് നമ്മൾ `@` symbol ഉപയോഗിക്കുന്നു, താഴെ കാണിച്ചിരിക്കുന്ന പോലെ:",
    # a list-final conjunction before the next bullet
    "list conjunction": "* `for` loops ഒഴിവാക്കാം. ഇത് numerical code വേഗത്തിൽ run ചെയ്യാൻ സഹായിക്കുന്നു, ഒപ്പം",
}


class SpliceRepair(unittest.TestCase):
    def test_reproduces_his_lines(self):
        for seed, his in HIS_SPLITS:
            fixed, n = split_resumptive_splices(seed)
            self.assertEqual(n, 1, seed)
            self.assertEqual(fixed, his)

    def test_leaves_kept_forms_alone(self):
        for name, line in KEPT.items():
            with self.subTest(name):
                self.assertEqual(split_resumptive_splices(line), (line, 0))

    def test_exemptions_are_not_splices(self):
        for name, line in NOT_SPLICES.items():
            with self.subTest(name):
                self.assertEqual(round2_lints(line + "\n")["comma_splice_watch"], [])

    def test_no_comma_after_connective(self):
        fixed, _ = split_resumptive_splices("broadcasting ഒരു dimension ചേർക്കും, അതിനാൽ `b -> (1, 3)` ആകും;")
        self.assertIn("ചേർക്കും. അതിനാൽ `b", fixed)

    def test_repair_consumes_lint_lines(self):
        text = "Intro.\n\n" + HIS_SPLITS[0][0] + "\n"
        lines = [x["line"] for x in round2_lints(text)["comma_splice_resumptive"]]
        self.assertEqual(lines, [3])
        fixed, stats = repair(text, [], [], lines)
        self.assertEqual(stats["splices_split"], 1)
        self.assertEqual(fixed.split("\n")[2], HIS_SPLITS[0][1])


DOC = """---
title: t
---

(label_line)=
## Heading

(ഇത് ഒരു bracketed paragraph ആണ്, ഇത് ഒരു test ആണ്)

```{note}
ഇത് note-ലെ ഒരു വാചകം ആണ്, ഇത് scan ചെയ്യണം.
```

```{exercise-start}
:label: ex1

Exercise text.

```{hint}
:class: dropdown

* hint ഇവിടെ
```

```{code-cell} python3
x = 1  # ഇത് code ആണ്, ഇത് prose അല്ല
```

ഇത് ഒരു hard-wrapped paragraph-ന്റെ
തുടർച്ച ആണ്.

````{Note}
ഇത് ഒരു note ആണ്, ഇത് scan ചെയ്യണം.

```{code-cell} python3
y = 2  # ഇത് code ആണ്
```
````
"""


class ProseLines(unittest.TestCase):
    def setUp(self):
        self.lines = {p["n"]: p for p in prose_line_info(DOC)}

    def test_coverage(self):
        # the bracketed paragraph and the note body are prose; the label line,
        # the exercise and hint bodies and the code cell are not.
        self.assertIn(8, self.lines)
        self.assertIn(11, self.lines)
        self.assertNotIn(5, self.lines)
        for n in (17, 22, 26):
            self.assertNotIn(n, self.lines)

    def test_exercise_fence_does_not_desync(self):
        # the nested {hint} fence line does not close the exercise; its bare
        # closer does, so the code cell after it stays code.
        self.assertIn(29, self.lines)
        self.assertIn(30, self.lines)

    def test_nested_code_in_a_longer_fenced_note(self):
        # capitalised directive names are notes too; the code cell inside is not prose
        self.assertIn(33, self.lines)
        self.assertNotIn(36, self.lines)

    def test_paragraph_position(self):
        self.assertTrue(self.lines[29]["starts_para"])
        self.assertFalse(self.lines[29]["ends_para"])
        self.assertTrue(self.lines[30]["ends_para"])


CELL = "\n\n```{code-cell} python3\nx = 1\n```\n"


class TerminalPunctuation(unittest.TestCase):
    def kinds(self, text):
        return [x["line"] for x in round2_lints(text)["terminal_punctuation"]]

    def test_bracket_needs_inner_stop(self):
        self.assertEqual(self.kinds("(ഇത് ഒരു note ആണ്)\n"), [1])
        self.assertEqual(self.kinds("(ഇത് ഒരു note ആണ്.)\n"), [])
        self.assertEqual(self.kinds("(ഇത് ഞെട്ടിക്കാം...)\n"), [])

    def test_accepted_ellipsis_bracket_before_a_cell(self):
        # ml#23 878, which he left as it is
        self.assertEqual(self.kinds('Mutability താഴെ പറയുന്ന behavior-ലേക്ക് നയിക്കുന്നു (ഇത് MATLAB programmers-നെ ഞെട്ടിക്കാം...)' + CELL), [])

    def test_bare_bracket_before_a_cell_is_repaired_to_his_form(self):
        # the deep-copy line: his accepted form is "):" (ml#23 920)
        text = 'ഇപ്പോൾ `b` എന്നത് ഒരു independent copy ആണ് (ഇതിനെ *deep copy* എന്ന് വിളിക്കുന്നു)' + CELL
        self.assertEqual(self.kinds(text), [1])
        fixed, stats = repair(text, [1])
        self.assertEqual(stats["colons_added"], 1)
        self.assertEqual(fixed.split("\n")[0], 'ഇപ്പോൾ `b` എന്നത് ഒരു independent copy ആണ് (ഇതിനെ *deep copy* എന്ന് വിളിക്കുന്നു):')

    def test_hard_wrap_is_not_a_bare_ending(self):
        self.assertEqual(self.kinds("ഇത് ഒരു paragraph-ന്റെ\nതുടർച്ച ആണ്.\n"), [])

    def test_wrapped_list_item_is_exempt(self):
        text = "ഈ list നോക്കുക:\n\n* ആദ്യത്തെ item ഒരു നീണ്ട വാചകം\n  അടുത്ത line-ലേക്ക് wrap ചെയ്യുന്നു\n* രണ്ടാമത്തെ item\n"
        self.assertEqual(self.kinds(text), [])

    def test_lowercase_only_at_paragraph_start(self):
        caps = lambda t: [x["line"] for x in round2_lints(t)["lowercase_initial"]]  # noqa: E731
        self.assertEqual(caps("ഇത് ഒരു\nsimple example ആണ്.\n"), [])
        self.assertEqual(caps("simple ആയ ഒരു example.\n"), [1])


if __name__ == "__main__":
    unittest.main()
