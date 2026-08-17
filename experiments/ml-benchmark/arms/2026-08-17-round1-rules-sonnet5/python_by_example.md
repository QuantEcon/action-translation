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
  title: An Introductory Example
  headings:
    Overview: Overview
    'The Task: Plotting a White Noise Process': 'The Task: Plotting a White Noise Process'
    Version 1: Version 1
    Version 1::Imports: Imports
    Version 1::Imports::Why So Many Imports?: Why So Many Imports?
    Version 1::Imports::Packages: Packages
    Version 1::Imports::Subpackages: Subpackages
    Version 1::Importing Names Directly: Importing Names Directly
    Version 1::Random Draws: Random Draws
    Alternative Implementations: Alternative Implementations
    Alternative Implementations::A Version with a For Loop: A Version with a For Loop
    Alternative Implementations::Lists: Lists
    Alternative Implementations::The For Loop: The For Loop
    Alternative Implementations::A Comment on Indentation: A Comment on Indentation
    Alternative Implementations::While Loops: While Loops
    Another Application: Another Application
    Exercises: Exercises
---

(python_by_example)=
```{raw} jupyter
<div id="qe-notebook-header" align="right" style="text-align:right;">
        <a href="https://quantecon.org/" title="quantecon.org">
                <img style="width:250px;display:inline;" width="250px" src="https://assets.quantecon.org/img/qe-menubar-logo.svg" alt="QuantEcon">
        </a>
</div>
```

# An Introductory Example

```{index} single: Python; Introductory Example
```

## Overview

നമ്മൾ ഇനി Python language തന്നെ പഠിക്കാൻ തുടങ്ങാൻ തയ്യാറാണ്.

ഈ lecture-ൽ, നമ്മൾ ചെറിയ Python programs എഴുതുകയും അവയെ break down ചെയ്ത് പരിശോധിക്കുകയും ചെയ്യും.

അടിസ്ഥാനപരമായ Python syntax-ഉം data structures-ഉം നിങ്ങൾക്ക് പരിചയപ്പെടുത്തുക എന്നതാണ് ലക്ഷ്യം.

കൂടുതൽ ആഴമുള്ള concepts പിന്നീടുള്ള lectures-ൽ cover ചെയ്യും.

ഇത് തുടങ്ങുന്നതിന് മുമ്പ് Python-ലേക്ക് getting started ചെയ്യുന്നതിനെക്കുറിച്ചുള്ള {doc}`lecture <getting_started>` നിങ്ങൾ വായിച്ചിരിക്കണം.


## The Task: Plotting a White Noise Process

നമുക്ക് white noise process $\epsilon_0, \epsilon_1, \ldots, \epsilon_T$ simulate ചെയ്ത് plot ചെയ്യണം എന്ന് കരുതുക. ഇവിടെ ഓരോ draw $\epsilon_t$-യും independent standard normal ആണ്.

അതായത്, താഴെ കാണുന്നത് പോലുള്ള figures generate ചെയ്യണം:

```{figure} /_static/lecture_specific/python_by_example/test_program_1_updated.png
:scale: 120
```

(ഇവിടെ $t$ horizontal axis-ലും $\epsilon_t$ vertical axis-ലും ആണ്.)

നമ്മൾ ഇത് പല വ്യത്യസ്ത രീതികളിൽ ചെയ്യും, ഓരോ തവണയും Python-നെക്കുറിച്ച് കൂടുതൽ എന്തെങ്കിലും പഠിച്ചുകൊണ്ട്.

## Version 1

(ourfirstprog)=
നമ്മൾ set ചെയ്ത task perform ചെയ്യുന്ന കുറച്ച് വരി code താഴെ കാണാം

```{code-cell} ipython
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng()
ϵ_values = rng.standard_normal(100)
plt.plot(ϵ_values)
plt.show()
```

ഈ program break down ചെയ്ത് അത് എങ്ങനെ പ്രവർത്തിക്കുന്നു എന്ന് നോക്കാം.

(import)=
### Imports

Program-ന്റെ ആദ്യത്തെ രണ്ട് വരികൾ external code libraries-ൽ നിന്നും functionality import ചെയ്യുന്നു.

