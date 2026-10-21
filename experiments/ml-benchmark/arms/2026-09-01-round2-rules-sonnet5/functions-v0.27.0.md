---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  language: python
  name: python3
translation:
  title: Functions
  headings:
    Overview: Overview
    Function Basics: Function Basics
    Function Basics::Built-In Functions: Built-In Functions
    Function Basics::Third Party Functions: Third Party Functions
    Defining Functions: Defining Functions
    Defining Functions::Basic Syntax: Basic Syntax
    Defining Functions::Keyword Arguments: Keyword Arguments
    Defining Functions::The Flexibility of Python Functions: The Flexibility of Python Functions
    'Defining Functions::One-Line Functions: `lambda`': 'One-Line Functions: `lambda`'
    Defining Functions::Why Write Functions?: Why Write Functions?
    Applications: Applications
    Applications::Random Draws: Random Draws
    Applications::Adding Conditions: Adding Conditions
    Recursive Function Calls (Advanced): Recursive Function Calls (Advanced)
    Exercises: Exercises
    Advanced Exercises: Advanced Exercises
---

(functions)=
```{raw} jupyter
<div id="qe-notebook-header" align="right" style="text-align:right;">
        <a href="https://quantecon.org/" title="quantecon.org">
                <img style="width:250px;display:inline;" width="250px" src="https://assets.quantecon.org/img/qe-menubar-logo.svg" alt="QuantEcon">
        </a>
</div>
```

# Functions

```{index} single: Python; User-defined functions
```

## Overview

മിക്കവാറും എല്ലാ programming languages-ഉം provide ചെയ്യുന്ന വളരെ useful ആയ ഒരു construct ആണ് Functions.

നമ്മൾ ഇതിനകം പല functions-നെയും പരിചയപ്പെട്ടിട്ടുണ്ട്, ഉദാഹരണത്തിന്

* NumPy-യിലെ `sqrt()` function-ഉം
* built-in ആയ `print()` function-ഉം

ഈ lecture-ൽ നമ്മൾ ചെയ്യാൻ പോകുന്ന കാര്യങ്ങൾ:

1. Functions-നെ systematic ആയി പഠിക്കുന്നു, syntax-ഉം use-cases-ഉം cover ചെയ്യുന്നു.
2. നമ്മുടെ സ്വന്തം user-defined functions എങ്ങനെ build ചെയ്യാം എന്ന് പഠിക്കുന്നു.

താഴെ കൊടുത്തിരിക്കുന്ന imports നമുക്ക് ഉപയോഗിക്കാം.

```{code-cell} ipython
import numpy as np
import matplotlib.pyplot as plt
```

## Function Basics

ഒരു പ്രത്യേക task implement ചെയ്യുന്ന, ഒരു program-ന്റെ പേരുള്ള ഒരു ഭാഗമാണ് function.

ധാരാളം functions ഇതിനകം exist ചെയ്യുന്നു, അവയെ നമുക്ക് അതേപടി ഉപയോഗിക്കാം.

ആദ്യം നമുക്ക് ഈ functions-നെ review ചെയ്യാം, എന്നിട്ട് നമ്മുടെ സ്വന്തം functions എങ്ങനെ build ചെയ്യാം എന്ന് നോക്കാം.

### Built-In Functions

`import` ഇല്ലാതെ തന്നെ ലഭ്യമായ കുറേ **built-in** functions Python-ന് ഉണ്ട്.

ഇവയിൽ ചിലത് നമ്മൾ ഇതിനകം പരിചയപ്പെട്ടു

```{code-cell} python3
max(19, 20)
```

```{code-cell} python3
print('foobar')
```

```{code-cell} python3
str(22)
```

```{code-cell} python3
type(22)
```

