"""Fixture tests for the round-4 and round-5 ml lints and repairs, and for his
ml#57 answers.

Positive fixtures are the editor's own lines from the round-4 and round-5
reviews (lecture-python-programming.ml#23 and #26); negatives are forms he kept
on his reviewed pages. Each guard in splice_sites has a fixture that reaches
it. Stdlib only:

    python3 -m unittest discover -s experiments/ml-benchmark/scripts -p 'test_*.py'
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ml_metrics import (  # noqa: E402
    add_um_commas, is_label_list, label_list_sites, list_blocks, prose_line_info, round2_lints,
    split_resumptive_splices, split_splices,
)
from ml_repair import repair, restore_formulas, restore_label_lists  # noqa: E402

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


# -- Round 5 (lecture-python-programming.ml#26, pandas, 2026-10-19) ------------
# (seed line, his line with only the split applied): the widened repair must
# reproduce the split at the site he split, with his capital at 467.
HIS_SPLITS_R5 = [
    # 89: ", ഉദാഹരണത്തിന്" — no pronoun, so outside the round-4 subset
    ('`Series`-നെ data-യുടെ ഒരു "column" ആയി കരുതാം, ഉദാഹരണത്തിന് ഒരു single variable-ന്റെ observations-ന്റെ ഒരു collection.',
     '`Series`-നെ data-യുടെ ഒരു "column" ആയി കരുതാം. ഉദാഹരണത്തിന് ഒരു single variable-ന്റെ observations-ന്റെ ഒരു collection.'),
    # 110: the cleft -ിരിക്കുന്നത് before അതിനാൽ (not a finite ending)
    ('Pandas-ന്റെ `Series`, NumPy arrays-ന് മുകളിലാണ് build ചെയ്തിരിക്കുന്നത്, അതിനാൽ സമാനമായ പല operations-ഉം ഇത് support ചെയ്യുന്നു:',
     'Pandas-ന്റെ `Series`, NumPy arrays-ന് മുകളിലാണ് build ചെയ്തിരിക്കുന്നത്. അതിനാൽ സമാനമായ പല operations-ഉം ഇത് support ചെയ്യുന്നു:'),
    # 444: ", കാരണം"
    ('ഇവിടെ `0, 1,..., 7` എന്ന index redundant ആണ്, കാരണം country names-നെ ഒരു index ആയി നമുക്ക് ഉപയോഗിക്കാം.',
     'ഇവിടെ `0, 1,..., 7` എന്ന index redundant ആണ്. കാരണം country names-നെ ഒരു index ആയി നമുക്ക് ഉപയോഗിക്കാം.'),
    # 460: a bare clause boundary
    ('`population` എന്ന variable thousands-ൽ ആണ്, നമുക്ക് single units ആയി മാറ്റാം:',
     '`population` എന്ന variable thousands-ൽ ആണ്. നമുക്ക് single units ആയി മാറ്റാം:'),
    # 467: a lowercase English word opens the new sentence → his capital
    ('അടുത്തതായി, real GDP per capita കാണിക്കുന്ന ഒരു column നമുക്ക് ചേർക്കാം, total GDP millions-ൽ ആയതിനാൽ 1,000,000 കൊണ്ട് multiply ചെയ്യും:',
     'അടുത്തതായി, real GDP per capita കാണിക്കുന്ന ഒരു column നമുക്ക് ചേർക്കാം. Total GDP millions-ൽ ആയതിനാൽ 1,000,000 കൊണ്ട് multiply ചെയ്യും:'),
    # 538: he also inserted എന്നാൽ, which is his to do; the repair only splits
    ('1. നിങ്ങളുടെ machine ഒരു proxy server വഴി Internet access ചെയ്യുന്നു, Python-ന് ഇത് അറിയില്ല.',
     '1. നിങ്ങളുടെ machine ഒരു proxy server വഴി Internet access ചെയ്യുന്നു. Python-ന് ഇത് അറിയില്ല.'),
    # 571: a resumptive ഇപ്പോൾ
    ('`data` എന്ന ഒരു pandas DataFrame-ഇലേക്ക് data read ചെയ്യപ്പെട്ടിരിക്കുന്നു, ഇപ്പോൾ ഇത് സാധാരണ രീതിയിൽ നമുക്ക് manipulate ചെയ്യാം:',
     '`data` എന്ന ഒരു pandas DataFrame-ഇലേക്ക് data read ചെയ്യപ്പെട്ടിരിക്കുന്നു. ഇപ്പോൾ ഇത് സാധാരണ രീതിയിൽ നമുക്ക് manipulate ചെയ്യാം:'),
]

# Forms on his reviewed pages the widened repair must leave alone.
KEPT_R5 = {
    # a line-final coordinator (pandas 66)
    "coordinator, line-final": '1. data-യുമായി work ചെയ്യാൻ ആവശ്യമായ fundamental structures define ചെയ്യുന്നു, കൂടാതെ',
    # the same finite form repeated: parallel predicates (pandas 307, his own line)
    "repeated form: ആകാം": 'ഈ function, `max` പോലുള്ള ഏതെങ്കിലും built-in function ആകാം, ഒരു `lambda` function ആകാം, അല്ലെങ്കിൽ ഒരു user-defined function ആകാം.',
    # repeated form, kept in round 4 (numpy 700) and round 1 (python_by_example 414)
    "repeated form: ചെയ്യപ്പെടും": '`a -> (3,)`, `b -> (3, 1)` എന്നാണെങ്കിൽ, `a` എന്നത് `a -> (3, 3)` ആയി expand ചെയ്യപ്പെടും, `b` എന്നത് `b -> (3, 3)` ആയി expand ചെയ്യപ്പെടും.',
    "repeated form: ആണ്": 'Initial balance $b_0$ ആണ്, interest rate $r$ ആണ്.',
    # an "X, not Y" contrast (functions 366)
    "contrast tail": '* ശ്രദ്ധിക്കുക, equality test ചെയ്യുന്നത് `==` syntax ഉപയോഗിച്ചാണ്, `=` അല്ല.',
    # connectives he writes himself (python_by_example 119, 276; numpy 114)
    "connective: അതുകൊണ്ട്": 'കാരണം, core language മനഃപൂർവ്വം ചെറുതായി നിലനിർത്തിയിരിക്കുന്നു, അതുകൊണ്ട് അത് പഠിക്കാനും maintain ചെയ്യാനും improve ചെയ്യാനും easy ആണ്.',
    "connective: പക്ഷേ": 'NumPy arrays ഏറെക്കുറെ native Python lists-നെ പോലെയാണ്, പക്ഷേ വ്യത്യാസം എന്തെന്നാൽ:',
    "connective: അങ്ങനെ": "ഇത് ഒരു list ആണ്, അങ്ങനെ നമുക്ക് loop ചെയ്യാം.",
    "connective: അവിടെ": "ഇത് ഒരു array ആണ്, അവിടെ ഓരോ element-ഉം float ആണ്.",
    # the round-4 guards still hold
    "negator: contrast": 'In particular, `A * B` എന്നത് matrix product *അല്ല*, ഇത് ഒരു element-wise product ആണ്.',
    "line-final: അത്": 'ഈ lectures-ന് മുഴുവൻ scientific programming ecosystem-ഉം ആവശ്യമാണ്, അത്',
}


class WidenedSpliceRepair(unittest.TestCase):
    def test_reproduces_his_round5_splits(self):
        for seed, his in HIS_SPLITS_R5:
            fixed, n = split_splices(seed)
            self.assertEqual(n, 1, seed)
            self.assertEqual(fixed, his)

    def test_still_reproduces_round4_lines(self):
        for seed, his in HIS_SPLITS:
            self.assertEqual(split_splices(seed), (his, 1))

    def test_leaves_his_pages_alone(self):
        for name, line in {**KEPT, **KEPT_R5}.items():
            with self.subTest(name):
                self.assertEqual(split_splices(line), (line, 0))

    def test_repeated_form_stays_a_watch_site(self):
        # pandas 272: he split it, but the repeated എടുക്കുന്നു keeps it lint-only
        line = 'ആദ്യത്തെ argument condition എടുക്കുന്നു, രണ്ടാമത്തെ argument നമുക്ക് return ചെയ്യേണ്ട columns-ന്റെ ഒരു list എടുക്കുന്നു.'
        lint = round2_lints(line + "\n")
        self.assertEqual(len(lint["comma_splice_watch"]), 1)
        self.assertEqual(lint["comma_splice_repairable"], [])

    def test_no_capital_on_code_or_library_names(self):
        fixed, _ = split_splices("ഇത് ഒരു list ആണ്, pandas ഇത് support ചെയ്യുന്നു.")
        self.assertEqual(fixed, "ഇത് ഒരു list ആണ്. pandas ഇത് support ചെയ്യുന്നു.")
        fixed, _ = split_splices("ഇത് ഒരു list ആണ്, `df` ഇത് support ചെയ്യുന്നു.")
        self.assertEqual(fixed, "ഇത് ഒരു list ആണ്. `df` ഇത് support ചെയ്യുന്നു.")

    def test_repair_consumes_repairable_lines(self):
        text = "Intro.\n\n" + HIS_SPLITS_R5[3][0] + "\n"
        lines = [x["line"] for x in round2_lints(text)["comma_splice_repairable"]]
        self.assertEqual(lines, [3])
        fixed, stats = repair(text, [], [], lines)
        self.assertEqual(stats["splices_split"], 1)
        self.assertEqual(fixed.split("\n")[2], HIS_SPLITS_R5[3][1])


class UmPairCommas(unittest.TestCase):
    def test_multi_word_items(self):
        # pandas 64 and 284: he added the comma at all three sites
        self.assertEqual(
            add_um_commas('[NumPy](https://numpy.org/), അടിസ്ഥാന array data type-ഉം core array operations-ഉം നൽകുന്നത് പോലെ, pandas:'),
            ('[NumPy](https://numpy.org/), അടിസ്ഥാന array data type-ഉം, core array operations-ഉം നൽകുന്നത് പോലെ, pandas:', 1))
        self.assertEqual(
            add_um_commas('`POP`-ഉം total GDP (`tcgdp`)-ഉം മാത്രമേ നമുക്ക് താൽപ്പര്യമുള്ളൂ എന്ന് കരുതാം.'),
            ('`POP`-ഉം, total GDP (`tcgdp`)-ഉം മാത്രമേ നമുക്ക് താൽപ്പര്യമുള്ളൂ എന്ന് കരുതാം.', 1))

    def test_single_tokens_and_chains(self):
        self.assertEqual(add_um_commas('Columns-ഉം rows-ഉം'), ('Columns-ഉം, rows-ഉം', 1))
        self.assertEqual(add_um_commas('Step 1-ഉം 2-ഉം 3-ഉം'), ('Step 1-ഉം, 2-ഉം, 3-ഉം', 2))

    def test_leaves_commaed_pairs(self):
        for line in ('Matlab-ഉം, STATA-ഉം ആയി',
                     # two pairs either side of a Malayalam verb are not one pair (his pandas 210)
                     'Integers-ഉം, labels-ഉം ചേർത്ത് rows-ഉം, columns-ഉം select ചെയ്യാൻ'):
            self.assertEqual(add_um_commas(line), (line, 0))

    def test_lint_sees_the_multi_word_pair(self):
        self.assertEqual(len(round2_lints('`POP`-ഉം total GDP (`tcgdp`)-ഉം മാത്രമേ.\n')["um_pair_without_comma"]), 1)


class CaseMarkedUmCommas(unittest.TestCase):
    """lecture-python-programming.ml#57 Q2: "always a comma" on case-marked pairs."""

    def test_his_pairs(self):
        for seed, his in [
            # pandas 474 and 615, the two pairs he commaed in round 5
            ('`DataFrame`-ന്റെയും `Series` objects-ന്റെയും', '`DataFrame`-ന്റെയും, `Series` objects-ന്റെയും'),
            ('US-ന്റെയും Australia-യുടെയും', 'US-ന്റെയും, Australia-യുടെയും'),
            # numpy 902 and 840, bare on the round-4 page (fixed by ml#59)
            ('Copies ഉണ്ടാക്കുന്നത് speed-ന്റെയും memory-യുടെയും കാര്യത്തിൽ expensive ആണ്.',
             'Copies ഉണ്ടാക്കുന്നത് speed-ന്റെയും, memory-യുടെയും കാര്യത്തിൽ expensive ആണ്.'),
            ('broadcasting `a`-യിലും `b`-യിലും shape 1 ആയിരിക്കുന്ന dimensions expand ചെയ്യും.',
             'broadcasting `a`-യിലും, `b`-യിലും shape 1 ആയിരിക്കുന്ന dimensions expand ചെയ്യും.'),
            # python_by_example 69 exactly as he approved it: the bridge may hold math
            ('(ഇവിടെ $t$ horizontal axis-ലും $\\epsilon_t$ vertical axis-ലും ആണ്.)',
             '(ഇവിടെ $t$ horizontal axis-ലും, $\\epsilon_t$ vertical axis-ലും ആണ്.)'),
        ]:
            self.assertEqual(add_um_commas(seed), (his, 1))
        self.assertEqual(add_um_commas('A-ന്റെയും B-ന്റെയും C-ന്റെയും'), ('A-ന്റെയും, B-ന്റെയും, C-ന്റെയും', 2))

    def test_leaves_what_is_not_a_bare_pair(self):
        for line in (
            # the second item carries on (-ലുമായി): his own pandas 161, no comma
            'അതിനാൽ, rows-ലും columns-ലുമായി organize ചെയ്തിരിക്കുന്ന data-യെ represent ചെയ്യാനും analyze ചെയ്യാനും ഇത് ഒരു powerful tool ആണ്.',
            # single items meaning "all" or "any": matplotlib 427, python_by_example 184, functions 236
            '`.rcParams`-ലെ parameters മാറ്റിയതിനുശേഷം generate ചെയ്യുന്ന എല്ലാ plots-നെയും ഈ setting affect ചെയ്യും.',
            'ഈ രണ്ട് lines-ന്റെയും ഇടയിൽ മറ്റ് പല lines-ഉം വന്നേക്കാം.',
            '* Functions ഉൾപ്പെടെ, ഏത് തരം object-നെയും ഒരു function-ന് return ചെയ്യാൻ കഴിയും.',
            # the quotative, which he has not ruled on (functions 396)
            '* ഈ lines execute ചെയ്യുന്ന സമയത്ത്, `generator_type`-എന്നും `rng.uniform`-എന്നും ഉള്ള names "synonyms" ആണ്;',
            # already commaed by him (pandas 161)
            'Individual rows-ഇനും, individual columns-ഇനും പലപ്പോഴും descriptive indexes ഉണ്ടായിരിക്കും.',
        ):
            self.assertEqual(add_um_commas(line), (line, 0))

    def test_lint_and_repair_see_it(self):
        text = 'ഇത് US-ന്റെയും Australia-യുടെയും data ആണ്.\n'
        self.assertEqual(len(round2_lints(text)["um_pair_without_comma"]), 1)
        self.assertEqual(repair(text, [], [1])[1]["um_commas_added"], 1)