ആദ്യത്തെ വരി {doc}`NumPy <numpy>` import ചെയ്യുന്നു. താഴെ പറയുന്ന tasks-ന് ഏറ്റവും പ്രിയപ്പെട്ട Python package ആണ് ഇത്

* arrays (vectors-ഉം matrices-ഉം) കൈകാര്യം ചെയ്യൽ
* `cos`, `sqrt` പോലുള്ള common mathematical functions
* random numbers generate ചെയ്യൽ
* linear algebra, തുടങ്ങിയവ

`import numpy as np` എന്നതിന് ശേഷം, `np.attribute` എന്ന syntax വഴി ഈ attributes-ലേക്ക് നമുക്ക് access ലഭിക്കും.

ഇതാ വേറെ രണ്ട് examples

```{code-cell} python3
np.sqrt(4)
```

```{code-cell} python3
np.log(4)
```


#### Why So Many Imports?

Python programs-ന് സാധാരണയായി ഒന്നിലധികം import statements ആവശ്യമായിവരുന്നു.

കാരണം core language മന:പൂർവ്വം ചെറുതായി നിലനിർത്തിയിരിക്കുന്നു, അതുകൊണ്ട് ഇത് പഠിക്കാനും maintain ചെയ്യാനും improve ചെയ്യാനും എളുപ്പമാണ്.

Python ഉപയോഗിച്ച് രസകരമായ എന്തെങ്കിലും ചെയ്യണം എന്നുണ്ടെങ്കിൽ, മിക്ക സമയത്തും additional functionality import ചെയ്യേണ്ടിവരും.


#### Packages

```{index} single: Python; Packages
```

മുകളിൽ പറഞ്ഞത് പോലെ, NumPy ഒരു Python package ആണ്.

Share ചെയ്യാൻ ആഗ്രഹിക്കുന്ന code organize ചെയ്യാൻ developers packages ഉപയോഗിക്കുന്നു.

വാസ്തവത്തിൽ, ഒരു **package** എന്നത് താഴെ പറയുന്നവ അടങ്ങിയ ഒരു directory മാത്രമാണ്

1. Python code ഉള്ള files --- Python-ൽ **modules** എന്ന് വിളിക്കുന്നു
1. Python-ന് access ചെയ്യാൻ കഴിയുന്ന compiled code ഒരുപക്ഷേ ഉണ്ടാകാം (ഉദാഹരണത്തിന്, C അല്ലെങ്കിൽ FORTRAN code-ൽ നിന്നും compile ചെയ്ത functions)
1. `import package_name` എന്ന് type ചെയ്യുമ്പോൾ എന്ത് execute ചെയ്യുമെന്ന് specify ചെയ്യുന്ന `__init__.py` എന്ന ഒരു file

NumPy-യുടെ `__init__.py`-യുടെ location, താഴെ കാണുന്ന code run ചെയ്ത് python-ൽ check ചെയ്യാം:

```{code-block} ipython
:class: no-execute

import numpy as np

print(np.__file__)
```

#### Subpackages

```{index} single: Python; Subpackages
```

`rng = np.random.default_rng()` എന്ന വരി പരിഗണിക്കുക.

ഇവിടെ `np` NumPy എന്ന package-നെ refer ചെയ്യുന്നു, `random` എന്നത് NumPy-യുടെ ഒരു **subpackage** ആണ്.

Subpackages എന്നത് മറ്റൊരു package-ന്റെ subdirectories ആയ packages മാത്രമാണ്.

ഉദാഹരണത്തിന്, NumPy-യുടെ directory-യിലെ `random` എന്ന folder നിങ്ങൾക്ക് കണ്ടെത്താം.

### Importing Names Directly

മുകളിൽ നമ്മൾ കണ്ട ഈ code ഓർക്കുക

```{code-cell} python3
import numpy as np

np.sqrt(4)
```

NumPy-യുടെ square root function access ചെയ്യാൻ വേറൊരു വഴി താഴെ കാണാം

```{code-cell} python3
from numpy import sqrt

sqrt(4)
```