Python built-ins-ന്റെ full list [ഇവിടെ](https://docs.python.org/3/library/functions.html) കാണാം.


### Third Party Functions

നമുക്ക് വേണ്ട കാര്യങ്ങൾ built-in functions cover ചെയ്യുന്നില്ലെങ്കിൽ, ഒന്നുകിൽ functions-നെ import ചെയ്യണം അല്ലെങ്കിൽ നമ്മുടെ സ്വന്തം functions create ചെയ്യണം.

Functions-നെ import ചെയ്ത് ഉപയോഗിക്കുന്നതിന്റെ ഉദാഹരണങ്ങൾ {doc}`previous lecture <python_by_example>`-ൽ കൊടുത്തിട്ടുണ്ട്.

താഴെ മറ്റൊരു ഉദാഹരണം കാണാം, ഇത് തന്നിരിക്കുന്ന ഒരു വർഷം leap year ആണോ എന്ന് test ചെയ്യുന്നു:

```{code-cell} python3
import calendar
calendar.isleap(2024)
```

## Defining Functions

പല സന്ദർഭങ്ങളിലും നമ്മുടെ സ്വന്തം functions define ചെയ്യാൻ കഴിയുന്നത് വളരെ useful ആണ്.

ഇത് എങ്ങനെ ചെയ്യാം എന്ന് നമുക്ക് നോക്കാം.

### Basic Syntax

$f(x) = 2 x + 1$ എന്ന mathematical function implement ചെയ്യുന്ന വളരെ simple ആയ ഒരു Python function താഴെ കാണാം

```{code-cell} python3
def f(x):
    return 2 * x + 1
```

ഈ function define ചെയ്തു കഴിഞ്ഞു, ഇനി നമുക്ക് ഇതിനെ *call* ചെയ്ത് പ്രതീക്ഷിച്ചത് പോലെ പ്രവർത്തിക്കുന്നുണ്ടോ എന്ന് check ചെയ്യാം:

```{code-cell} python3
f(1)   
```

```{code-cell} python3
f(10)
```

തന്നിരിക്കുന്ന ഒരു സംഖ്യയുടെ absolute value compute ചെയ്യുന്ന കുറച്ചുകൂടി വലിയ ഒരു function താഴെ കാണാം.

(ഇത്തരം ഒരു function built-in ആയി ഇതിനകം exist ചെയ്യുന്നു, പക്ഷേ exercise-ന് വേണ്ടി നമുക്ക് നമ്മുടേതായി ഒന്ന് എഴുതാം.)

```{code-cell} python3
def new_abs_function(x):
    if x < 0:
        abs_value = -x
    else:
        abs_value = x
    return abs_value
```

ഇവിടത്തെ syntax നമുക്ക് review ചെയ്യാം.

* Function definitions തുടങ്ങാൻ ഉപയോഗിക്കുന്ന ഒരു Python keyword ആണ് `def`.
* `def new_abs_function(x):` സൂചിപ്പിക്കുന്നത് ഈ function-ന്റെ പേര് `new_abs_function` എന്നാണ്, കൂടാതെ ഇതിന് `x` എന്ന ഒരു argument മാത്രമേ ഉള്ളൂ എന്നും.
* Indent ചെയ്തിരിക്കുന്ന code-നെ *function body* എന്ന് വിളിക്കുന്ന ഒരു code block ആണ്.
* Calling code-ലേക്ക് return ചെയ്യേണ്ട object `abs_value` ആണ് എന്ന് `return` എന്ന keyword സൂചിപ്പിക്കുന്നു.

ഈ മുഴുവൻ function definition-ഉം Python interpreter വായിച്ച് memory-യിൽ സൂക്ഷിക്കുന്നു.

ഇത് പ്രവർത്തിക്കുന്നുണ്ടോ എന്ന് check ചെയ്യാൻ നമുക്ക് ഇതിനെ call ചെയ്യാം:

```{code-cell} python3
print(new_abs_function(3))
print(new_abs_function(-3))
```


ശ്രദ്ധിക്കുക, ഒരു function-ന് എത്ര വേണമെങ്കിലും `return` statements ഉണ്ടാകാം (പൂജ്യം ഉൾപ്പെടെ).

ആദ്യത്തെ return-ൽ എത്തിച്ചേരുമ്പോൾ function-ന്റെ execution അവസാനിക്കുന്നു, ഇത് താഴെ കൊടുത്തിരിക്കുന്നത് പോലുള്ള code സാധ്യമാക്കുന്നു

```{code-cell} python3
def f(x):
    if x < 0:
        return 'negative'
    return 'nonnegative'
```

(പല return statements ഉള്ള functions എഴുതുന്നത് സാധാരണയായി discourage ചെയ്യപ്പെടുന്നു, കാരണം ഇത് logic പിന്തുടരാൻ ബുദ്ധിമുട്ടാക്കും.)

Return statement ഇല്ലാത്ത functions automatically പ്രത്യേകമായ Python object ആയ `None` return ചെയ്യുന്നു.

(pos_args)=
### Keyword Arguments

```{index} single: Python; keyword arguments
```

{ref}`Previous lecture <python_by_example>`-ൽ, താഴെ കൊടുത്തിരിക്കുന്ന statement നിങ്ങൾ കണ്ടിരുന്നു

```{code-block} python3
:class: no-execute

plt.plot(x, 'b-', label="white noise")
```

Matplotlib-ന്റെ `plot` function-നെ ഇവിടെ call ചെയ്യുമ്പോൾ, അവസാനത്തെ argument `name=argument` syntax-ൽ pass ചെയ്യുന്നത് ശ്രദ്ധിക്കുക.

ഇതിനെ *keyword argument* എന്ന് വിളിക്കുന്നു, ഇവിടെ `label` ആണ് keyword.

Keyword അല്ലാത്ത arguments-നെ *positional arguments* എന്ന് വിളിക്കുന്നു, കാരണം അവയുടെ അർത്ഥം order അനുസരിച്ചാണ് നിശ്ചയിക്കപ്പെടുന്നത്

* `plot(x, 'b-')` differs from `plot('b-', x)`

ധാരാളം arguments ഉള്ള ഒരു function-ന്റെ കാര്യത്തിൽ keyword arguments പ്രത്യേകിച്ചും useful ആണ്, കാരണം അത്തരം സന്ദർഭങ്ങളിൽ ശരിയായ order ഓർത്തിരിക്കാൻ ബുദ്ധിമുട്ടാണ്.

User-defined functions-ലും keyword arguments യാതൊരു ബുദ്ധിമുട്ടും കൂടാതെ ഉപയോഗിക്കാം.

താഴെ കൊടുത്തിരിക്കുന്ന ഉദാഹരണം syntax illustrate ചെയ്യുന്നു:

```{code-cell} python3
def f(x, a=1, b=1):
    return a + b * x
```

`f`-ന്റെ definition-ൽ നമ്മൾ നൽകിയ keyword argument values default values ആയി മാറുന്നു

```{code-cell} python3
f(2)
```

താഴെ കൊടുത്തിരിക്കുന്ന രീതിയിൽ അവയെ modify ചെയ്യാം

```{code-cell} python3
f(2, a=4, b=5)
```

### The Flexibility of Python Functions

{ref}`Previous lecture <python_by_example>`-ൽ നമ്മൾ discuss ചെയ്തത് പോലെ, Python functions വളരെ flexible ആണ്.

In particular

* തന്നിരിക്കുന്ന ഒരു file-ൽ എത്ര functions വേണമെങ്കിലും define ചെയ്യാം.
* Functions മറ്റ് functions-ന്റെ അകത്ത് define ചെയ്യാം (ഇത് പലപ്പോഴും ചെയ്യാറുണ്ട്).
* മറ്റ് functions ഉൾപ്പെടെ ഏത് object-ഉം ഒരു function-ന് argument ആയി pass ചെയ്യാം.
* Functions ഉൾപ്പെടെ ഏത് തരം object-ഉം ഒരു function-ന് return ചെയ്യാം.

ഒരു function-നെ മറ്റൊരു function-ന് pass ചെയ്യുന്നത് എത്ര എളുപ്പമാണെന്നതിന്റെ ഉദാഹരണങ്ങൾ താഴെ കൊടുത്തിരിക്കുന്ന sections-ൽ നമ്മൾ കാണും.

### One-Line Functions: `lambda`

```{index} single: Python; lambda functions
```

ഒറ്റ line-ൽ simple ആയ functions create ചെയ്യാൻ `lambda` എന്ന keyword ഉപയോഗിക്കുന്നു.

For example, താഴെ കൊടുത്തിരിക്കുന്ന രണ്ട് definitions-ഉം ഒരേ കാര്യമാണ് ചെയ്യുന്നത്:

```{code-cell} python3
def f(x):
    return x**3
```

and

```{code-cell} python3
f = lambda x: x**3
```

`lambda` എന്തുകൊണ്ട് useful ആണ് എന്ന് കാണാൻ, നമുക്ക് $\int_0^2 x^3 dx$ കണക്കാക്കണം എന്ന് കരുതുക (നമ്മുടെ high-school calculus മറന്നു എന്നും കരുതുക).

SciPy library-യിൽ `quad` എന്ന ഒരു function ഉണ്ട്, അത് ഈ കണക്കുകൂട്ടൽ നമുക്കായി ചെയ്യും.

`quad` function-ന്റെ syntax `quad(f, a, b)` എന്നതാണ്, ഇവിടെ `f` ഒരു function ആണ്, `a`, `b` എന്നിവ numbers ആണ്.

$f(x) = x^3$ എന്ന function create ചെയ്യാൻ താഴെ കൊടുത്തിരിക്കുന്ന രീതിയിൽ `lambda` ഉപയോഗിക്കാം

```{code-cell} python3
from scipy.integrate import quad

quad(lambda x: x**3, 0, 2)
```

ഇവിടെ `lambda` create ചെയ്ത function-നെ *anonymous* എന്ന് പറയുന്നു, കാരണം അതിന് ഒരു പേരും നൽകിയിട്ടില്ല.


### Why Write Functions?

നിങ്ങളുടെ code-ന്റെ clarity improve ചെയ്യുന്നതിൽ user-defined functions പ്രധാനമാണ്, കാരണം അവ

* വ്യത്യസ്ത logic-strands-നെ വേർതിരിക്കുന്നു
* code reuse ചെയ്യാൻ സഹായിക്കുന്നു

(ഒരേ കാര്യം രണ്ട് തവണ എഴുതുന്നത് [മിക്ക സമയത്തും അത്ര നല്ലതല്ല](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself))

ഇതിനെക്കുറിച്ചുള്ള കൂടുതൽ കാര്യങ്ങൾ നമുക്ക് {doc}`പിന്നീട് <writing_good_code>` കാണാം.

## Applications

### Random Draws

{doc}`Previous lecture <python_by_example>`-ലെ താഴെ കൊടുത്തിരിക്കുന്ന code ഒരിക്കൽക്കൂടി നോക്കാം

```{code-cell} python3
rng = np.random.default_rng()

ts_length = 100
ϵ_values = []   # empty list

for i in range(ts_length):
    e = rng.standard_normal()
    ϵ_values.append(e)

plt.plot(ϵ_values)
plt.show()
```

നമുക്ക് ഈ program-നെ രണ്ട് ഭാഗങ്ങളായി break down ചെയ്യാം:

1. Random variables-ന്റെ ഒരു list generate ചെയ്യുന്ന ഒരു user-defined function.
1. താഴെ പറയുന്നവ ചെയ്യുന്ന program-ന്റെ പ്രധാന ഭാഗം
    1. Data ലഭിക്കാൻ ഈ function-നെ call ചെയ്യുന്നു
    1. Data plot ചെയ്യുന്നു

ഇത് താഴെ കൊടുത്തിരിക്കുന്ന program-ൽ സാധിച്ചിരിക്കുന്നു

(funcloopprog)=
```{code-cell} python3
def generate_data(n):
    ϵ_values = []
    for i in range(n):
        e = rng.standard_normal()
        ϵ_values.append(e)
    return ϵ_values

data = generate_data(100)
plt.plot(data)
plt.show()
```

Interpreter `generate_data(100)` എന്ന expression-ൽ എത്തുമ്പോൾ, `n`-ന്റെ വില 100 ആയി set ചെയ്ത് function body execute ചെയ്യുന്നു.

ഇതിന്റെ ഫലമായി `data` എന്ന പേര് function return ചെയ്യുന്ന `ϵ_values` എന്ന list-ലേക്ക് *bind* ചെയ്യപ്പെടുന്നു.

### Adding Conditions

```{index} single: Python; Conditions
```

നമ്മുടെ `generate_data()` function-ന് ചില പരിമിതികളുണ്ട്.

ആവശ്യാനുസരണം standard normals-ഓ $(0, 1)$-ൽ uniform random variables-ഓ return ചെയ്യാനുള്ള കഴിവ് നൽകി ഇതിനെ കുറച്ചുകൂടി useful ആക്കാം.

ഇത് താഴെ കൊടുത്തിരിക്കുന്ന code-ൽ സാധിച്ചിരിക്കുന്നു.

(funcloopprog2)=
```{code-cell} python3
def generate_data(n, generator_type):
    ϵ_values = []
    for i in range(n):
        if generator_type == 'U':
            e = rng.uniform(0, 1)
        else:
            e = rng.standard_normal()
        ϵ_values.append(e)
    return ϵ_values

data = generate_data(100, 'U')
plt.plot(data)
plt.show()
```

Indentation വീണ്ടും code blocks-ന്റെ പരിധി നിശ്ചയിക്കുന്നതോടെ, if/else clause-ന്റെ syntax സ്വയം വ്യക്തമാകും എന്ന് പ്രതീക്ഷിക്കുന്നു.

Notes

* `U` എന്ന argument നമ്മൾ ഒരു string ആയാണ് pass ചെയ്യുന്നത്, അതുകൊണ്ടാണ് നമ്മൾ ഇത് `'U'` എന്ന് എഴുതുന്നത്.
* Equality test ചെയ്യുന്നത് `==` syntax ഉപയോഗിച്ചാണ്, `=` അല്ല എന്നത് ശ്രദ്ധിക്കുക.
    * ഉദാഹരണത്തിന്, `a = 10` എന്ന statement `a` എന്ന പേരിനെ `10` എന്ന value-യിലേക്ക് assign ചെയ്യുന്നു.
    * `a`-യുടെ value അനുസരിച്ച്, `a == 10` എന്ന expression `True` അല്ലെങ്കിൽ `False` ആയി evaluate ചെയ്യപ്പെടുന്നു.

ഇനി, മുകളിലെ code simplify ചെയ്യാൻ പല വഴികളുണ്ട്.

ഉദാഹരണത്തിന്, ആവശ്യമുള്ള generator type-നെ ഒരു function, method, അല്ലെങ്കിൽ മറ്റ് [callable](https://typing.python.org/en/latest/spec/callables.html) object ആയി pass ചെയ്ത്, conditionals-നെ പൂർണ്ണമായും ഒഴിവാക്കാം.

ഇത് മനസ്സിലാക്കാൻ, താഴെ കൊടുത്തിരിക്കുന്ന version consider ചെയ്യാം.

(test_program_6)=
```{code-cell} python3
def generate_data(n, generator_type):
    ϵ_values = []
    for i in range(n):
        e = generator_type()
        ϵ_values.append(e)
    return ϵ_values

data = generate_data(100, rng.uniform)
plt.plot(data)
plt.show()
```

ഇനി, `generate_data()` എന്ന function-നെ call ചെയ്യുമ്പോൾ, നമ്മൾ `rng.uniform`-നെ രണ്ടാമത്തെ argument ആയി pass ചെയ്യുന്നു.

ഈ object ഒരു *callable* ആണ് — അതായത്, parentheses ഉപയോഗിച്ച് call ചെയ്യാൻ കഴിയുന്ന ഒരു object.

`generate_data(100, rng.uniform)` എന്ന function call execute ചെയ്യുമ്പോൾ, `n`-ന്റെ വില 100 ആയും, `generator_type` എന്ന പേര് `rng.uniform` എന്ന callable-ലേക്ക് "bind" ചെയ്തും Python function code block run ചെയ്യുന്നു.

* ഈ lines execute ചെയ്യുന്ന സമയത്ത്, `generator_type`, `rng.uniform` എന്നീ പേരുകൾ "synonyms" ആണ്, ഒരേ രീതിയിൽ തന്നെ ഉപയോഗിക്കാം.

ഈ തത്വം കുറച്ചുകൂടി വിശാലമായി പ്രവർത്തിക്കുന്നു --- ഉദാഹരണത്തിന്, താഴെ കൊടുത്തിരിക്കുന്ന code consider ചെയ്യാം

```{code-cell} python3
max(7, 2, 4)   # max() is a built-in Python function
```

```{code-cell} python3
m = max
m(7, 2, 4)
```

ഇവിടെ നമ്മൾ built-in function ആയ `max()`-ന് മറ്റൊരു പേര് create ചെയ്തു, അത് ഒരേ രീതിയിൽ തന്നെ ഉപയോഗിക്കാം.

നമ്മുടെ program-ന്റെ context-ൽ, functions-ലേക്ക്, അല്ലെങ്കിൽ കുറച്ചുകൂടി വിശാലമായി callable objects-ലേക്ക് പേരുകൾ bind ചെയ്യാനുള്ള കഴിവ് അർത്ഥമാക്കുന്നത്, ഒരു callable object-നെ മറ്റൊരു callable-ന് argument ആയി pass ചെയ്യുന്നതിൽ ഒരു പ്രശ്നവുമില്ല എന്നാണ് --- മുകളിൽ `rng.uniform`-ഉപയോഗിച്ച് നമ്മൾ ചെയ്തത് പോലെ.


(recursive_functions)=
## Recursive Function Calls (Advanced)

```{index} single: Python; Recursion
```

ഇത് ഒരു advanced topic ആണ്, വേണമെങ്കിൽ ഇത് skip ചെയ്യാം.

എന്നാൽ ഇത് ഒരു നല്ല idea ആണ്, നിങ്ങളുടെ programming career-ന്റെ ഏതെങ്കിലും stage-ൽ ഇത് പഠിക്കേണ്ടതാണ്.

Basically, ഒരു recursive function എന്നാൽ സ്വയം call ചെയ്യുന്ന ഒരു function ആണ്.

For example, ഏതെങ്കിലും $t$-ന് $x_t$ compute ചെയ്യുന്ന പ്രശ്നം consider ചെയ്യാം, ഇവിടെ

```{math}
:label: xseqdoub

x_{t+1} = 2 x_t, \quad x_0 = 1
```

Obviously, answer $2^t$ ആണ്.

ഒരു loop ഉപയോഗിച്ച് നമുക്ക് ഇത് എളുപ്പം compute ചെയ്യാം

```{code-cell} python3
def x_loop(t):
    x = 1
    for i in range(t):
        x = 2 * x
    return x
```

താഴെ കൊടുത്തിരിക്കുന്ന രീതിയിൽ ഒരു recursive solution-ഉം നമുക്ക് ഉപയോഗിക്കാം

```{code-cell} python3
def x(t):
    if t == 0:
        return 1
    else:
        return 2 * x(t-1)
```

ഇവിടെ സംഭവിക്കുന്നത്, ഓരോ successive call-ഉം *stack*-ലെ അതിന്റേതായ *frame* ഉപയോഗിക്കുന്നു എന്നതാണ്

* തന്നിരിക്കുന്ന ഒരു function call-ന്റെ local variables സൂക്ഷിക്കുന്ന സ്ഥലമാണ് frame
* function calls process ചെയ്യാൻ ഉപയോഗിക്കുന്ന memory ആണ് stack
  * last-in, first-out (LIFO) എന്ന ഒരു data structure ആണിത്

ഈ ഉദാഹരണം കുറച്ച് കൃത്രിമമാണ്, കാരണം സാധാരണയായി recursive solution-നേക്കാൾ ആദ്യത്തെ (iterative) solution ആയിരിക്കും preferred.

Recursion-ന്റെ കൂടുതൽ സ്വാഭാവികമായ applications നമുക്ക് പിന്നീട് കാണാം.


(factorial_exercise)=
## Exercises

```{exercise-start}
:label: func_ex1
```

Recall that $n!$ is read as "$n$ factorial" and defined as
$n! = n \times (n - 1) \times \cdots \times 2 \times 1$.

We will only consider $n$ as a positive integer here.

There are functions to compute this in various modules, but let's
write our own version as an exercise.

In particular, `factorial` എന്ന് പേരുള്ള ഒരു function എഴുതുക, such that `factorial(n)` returns $n!$ for any positive integer $n$.

```{exercise-end}
```


```{solution-start} func_ex1
:class: dropdown
```

Here's one solution:

```{code-cell} python3
def factorial(n):
    k = 1
    for i in range(n):
        k = k * (i + 1)
    return k

factorial(4)
```


```{solution-end}
```


```{exercise-start}
:label: func_ex2
```

The [binomial random variable](https://en.wikipedia.org/wiki/Binomial_distribution) $Y \sim Bin(n, p)$ represents the number of successes in $n$ binary trials, where each trial succeeds with probability $p$.

Using `rng = np.random.default_rng()`, write a function
`binomial_rv` such that `binomial_rv(n, p)` generates one draw of $Y$.

```{hint}
:class: dropdown

If $U$ is uniform on $(0, 1)$ and $p \in (0,1)$, then the expression `U < p` evaluates to `True` with probability $p$.
```

```{exercise-end}
```


```{solution-start} func_ex2
:class: dropdown
```

Here is one solution:

```{code-cell} python3
rng = np.random.default_rng()

def binomial_rv(n, p):
    count = 0
    for i in range(n):
        U = rng.uniform()
        if U < p:
            count = count + 1    # Or count += 1
    return count

binomial_rv(10, 0.5)
```

```{solution-end}
```


```{exercise-start}
:label: func_ex3
```

First, write a function that returns one realization of the following random device

1. Flip an unbiased coin 10 times.
1. If a head occurs `k` or more times consecutively within this sequence at least once, pay one dollar.
1. If not, pay nothing.

Second, write another function that does the same task except that the second rule of the above random device becomes

- If a head occurs `k` or more times within this sequence, pay one dollar.

Use `rng = np.random.default_rng()` to generate random numbers.

```{exercise-end}
```

```{solution-start} func_ex3
:class: dropdown
```

Here's a function for the first random device.




```{code-cell} python3
rng = np.random.default_rng()

def draw(k):  # pays if k consecutive successes in a sequence

    payoff = 0
    count = 0

    for i in range(10):
        U = rng.uniform()
        count = count + 1 if U < 0.5 else 0
        print(count)    # print counts for clarity
        if count == k:
            payoff = 1

    return payoff

draw(3)
```

Here's another function for the second random device.

```{code-cell} python3
def draw_new(k):  # pays if k successes in a sequence

    payoff = 0
    count = 0

    for i in range(10):
        U = rng.uniform()
        count = count + ( 1 if U < 0.5 else 0 )
        print(count)
        if count == k:
            payoff = 1

    return payoff

draw_new(3)
```

```{solution-end}
```


## Advanced Exercises

താഴെ കൊടുത്തിരിക്കുന്ന exercises-ൽ, നമുക്ക് ഒരുമിച്ച് recursive functions എഴുതാം.


```{exercise-start}
:label: func_ex4
```

The Fibonacci numbers are defined by

```{math}
:label: fib

x_{t+1} = x_t + x_{t-1}, \quad x_0 = 0, \; x_1 = 1
```

The first few numbers in the sequence are $0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55$.

Write a function to recursively compute the $t$-th Fibonacci number for any $t$.

```{exercise-end}
```

```{solution-start} func_ex4
:class: dropdown
```

Here's the standard solution

```{code-cell} python3
def x(t):
    if t == 0:
        return 0
    if t == 1:
        return 1
    else:
        return x(t-1) + x(t-2)
```

Let's test it

```{code-cell} python3
print([x(i) for i in range(10)])
```

```{solution-end}
```

```{exercise-start}
:label: func_ex5
```

[Exercise 1](factorial_exercise)-ലെ `factorial()` function-നെ, recursion ഉപയോഗിച്ച് വീണ്ടും എഴുതുക.

```{exercise-end}
```

```{solution-start} func_ex5
:class: dropdown
```

Here's the standard solution

```{code-cell} python3
def recursion_factorial(n):
   if n == 1:
       return n
   else:
       return n * recursion_factorial(n-1)
```

Let's test it

```{code-cell} python3
print([recursion_factorial(i) for i in range(1, 10)])
```

```{solution-end}
```