EN_LISTS = """---
title: t
---

## Overview

Just as NumPy provides the basic array data type plus core array operations, pandas

1. defines fundamental structures for working with data and
1. endows them with methods that facilitate operations such as
    * reading in data
    * adjusting indices
    * working with dates and time series
    * sorting, grouping, re-ordering and general data munging [^mung]
    * dealing with missing values, etc., etc.

Matplotlib is an outstanding graphics library, designed for scientific computing, with

* high-quality 2D and 3D plots
* output in all the usual formats (PDF, PNG, etc.)
* LaTeX integration
* fine-grained control over all aspects of presentation
* animation, etc.

## Steps

As a practice run, please execute the following

1. Open up a terminal
1. Type `conda update conda`

Imagine now you want to write a program with consumers, who can

* hold and spend cash
* consume goods
"""

# The round-5 seed's renderings of the pandas list (ml#26 68-72); the
# matplotlib list as on his round-3 page, but with a translated last item.
ML_LISTS = """---
title: t
---

## Overview

NumPy അടിസ്ഥാന array data type-ഉം, core array operations-ഉം നൽകുന്നത് പോലെ, pandas:

1. data-യുമായി work ചെയ്യാനുള്ള fundamental structures define ചെയ്യുന്നു, കൂടാതെ
1. താഴെ പറയുന്നതുപോലുള്ള operations എളുപ്പമാക്കുന്ന methods അവയ്ക്ക് നൽകുന്നു:
    * data read ചെയ്യൽ
    * indices adjust ചെയ്യൽ
    * dates-ഉം time series-ഉം ആയി പ്രവർത്തിക്കൽ
    * sorting, grouping, re-ordering, പൊതുവായ data munging [^mung]
    * missing values കൈകാര്യം ചെയ്യൽ, etc., etc.

Matplotlib എന്നത്, scientific computing-നായി design ചെയ്തിരിക്കുന്ന ഒരു മികച്ച graphics library ആണ്. ഇതിൽ ഉള്ളത്:

* high-quality 2D and 3D plots
* സാധാരണ ഉപയോഗിക്കുന്ന എല്ലാ formats-ലും output ലഭിക്കുന്നു — PDF, PNG, etc.
* LaTeX integration
* presentation-ന്റെ ഓരോ ചെറിയ കാര്യവും വരെ control ചെയ്യാൻ കഴിയുന്നു
* animation, തുടങ്ങിയവ.

## Steps

ഒരു practice run ആയി, താഴെ പറയുന്നവ execute ചെയ്യുക:

1. ഒരു terminal തുറക്കുക
1. `conda update conda` എന്ന് type ചെയ്യുക

Consumers ഉള്ള ഒരു program എഴുതണമെന്ന് കരുതുക, അവർക്ക്:

* cash hold ചെയ്യാനും spend ചെയ്യാനും കഴിയും
* goods consume ചെയ്യാൻ കഴിയും
"""