ഇതും ശരിയായ രീതി തന്നെയാണ്.

നമ്മുടെ code-ൽ `sqrt` പലപ്പോഴും ഉപയോഗിക്കുകയാണെങ്കിൽ, ഇത് ഉപയോഗിക്കുന്നത് typing കുറയ്ക്കും എന്നതാണ് advantage.

ദൈർഘ്യമേറിയ ഒരു program-ൽ, ഈ രണ്ട് വരികൾ പല വരികളാൽ വേർതിരിക്കപ്പെട്ടിരിക്കാം എന്നതാണ് disadvantage.

അപ്പോൾ `sqrt` എവിടെ നിന്നും വന്നു എന്ന് വായനക്കാർക്ക് അറിയണം എങ്കിൽ അത് കണ്ടെത്താൻ പ്രയാസമാകും.

### Random Draws

White noise plot ചെയ്യുന്ന നമ്മുടെ program-ലേക്ക് തിരിച്ചു വന്നാൽ, import statements-ന് ശേഷമുള്ള ബാക്കി മൂന്ന് വരികൾ ഇവയാണ്

```{code-cell} ipython
ϵ_values = rng.standard_normal(100)
plt.plot(ϵ_values)
plt.show()
```

ആദ്യത്തെ വരി 100 (quasi) independent standard normals generate ചെയ്ത് അവയെ `ϵ_values`-ൽ store ചെയ്യുന്നു.

അടുത്ത രണ്ട് വരികൾ plot generate ചെയ്യുന്നു.

താഴെ ഈ plot configure ചെയ്യാനും improve ചെയ്യാനുമുള്ള പല വഴികളും നമുക്ക് നോക്കാം.

## Alternative Implementations

Standard normal distribution-ൽ നിന്നും IID draws plot ചെയ്ത {ref}`our first program <ourfirstprog>`-ന്റെ ചില alternative versions എഴുതി നോക്കാം.

താഴെയുള്ള programs, ആദ്യത്തേതിനേക്കാൾ efficient അല്ല, അതുകൊണ്ട് അല്പം artificial ആണ്.

എന്നാൽ പരിചയമുള്ള ഒരു setting-ൽ പ്രധാനപ്പെട്ട ചില Python syntax-ഉം semantics-ഉം വ്യക്തമാക്കാൻ ഇവ സഹായിക്കും.

### A Version with a For Loop

`for` loops-ഉം Python lists-ഉം illustrate ചെയ്യുന്ന ഒരു version താഴെ കാണാം.

(firstloopprog)=
```{code-cell} python3
ts_length = 100
ϵ_values = []   # empty list

for i in range(ts_length):
    e = rng.standard_normal()
    ϵ_values.append(e)

plt.plot(ϵ_values)
plt.show()
```

ചുരുക്കത്തിൽ,

* ആദ്യത്തെ വരി time series-ന്റെ ആവശ്യമുള്ള length set ചെയ്യുന്നു.
* അടുത്ത വരി `ϵ_values` എന്ന ഒരു empty *list* create ചെയ്യുന്നു, ഇത് നമ്മൾ generate ചെയ്യുന്ന $\epsilon_t$ values store ചെയ്യും.
* `# empty list` എന്ന statement ഒരു *comment* ആണ്, Python-ന്റെ interpreter ഇത് ignore ചെയ്യുന്നു.
* അടുത്ത മൂന്ന് വരികൾ `for` loop ആണ്, ഇത് repeatedly ഒരു പുതിയ random number $\epsilon_t$ draw ചെയ്ത് `ϵ_values` എന്ന list-ന്റെ അവസാനത്തിൽ append ചെയ്യുന്നു.
* അവസാനത്തെ രണ്ട് വരികൾ plot generate ചെയ്ത് ഉപയോക്താവിന് display ചെയ്യുന്നു.

ഈ program-ന്റെ ചില ഭാഗങ്ങൾ കൂടുതൽ വിശദമായി പഠിക്കാം.

(lists_ref)=
### Lists

```{index} single: Python; Lists
```

Empty list create ചെയ്യുന്ന `ϵ_values = []` എന്ന statement പരിഗണിക്കുക.