class LabelListRestore(unittest.TestCase):
    """lecture-python-programming.ml#57 Q1: short label bullets stay English."""

    def test_restores_the_pandas_list_only(self):
        fixed, n = restore_label_lists(ML_LISTS, EN_LISTS)
        self.assertEqual(n, 5)
        en, ml, out = EN_LISTS.split("\n"), ML_LISTS.split("\n"), fixed.split("\n")
        self.assertEqual(out[10:15], en[10:15])
        # everything else is untouched: the numbered parent items, the mixed
        # matplotlib list (a 9-word item), the numbered steps, the list whose
        # lead-in ends in a modal
        self.assertEqual(out[:10] + out[15:], ml[:10] + ml[15:])

    def test_repair_runs_it_with_the_source_only(self):
        self.assertEqual(repair(ML_LISTS, [], [], [], EN_LISTS)[1]["label_bullets_restored"], 5)
        self.assertEqual(repair(ML_LISTS, [], [], [])[1]["label_bullets_restored"], 0)

    def test_the_lint_names_each_item(self):
        sites = label_list_sites(ML_LISTS, EN_LISTS)
        self.assertEqual([s["line"] for s in sites], [11, 12, 13, 14, 15])
        self.assertEqual(sites[0]["english"], "    * reading in data")

    def test_a_list_he_kept_english_is_left(self):
        self.assertEqual(label_list_sites(EN_LISTS, EN_LISTS), [])

    def test_a_section_whose_lists_do_not_pair_is_skipped(self):
        # the draft split the matplotlib list in two: the section has one list
        # more than the source, so nothing in it is paired
        ml = ML_LISTS.replace("* LaTeX integration\n", "* LaTeX integration\n\nകൂടാതെ:\n\n")
        self.assertEqual(restore_label_lists(ml, EN_LISTS)[1], 0)

    def test_label_test_on_the_english(self):
        en_lines = EN_LISTS.split("\n")
        verdicts = [is_label_list(b, en_lines) for b in list_blocks(EN_LISTS)]
        # parent items, pandas list, matplotlib list, steps, consumers
        self.assertEqual(verdicts, [False, True, False, False, False])


ML_DOC = """---
title: t
---

## Series

വാസ്തവത്തിൽ, Python dictionaries-ന്റെ അതേ syntax തന്നെ നിങ്ങൾക്ക് ഇവിടെയും ഉപയോഗിക്കാം:

```{code-cell} python3
s['AMZN']
```

അടിസ്ഥാനപരമായി, pandas-ലെ ഒരു `DataFrame`, ഒരു Excel spreadsheet-ന് സമാനമാണ്.

ഇത് കൂടാതെ, താൽപ്പര്യമുള്ള variables-ന്റെ ഒരു subset-ഉം ഇത് define ചെയ്യുന്നു.

Series-ന് വാസ്തവത്തിൽ ഒരു index ഉണ്ട്.

ഇങ്ങനെ തുടരും.
"""

EN_DOC = """---
title: t
---

## Series

In fact, you can use much of the same syntax as Python dictionaries

```{code-cell} python3
s['AMZN']
```

In essence, a `DataFrame` in pandas is analogous to an Excel spreadsheet.

In addition, it also defines a subset of variables of interest.

A Series has an index, in fact.

And so on.
"""


class FormulaRestore(unittest.TestCase):
    def test_source_gated_restore(self):
        fixed, n = restore_formulas(ML_DOC, EN_DOC)
        self.assertEqual(n, 3)
        lines = fixed.split("\n")
        self.assertEqual(lines[6], "In fact, Python dictionaries-ന്റെ അതേ syntax തന്നെ നിങ്ങൽക്ക് ഇവിടെയും ഉപയോഗിക്കാം:".replace("നിങ്ങൽക്ക്", "നിങ്ങൾക്ക്"))
        self.assertEqual(lines[12], "In essence, pandas-ലെ ഒരു `DataFrame`, ഒരു Excel spreadsheet-ന് സമാനമാണ്.")
        # In addition is not in the table: he keeps ഇത് കൂടാതെ, (ml#26 342)
        self.assertEqual(lines[14], "ഇത് കൂടാതെ, താൽപ്പര്യമുള്ള variables-ന്റെ ഒരു subset-ഉം ഇത് define ചെയ്യുന്നു.")
        # mid-sentence വാസ്തവത്തിൽ is not an opener (he accepted one at numpy 898)
        self.assertEqual(lines[16], "Series-ന് വാസ്തവത്തിൽ ഒരു index ഉണ്ട്.")
        self.assertEqual(lines[18], "And so on.")

    def test_nothing_without_a_matching_source(self):
        self.assertEqual(restore_formulas(ML_DOC, EN_DOC.replace("In fact, ", "").replace("In essence, ", "").replace("And so on.", "Etc."))[1], 0)

    def test_repair_passes_the_source(self):
        _, stats = repair(ML_DOC, [], [], [], EN_DOC)
        self.assertEqual(stats["formulas_restored"], 3)