Objects-ന്റെ ഒരു collection group ചെയ്യാൻ ഉപയോഗിക്കുന്ന ഒരു native Python data structure ആണ് lists.

Lists-ലെ items ordered ആണ്, കൂടാതെ lists-ൽ duplicates അനുവദനീയമാണ്.

ഉദാഹരണത്തിന്, ഇത് try ചെയ്യുക

```{code-cell} python3
x = [10, 'foo', False]
type(x)
```

`x`-ന്റെ ആദ്യത്തെ element ഒരു [integer](https://en.wikipedia.org/wiki/Integer_(computer_science)) ആണ്, അടുത്തത് ഒരു [string](https://en.wikipedia.org/wiki/String_(computer_science)) ആണ്, മൂന്നാമത്തേത് ഒരു [Boolean value](https://en.wikipedia.org/wiki/Boolean_data_type) ആണ്.

ഒരു value ഒരു list-ലേക്ക് ചേർക്കുമ്പോൾ, നമുക്ക് `list_name.append(some_value)` എന്ന syntax ഉപയോഗിക്കാം

```{code-cell} python3
x
```

```{code-cell} python3
x.append(2.5)
x
```

ഇവിടെ `append()` എന്നത് ഒരു **method** ആണ്, ഇത് ഒരു object-ൽ "attach" ചെയ്തിരിക്കുന്ന ഒരു function ആണ് --- ഈ case-ൽ, `x` എന്ന list.

Methods-നെക്കുറിച്ച് എല്ലാം {doc}`later on <oop_intro>` നമ്മൾ പഠിക്കും, പക്ഷേ ചെറിയൊരു idea തരാൻ,

* Lists, strings തുടങ്ങിയ Python objects-ന് object-ൽ അടങ്ങിയിരിക്കുന്ന data manipulate ചെയ്യാൻ ഉപയോഗിക്കുന്ന methods ഉണ്ട്.
* String objects-ന് [string methods](https://docs.python.org/3/library/stdtypes.html#string-methods) ഉണ്ട്, list objects-ന് [list methods](https://docs.python.org/3/tutorial/datastructures.html#more-on-lists) ഉണ്ട്, തുടങ്ങിയവ.

ഉപകാരപ്രദമായ വേറൊരു list method ആണ് `pop()`

```{code-cell} python3
x
```

```{code-cell} python3
x.pop()
```

```{code-cell} python3
x
```

Python-ലെ lists zero-based ആണ് (as in C, Java or Go), അതുകൊണ്ട് ആദ്യത്തെ element `x[0]` എന്ന് refer ചെയ്യപ്പെടുന്നു

```{code-cell} python3
x[0]   # first element of x
```

```{code-cell} python3
x[1]   # second element of x
```

### The For Loop

```{index} single: Python; For loop
```

ഇനി {ref}`the program above <firstloopprog>`-ലെ `for` loop നോക്കാം, അത് ഇതായിരുന്നു

```{code-cell} python3
for i in range(ts_length):
    e = rng.standard_normal()
    ϵ_values.append(e)
```

Python, indented ആയ ഈ രണ്ട് വരികൾ `ts_length` തവണ execute ചെയ്ത ശേഷം മുന്നോട്ട് പോകുന്നു.

ഈ രണ്ട് വരികളെ ഒരു **code block** എന്ന് വിളിക്കുന്നു, കാരണം നമ്മൾ loop ചെയ്യുന്ന code-ന്റെ "block" ഇവയാണ്.

മറ്റ് മിക്ക languages-ൽ നിന്നും വ്യത്യസ്തമായി, Python-ന് code block-ന്റെ പരിധി *indentation-ൽ നിന്ന് മാത്രമേ* അറിയൂ.

നമ്മുടെ program-ൽ, `ϵ_values.append(e)` എന്ന വരിക്ക് ശേഷം indentation കുറയുന്നു, ഇത് code block-ന്റെ lower limit ഇവിടെയാണ് എന്ന് Python-നോട് പറയുന്നു.

Indentation-നെക്കുറിച്ച് കൂടുതൽ താഴെ --- ഇപ്പോൾ, `for` loop-ന്റെ വേറൊരു example നോക്കാം

```{code-cell} python3
animals = ['dog', 'cat', 'bird']
for animal in animals:
    print("The plural of " + animal + " is " + animal + "s")
```

ഈ example, `for` loop എങ്ങനെ പ്രവർത്തിക്കുന്നു എന്ന് വ്യക്തമാക്കാൻ സഹായിക്കുന്നു: താഴെ പറയുന്ന form-ലുള്ള ഒരു loop നമ്മൾ execute ചെയ്യുമ്പോൾ

```{code-block} python3
:class: no-execute

for variable_name in sequence:
    <code block>
```

Python interpreter താഴെ പറയുന്നത് perform ചെയ്യുന്നു:

* `sequence`-ന്റെ ഓരോ element-ഇനും, അത് `variable_name` എന്ന name ആ element-ലേക്ക് "bind" ചെയ്ത ശേഷം code block execute ചെയ്യുന്നു.


### A Comment on Indentation

```{index} single: Python; Indentation
```

`for` loop-നെക്കുറിച്ച് discuss ചെയ്യുമ്പോൾ, loop ചെയ്യപ്പെടുന്ന code blocks indentation വഴിയാണ് delimit ചെയ്യപ്പെടുന്നത് എന്ന് നമ്മൾ വിശദീകരിച്ചു.

വാസ്തവത്തിൽ, Python-ൽ, *എല്ലാ* code blocks-ഉം (അതായത്, loops, if clauses, function definitions തുടങ്ങിയവയ്ക്കുള്ളിൽ ഉള്ളവ) indentation വഴിയാണ് delimit ചെയ്യപ്പെടുന്നത്.

അതുകൊണ്ട്, മറ്റ് മിക്ക languages-ൽ നിന്നും വ്യത്യസ്തമായി, Python code-ലെ whitespace, program-ന്റെ output-നെ affect ചെയ്യുന്നു.

ഇത് ശീലമായാൽ, ഇത് ഒരു നല്ല കാര്യമാണ്: ഇത്

* clean-ഉം consistent-ഉം ആയ indentation force ചെയ്യുന്നു, readability improve ചെയ്യുന്നു
* മറ്റ് languages-ൽ ഉപയോഗിക്കുന്ന brackets അല്ലെങ്കിൽ end statements പോലുള്ള clutter നീക്കം ചെയ്യുന്നു

On the other hand, ഇത് ശരിയായി ചെയ്യാൻ അല്പം ശ്രദ്ധ വേണ്ടിവരും, അതുകൊണ്ട് ദയവായി ഓർക്കുക:

* ഒരു code block തുടങ്ങുന്നതിന് മുമ്പുള്ള വരി എപ്പോഴും ഒരു colon-ൽ അവസാനിക്കണം
    * `for i in range(10):`
    * `if x > y:`
    * `while x < 100:`
    * തുടങ്ങിയവ
* ഒരു code block-ലെ എല്ലാ lines-ഇനും ഒരേ amount indentation ഉണ്ടായിരിക്കണം.
* Python standard 4 spaces ആണ്, അതാണ് നിങ്ങൾ ഉപയോഗിക്കേണ്ടത്.

### While Loops

```{index} single: Python; While loop
```

Python-ൽ iteration-നുള്ള ഏറ്റവും common technique ആണ് `for` loop.

എന്നാൽ, illustration-ന്റെ ആവശ്യത്തിന്, {ref}`the program above <firstloopprog>` പകരം ഒരു `while` loop ഉപയോഗിക്കാൻ modify ചെയ്യാം.

(whileloopprog)=
```{code-cell} python3
ts_length = 100
ϵ_values = []
i = 0
while i < ts_length:
    e = rng.standard_normal()
    ϵ_values.append(e)
    i = i + 1
plt.plot(ϵ_values)
plt.show()
```

Condition (```i < ts_length```) തൃപ്തിപ്പെടുത്തുന്നത് വരെ, indentation delimit ചെയ്ത code block ഒരു while loop repeatedly execute ചെയ്തുകൊണ്ടിരിക്കും.

ഈ case-ൽ, ```i``` ```ts_length```-ന് തുല്യമാകുന്നത് വരെ program ```ϵ_values``` എന്ന list-ലേക്ക് values ചേർത്തുകൊണ്ടേയിരിക്കും:

```{code-cell} python3
i == ts_length #the ending condition for the while loop
```

ശ്രദ്ധിക്കുക:

* `while` loop-ന്റെ code block ഇവിടെയും indentation മാത്രമേ delimit ചെയ്യുന്നുള്ളൂ.
* `i = i + 1` എന്ന statement `i += 1` എന്ന് replace ചെയ്യാം.

## Another Application

Exercises-ലേക്ക് കടക്കുന്നതിന് മുമ്പ് ഒരു application കൂടി ചെയ്യാം.

ഈ application-ൽ, ഒരു bank account-ന്റെ balance കാലക്രമേണ plot ചെയ്യുന്നു.

ഈ time period-ൽ withdraws ഒന്നും ഇല്ല, ആ period-ന്റെ അവസാനത്തെ date $T$ എന്ന് denote ചെയ്യുന്നു.

Initial balance $b_0$ ആണ്, interest rate $r$ ആണ്.

Balance, period $t$-ൽ നിന്നും $t+1$-ലേക്ക് $b_{t+1} = (1 + r) b_t$ അനുസരിച്ച് update ആകുന്നു.

താഴെയുള്ള code-ൽ, നമ്മൾ sequence $b_0, b_1, \ldots, b_T$ generate ചെയ്ത് plot ചെയ്യുന്നു.

ഈ sequence store ചെയ്യാൻ ഒരു Python list ഉപയോഗിക്കുന്നതിന് പകരം, നമ്മൾ ഒരു NumPy array ഉപയോഗിക്കും.

```{code-cell} python3
r = 0.025         # interest rate
T = 50            # end date
b = np.empty(T+1) # an empty NumPy array, to store all b_t
b[0] = 10         # initial balance

for t in range(T):
    b[t+1] = (1 + r) * b[t]

plt.plot(b, label='bank balance')
plt.legend()
plt.show()
```

`b = np.empty(T+1)` എന്ന statement `T+1` (floating point) numbers-ന് memory-ൽ storage allocate ചെയ്യുന്നു.

ഈ numbers `for` loop വഴി fill ചെയ്യപ്പെടുന്നു.

തുടക്കത്തിൽ തന്നെ memory allocate ചെയ്യുന്നത്, ഒരു Python list-ഉം `append`-ഉം ഉപയോഗിക്കുന്നതിനേക്കാൾ efficient ആണ്, കാരണം രണ്ടാമത്തേത് operating system-ൽ നിന്നും repeatedly storage space ചോദിക്കേണ്ടിവരും.

Plot-ലേക്ക് ഒരു legend ചേർത്തത് ശ്രദ്ധിക്കുക --- exercises-ൽ നിങ്ങൾ ഉപയോഗിക്കാൻ ആവശ്യപ്പെടുന്ന ഒരു feature ആണിത്.

## Exercises

ഇനി exercises-ലേക്ക് കടക്കുക. തുടരുന്നതിന് മുമ്പ് ഇവ complete ചെയ്യേണ്ടത് പ്രധാനമാണ്, കാരണം ഇവ നമുക്ക് ആവശ്യമായ പുതിയ concepts present ചെയ്യുന്നു.

```{exercise-start}
:label: pbe_ex1
```

Correlated time series simulate ചെയ്ത് plot ചെയ്യുകയാണ് നിങ്ങളുടെ ആദ്യത്തെ task

$$
x_{t+1} = \alpha \, x_t + \epsilon_{t+1}
\quad \text{where} \quad
x_0 = 0
\quad \text{and} \quad t = 0,\ldots,T
$$

The sequence of shocks $\{\epsilon_t\}$ is assumed to be IID and standard normal.

നിങ്ങളുടെ solution-ൽ, import statements ഇവയിലേക്ക് restrict ചെയ്യുക

```{code-cell} python3
import numpy as np
import matplotlib.pyplot as plt
```

Set $T=200$, $\alpha = 0.9$ ആയി.

```{exercise-end}
```

```{solution-start} pbe_ex1
:class: dropdown
```

ഒരു solution താഴെ കാണാം.

```{code-cell} python3
α = 0.9
T = 200
x = np.empty(T+1)
x[0] = 0
rng = np.random.default_rng()

for t in range(T):
    x[t+1] = α * x[t] + rng.standard_normal()

plt.plot(x)
plt.show()
```

```{solution-end}
```


```{exercise-start}
:label: pbe_ex2

Exercise 1-ന്റെ നിങ്ങളുടെ solution-ൽ നിന്നും തുടങ്ങി, $\alpha=0$, $\alpha=0.8$, $\alpha=0.98$ എന്നീ ഓരോ cases-ഇനും ഓരോന്ന് വീതം മൂന്ന് simulated time series plot ചെയ്യുക.

$\alpha$ values-ലൂടെ step ചെയ്യാൻ ഒരു `for` loop ഉപയോഗിക്കുക.

സാധിക്കുമെങ്കിൽ, മൂന്ന് time series-കൾ തമ്മിൽ distinguish ചെയ്യാൻ സഹായിക്കുന്ന ഒരു legend ചേർക്കുക.

```{hint}
:class: dropdown

* `show()` call ചെയ്യുന്നതിന് മുമ്പ് `plot()` function പല തവണ call ചെയ്താൽ, നിങ്ങൾ produce ചെയ്യുന്ന എല്ലാ lines-ഉം ഒരേ figure-ൽ വരും.
* Legend-ന്, `var = 42` എന്ന് കരുതുക, `f'foo{var}'` എന്ന expression `'foo42'` ആയി evaluate ചെയ്യപ്പെടും എന്ന് note ചെയ്യുക.
```

```{exercise-end}
```


```{solution-start} pbe_ex2
:class: dropdown
```

```{code-cell} python3
α_values = [0.0, 0.8, 0.98]
T = 200
x = np.empty(T+1)
rng = np.random.default_rng()

for α in α_values:
    x[0] = 0
    for t in range(T):
        x[t+1] = α * x[t] + rng.standard_normal()
    plt.plot(x, label=f'$\\alpha = {α}$')

plt.legend()
plt.show()
```

```{note}
Solution-ലെ `f'$\\alpha = {α}$'` എന്നത് [f-String](https://docs.python.org/3/tutorial/inputoutput.html#tut-f-strings)-ന്റെ ഒരു application ആണ്, ഇത് `{}` ഉപയോഗിച്ച് ഒരു expression contain ചെയ്യാൻ അനുവദിക്കുന്നു.

Contain ചെയ്ത expression evaluate ചെയ്യപ്പെടും, result string-ലേക്ക് ചേർക്കപ്പെടും.
```

```{solution-end}
```

```{exercise-start}
:label: pbe_ex3

മുമ്പത്തെ exercises-ന് സമാനമായി, ഈ time series plot ചെയ്യുക

$$
x_{t+1} = \alpha \, |x_t| + \epsilon_{t+1}
\quad \text{where} \quad
x_0 = 0
\quad \text{and} \quad t = 0,\ldots,T
$$

Use $T=200$, $\alpha = 0.9$ and $\{\epsilon_t\}$ as before.

Absolute value $|x_t|$ compute ചെയ്യാൻ ഉപയോഗിക്കാവുന്ന ഒരു function online search ചെയ്യുക.
```

```{exercise-end}
```


```{solution-start} pbe_ex3
:class: dropdown
```

Here's one solution:

```{code-cell} python3
α = 0.9
T = 200
x = np.empty(T+1)
x[0] = 0
rng = np.random.default_rng()

for t in range(T):
    x[t+1] = α * np.abs(x[t]) + rng.standard_normal()

plt.plot(x)
plt.show()
```

```{solution-end}
```


```{exercise-start}
:label: pbe_ex4
```

മിക്കവാറും എല്ലാ programming languages-ന്റെയും ഒരു പ്രധാന aspect ആണ് branching-ഉം conditions-ഉം.

Python-ൽ, conditions സാധാരണയായി if--else syntax ഉപയോഗിച്ചാണ് implement ചെയ്യുന്നത്.

ഒരു array-ലെ ഓരോ negative number-ഇനും -1-ഉം ഓരോ nonnegative number-ഇനും 1-ഉം print ചെയ്യുന്ന ഒരു example താഴെ കാണാം

```{code-cell} python3
numbers = [-9, 2.3, -11, 0]
```

```{code-cell} python3
for x in numbers:
    if x < 0:
        print(-1)
    else:
        print(1)
```

ഇനി, absolute value compute ചെയ്യാൻ നിലവിലുള്ള ഒരു function ഉപയോഗിക്കാത്ത, Exercise 3-ന് ഒരു പുതിയ solution എഴുതുക.

നിലവിലുള്ള ഈ function-ന് പകരം ഒരു if--else condition ഉപയോഗിക്കുക.

```{exercise-end}
```

```{solution-start} pbe_ex4
:class: dropdown
```

ഒരു വഴി താഴെ കാണാം:

```{code-cell} python3
α = 0.9
T = 200
x = np.empty(T+1)
x[0] = 0
rng = np.random.default_rng()

for t in range(T):
    if x[t] < 0:
        abs_x = - x[t]
    else:
        abs_x = x[t]
    x[t+1] = α * abs_x + rng.standard_normal()

plt.plot(x)
plt.show()
```

ഇതേ കാര്യം എഴുതാൻ ചെറിയൊരു വഴി താഴെ കാണാം:

```{code-cell} python3
α = 0.9
T = 200
x = np.empty(T+1)
x[0] = 0
rng = np.random.default_rng()

for t in range(T):
    abs_x = - x[t] if x[t] < 0 else x[t]
    x[t+1] = α * abs_x + rng.standard_normal()

plt.plot(x)
plt.show()
```

```{solution-end}
```



```{exercise-start}
:label: pbe_ex5
```

ചിന്തയും planning-ഉം ആവശ്യമായ ഒരു കടുപ്പമേറിയ exercise താഴെ കാണാം.

[Monte Carlo](https://en.wikipedia.org/wiki/Monte_Carlo_method) ഉപയോഗിച്ച് $\pi$-യ്ക്ക് ഒരു approximation compute ചെയ്യുകയാണ് task.

താഴെ പറയുന്നതല്ലാതെ വേറെ imports ഉപയോഗിക്കരുത്

```{code-cell} python3
import numpy as np
```

```{hint}
:class: dropdown

Your hints are as follows:

* If $U$ is a bivariate uniform random variable on the unit square $(0, 1)^2$, then the probability that $U$ lies in a subset $B$ of $(0,1)^2$ is equal to the area of $B$.
* If $U_1,\ldots,U_n$ are IID copies of $U$, then, as $n$ gets large, the fraction that falls in $B$, converges to the probability of landing in $B$.
* For a circle, $area = \pi * radius^2$.
```

```{exercise-end}
```


```{solution-start} pbe_ex5
:class: dropdown
```

Consider the circle of diameter 1 embedded in the unit square.

Let $A$ be its area and let $r=1/2$ be its radius.

If we know $\pi$ then we can compute $A$ via
$A = \pi r^2$.

But here the point is to compute $\pi$, which we can do by
$\pi = A / r^2$.

Summary: If we can estimate the area of a circle with diameter 1, then dividing
by $r^2 = (1/2)^2 = 1/4$ gives an estimate of $\pi$.

We estimate the area by sampling bivariate uniforms and looking at the
fraction that falls into the circle.

```{code-cell} python3
n = 1000000 # sample size for Monte Carlo simulation
rng = np.random.default_rng()

count = 0
for i in range(n):

    # drawing random positions on the square
    u, v = rng.uniform(), rng.uniform()

    # check whether the point falls within the boundary
    # of the unit circle centred at (0.5,0.5)
    d = np.sqrt((u - 0.5)**2 + (v - 0.5)**2)

    # if it falls within the inscribed circle, 
    # add it to the count
    if d < 0.5:
        count += 1

area_estimate = count / n

print(area_estimate * 4)  # dividing by radius**2
```

```{solution-end}
```