class Round5Lints(unittest.TestCase):
    def test_over_translations_are_banned_or_watched(self):
        lint = round2_lints("Python-നായുള്ള വേഗതയേറിയതും കാര്യക്ഷമവുമായ data analysis tools.\n\nഇത് വിവിധ methods ഉപയോഗിച്ച് ചെയ്യാം.\n")
        self.assertEqual([x["rendering"] for x in lint["banned_renderings"]], ["കാര്യക്ഷമ"])
        self.assertEqual([x["rendering"] for x in lint["over_translation_watch"]], ["വിവിധ"])

    def test_lowercase_library_names_and_code_openers_are_not_misses(self):
        caps = lambda t: [x["line"] for x in round2_lints(t)["lowercase_initial"]]  # noqa: E731
        self.assertEqual(caps("pandas define ചെയ്യുന്ന രണ്ട് പ്രധാന data types ആണ് `Series`-ഉം, `DataFrame`-ഉം.\n"), [])
        self.assertEqual(caps("- axis = 0 -- ഓരോ column-ഇനും function apply ചെയ്യുന്നു\n"), [])
        self.assertEqual(caps("data science, machine learning തുടങ്ങിയ മേഖലകളുടെ വളർച്ച.\n"), [1])


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

    def test_comma_is_an_ending_only_before_a_list(self):
        self.assertEqual(self.kinds("ഈ ഭാഗങ്ങൾ ഇവയാണ്,\n\n* ആദ്യത്തെ item\n"), [])
        text = "ഈ code നോക്കുക," + CELL
        self.assertEqual(self.kinds(text), [1])
        # left to the lint: the repair never writes ",:"
        self.assertEqual(repair(text, [1])[1]["colons_added"], 0)

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
