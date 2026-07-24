---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  language: python
  name: python3
---

(getting_started)=
```{raw} jupyter
<div id="qe-notebook-header" align="right" style="text-align:right;">
        <a href="https://quantecon.org/" title="quantecon.org">
                <img style="width:250px;display:inline;" width="250px" src="https://assets.quantecon.org/img/qe-menubar-logo.svg" alt="QuantEcon">
        </a>
</div>
```

<!-- TODO: Review this styling -->

<style>
  .auto {
    width: 70%;
    height: auto;
    } 
  .terminal{
    width: 80%;
    height: auto;
  }  
</style>


# Getting Started

```{index} single: Python
```

## Overview

ഈ lecture-ൽ, നിങ്ങൾ പഠിക്കാൻ പോകുന്നതു:

1. cloud-ൽ എങ്ങനെ Python use ചെയ്യാം
1. local environment-ൽ Python എങ്ങനെ run ചെയ്യികാം
1. simple Python commands എങ്ങനെ execute ചെയ്യാം
1. ഒരു sample program എങ്ങനെ run ചെയ്യികാം
1. ഈ lecture-ൻ ആവശ്യമായ code libraries എങ്ങനെ install ചെയ്യാം

## Python in the Cloud

Python-ൽ coding ആരംഭിക്കാനുള്ള ഏറ്റവും എളുപ്പ മാർഗം അത് cloud-ൽ run ചെയ്യുക എന്നതാണ്.

(അതായത്, Python already install ചെയ്തിട്ടുള്ള ഒരു remote server ഉപയോഗിച്ചുകൊണ്ട്.)

ഇതിനായി free-യും reliable-യും ആയിട്ടുള്ള ഒരു option ആണ് Google Colab [Google Colab](https://colab.research.google.com/).

Colab-ന്റെ മറ്റൊരു advantage അത് GPU-കൾ provide ചെയ്യുന്നു എന്നതാണ്. അത് നമ്മൾ കൂടുതൽ advanced ആയ lectures-ൽ ഉപയോഗിക്കും.

Google Colab എങ്ങനെ ഉപയോഗികാം എന്നുള്ള tutorials, web & video searches വഴി കണ്ടെത്താവുന്നതാണ്.

നമ്മുടെ മിക്ക lectures-ലും top right-ൽ ഒരു 'Launch notebook' button ഉണ്ട് (ഒരു play icon സഹിതം). അത് Colab-ലെ ഒരു executable version-മായി നിങ്ങളെ connect ചെയ്യുന്നു.


## Local Install

Python-ൽ നിങ്ങൾ ഒരു substanial amount of programming ചെയ്യാൻ ഉദ്ദേശിക്കുന്നുണ്ടെങ്കിലോ, അതിനു suitable ആയിട്ടുള്ള machine നിങ്ങളുടെ പകം ഉണ്ടെങ്കിലോ, local installs ആണ് കൂടുതൽ നല്ലത്.

എന്നാൽ അതേ സമയം, Colab പോലുള്ള ഒരു cloud option-നെ അപേക്ഷിച്ച്, local installs കുറച്ചു പ്രയാസമാണ്.

ഈ lecture-ന്റെ ബാക്കി ഭാഗം local installs-മായി ബന്ധപ്പെട്ട ചില details നിങ്ങൾക്ക് വിശദീകരിച്ചു തരുന്നു.


### The Anaconda Distribution

[Core Python package](https://www.python.org/downloads/) install ചെയ്യാൻ എളുപ്പമാണ് പക്ഷെ ഈ lectures-നായി അത് *ഉപയോഗിക്കേണ്ടതല്ല*.

ഈ lectures-ന് eentire scientific programming ecosystem ആവശ്യമാണ്,

* അത് core installation provide ചെയ്യുന്നില്ല
* ഒന്നൊന്നായി അത് install ചെയ്യുന്നത് വളരെ ബുദ്ധിമുട്ടുള്ള കാര്യവുമാണ്.

അതിനാൽ നമ്മുടെ ആവശ്യത്തിന് ഏറ്റവും best മാർഗം,

1. Core Python language **കൂടാതെ**
1. most popular scientific libraries-ന്റെ compatible versions,

തുടങ്ങിയവ ഉൾക്കൊള്ളുന്ന ഒരു Python distribution install ചെയ്യുക എന്നതാണ്.

ഇത്തരത്തിലുള്ള ഏറ്റവും മികച്ച distribution ആണ് [Anaconda Python](https://www.anaconda.com/).

Anaconda is

* very popular (programmers വ്യാപകമായി ഉപയോഗിക്കുന്നു)
* cross-platform (Windows, macOS, Linux പോലുള്ള ഒന്നിലധികം operating systems-ൽ use ചെയ്യാം)
* comprehensive (നിരവധി tools & libraries ഒരു package-ൽ ഉൾപ്പെടുന്നതിനാൽ അവ separately install ചെയ്യേണ്ട ആവശ്യമില്ല)

Anaconda-യിൽ നിങ്ങളുടെ code libraries organize ചെയ്യാൻ ഒരു package management system കൂടി ഉൾപ്പെടുന്നു.

**ഇനി പറയുന്നതെല്ലാം നിങ്ങൾ മുകളിലത്തെ recommendations follow ചെയ്‌തു എന്ന് കരുതിയാണ്!**

(install_anaconda)=
### Installing Anaconda

```{index} single: Python; Anaconda
```

Anaconda install ചെയ്യാനായി അതിന്റെ binary [download](https://www.anaconda.com/download) ചെയ്‌തു, അതിലെ instructions follow ചെയ്യുക.

ശ്രദ്ധിക്കുക:

* നിങ്ങളുടെ OS-നനുസരിച്ച് ശരിയായ version install ചെയ്യുക.
* Installation process-ൽ Anaconda നിങ്ങളുടെ default Python installation ആക്കണോ എന്ന് ചോദിച്ചാൽ, yes എന്ന് കൊടുക്കുക.

### Updating `conda`

Anaconda, നിങ്ങളുടെ Anaconda packages manage ചെയ്യാനും upgrade ചെയ്യാനും `conda` എന്ന് വിളിക്കുന്ന ഒരു tool നൽകുന്നു.

മുഴുവൻ Anaconda distribution-നെയും ഒരുമിച്ച് update ചെയ്യുന്ന ഒരു `conda` command നിങ്ങൾ സ്ഥിരമായി execute ചെയ്യെണ്ടിയിരിക്കുന്നു.

ഒരു practice run ആയി, താഴെ പറയുന്നത് execute ചെയ്യുക

1. ഒരു terminal തുറക്കുക
1. `conda update conda` എന്ന് type ചെയ്യുക

`conda`-നെ കുറിച്ച് കൂടുതൽ അറിയാൻ, ഒരു terminal-ൽ `conda help` എന്ന് type ചെയ്താൽ മതി.

(ipython_notebook)=
## {index}`Jupyter Notebooks <single: Jupyter Notebooks>`

```{index} single: Python; IPython
```

```{index} single: IPython
```

```{index} single: Jupyter
```

 Python-ഉമായും scientific libraries-ഉമായും interact ചെയ്യാനുള്ള പല മാർഗങ്ങളിൽ ഒന്നാണ് [Jupyter](https://jupyter.org/) notebooks.

Jupyter notebook, Python-ഉമായി interact ചെയ്യാൻ ഒരു browser-based interface ഉപയോഗിക്കുന്നു. അതിൽ ഇവ സാധ്യമാണ്:

* Python commands എഴുതാനും execute ചെയ്യാനും സാധിക്കുന്നു.
* Tables, figures, animation തുടങ്ങിയവ browser-ൽ formatted output ആയി ലഭിക്കുന്നു.
* Formatted text-ഉം mathematical expressions-ഉം mix ചെയ്യാനുള്ള option ലഭിക്കുന്നു.

ഇങ്ങനെയുള്ള features ഉള്ളതുകൊണ്ട്, Jupyter ഇന്ന് scientific computing ecosystem-ൽ ഒരു പ്രധാന player ആയി മാറിയിരിക്കുന്നു.

താഴെയുള്ള image, ഒരു Jupyter notebook-ൽ കുറച്ച് code execute ചെയ്യുന്നത് കാണിക്കുന്നു (borrowed from [here](https://matplotlib.org/stable/gallery/statistics/hexbin_demo.html))

```{figure} /_static/lecture_specific/getting_started/jp_demo.png
:figclass: auto
```

Python-ൽ code ചെയ്യാനുള്ള ഏക മാർഗം Jupyter notebook അല്ല. എന്നാലും, താഴെ പറയുന്ന സന്ദർഭങ്ങളിൽ Jupyter notebook വളരെ ഉപകാരപ്രദമാണ്:

* Python-ൽ coding ആരംഭിക്കാൻ
* പുതിയ ideas പരീക്ഷിക്കാനും, ചെറിയ pieces of code-മായി interact ചെയ്യാനും
* [Google Colab](https://research.google.com/colaboratory/) പോലുള്ള powerful online interactive environments ഉപയോഗിക്കാൻ
* Students അല്ലെങ്കിൽ colleagues-മായി scientific ideas share ചെയ്യാനോ collaborate ചെയ്യാനോ

ഇനിയുള്ള lectures, Jupyter notebooks-ൽ execute ചെയ്യുന്നതിനായി design ചെയ്തിട്ടുള്ളതാണ്.

### Starting the Jupyter Notebook

```{index} single: Jupyter Notebook; Setup
```

Anaconda install ചെയ്തു കഴിഞ്ഞാൽ, നിങ്ങൾക്ക് Jupyter notebook start ചെയ്യാം.

ഒന്നുകിൽ 

* നിങ്ങളുടെ applications menu-വിൽ Jupyter എന്ന് search ചെയ്യുക, അല്ലെങ്കിൽ 
* ഒരു terminal തുറന്ന് `jupyter notebook` എന്ന് type ചെയ്യുക
    * Windows ഉപയോഗിക്കുന്നവർ മുകളിലെ വരിയിൽ "terminal" എന്നതിന് പകരം "Anaconda command prompt" എന്ന് വായിക്കുക.

നിങ്ങൾ രണ്ടാമത്തെ option ഉപയോഗിക്കുകയാണെങ്കിൽ, ഇതുപോലെ എന്തെങ്കിലും കാണാൻ സാധിക്കും

```{figure} /_static/lecture_specific/getting_started/starting_nb.png
:figclass: terminal
```

The output tells us the notebook is running at `http://localhost:8888/`

* `localhost` എന്നത് നിങ്ങളുടെ സ്വന്തം computer-ന്റെ പേരാണ് (local machine)
* `8888` എന്നത് നിങ്ങളുടെ computer-ലെ [port number](https://en.wikipedia.org/wiki/Port_%28computer_networking%29) 8888 ആണ്.

അതായതു, Jupyter kernel നമ്മുടെ local machine-ലെ port 8888-ൽ Python commands കേൾക്കാൻ തയ്യാറായി നിൽക്കുകയാണ്.

Hopefully, നിങ്ങളുടെ default browser-ലും ഇതുപോലെ ഒരു web page തുറന്നിട്ടുണ്ടാകും.

```{figure} /_static/lecture_specific/getting_started/nb.png
:figclass: auto
```

നിങ്ങൾ ഈ കാണുന്നതാണ് Jupyter *dashboard*.

മുകളിലെ URL നോക്കിയാൽ, അത് `localhost:8888` ആയിരിക്കണം.

ഇതുവരെ ഉള്ളത് ശരിയായി work ചെയ്‌തു എന്ന് കരുതുന്നു. ഇനി നിങ്ങൾ top right-ലെ `New` click ചെയ്ത്, അതിലെ `Python 3` അല്ലെങ്കിൽ similar ആയിട്ടുള്ളത് select ചെയ്യുക.

നമ്മുടെ machine-ൽ കാണുന്നത് ഇതാണ്:

```{figure} /_static/lecture_specific/getting_started/nb2.png
:figclass: auto
```

Notebook-ൽ ഒരു *active cell* കാണാൻ സാധിക്കും. അതിൽ നിങ്ങൾക്ക് Python commands type ചെയ്യാവുന്നതാണ്.

### Notebook Basics

```{index} single: Jupyter Notebook; Basics
```

Code എങ്ങനെ edit ചെയ്യാമെന്നും simple programs എങ്ങനെ run ചെയ്യാമെന്നും നമുക്ക് നോക്കാം.

#### Running Cells

തൊട്ടു മുകളിലത്തെ figure ശ്രദ്ധിച്ചാൽ കാണാം, ആ cell-ന് ചുറ്റും ഒരു green border ഉണ്ട്.

ഇതിനർത്ഥം ആ cell ഇപ്പോൾ *edit mode*-ൽ ആണ് എന്നാണ്.

ഈ mode-ൽ, നിങ്ങൾ എന്ത് type ചെയ്താലും അത് ഈ cell-ൽ കാണാം, കൂടെ ഒരു flashing cursor-ഉം.

നിങ്ങൾ code execute ചെയ്യാൻ ready ആണെങ്കിൽ, `Enter` press ചെയ്യുന്നതിന് പകരം `Shift-Enter` press ചെയ്യുക.

```{figure} /_static/lecture_specific/getting_started/nb3.png
:figclass: auto
```

```{note}
ഒരു cell-ൽ code run ചെയ്യാൻ, menu & button options കൂടി ഉണ്ട്. നിങ്ങൾ അത് സ്വന്തമായി explore ചെയ്തു കണ്ടെത്തുക.
```

#### Modal Editing

അടുത്തതായി നിങ്ങൾ മനസ്സിലാക്കേണ്ടത്, Jupyter notebook ഒരു *modal* editing system use ചെയ്യുന്നു എന്നതാണ്.

അതായതു, keyboard-ൽ type ചെയ്യുന്നതിന്റെ effect നിങ്ങൾക്കു കിട്ടുന്നത്, Jupyter notebook **ഏത് mode-ൽ ആണ് എന്നതിനെ depend ചെയ്യുന്നു**.

അങ്ങനെ ഉള്ള 2 modes ഉണ്ട്:

1. Edit mode
    * ഒരു cell-ന് ചുറ്റും green border-ഉം blinking cursor-ഉം കാണപ്പെടും
    * നിങ്ങൾ type ചെയ്യുന്നതെല്ലാം അതേപടി ആ cell-ൽ കാണാം

1. Command mode
    * ഇവിടെ, green border-ന് പകരം blue border കാണപ്പെടും
    * Keyboard-ൽ നിങ്ങൾ press ചെയ്യുന്ന ഓരോ Key-ഉം (Keystrokes), ഓരോ commands ആയി interpret ചെയ്യപ്പെടും --- for example, ഈ mode-ൽ നിങ്ങൾ `b` എന്ന് type ചെയ്താൽ, ഇപ്പോഴുള്ള cell-ന് താഴെ ഒരു പുതിയ cell add ചെയ്യപ്പെടും

Modes തമ്മിൽ എങ്ങനെ switch ചെയ്യാം:

* edit mode to command mode, hit the `Esc` key or `Ctrl-M`
* command mode to edit mode, hit `Enter` or click in a cell

Jupyter notebook-ന്റെ ഈ modal behavior, നിങ്ങൾക്കു ശീലമായി കഴിഞ്ഞാൽ, വളരെ efficient ആണ് എന്ന് മനസ്സിലാകും.

#### Inserting Unicode (e.g., Greek Letters)

Python [unicode](https://docs.python.org/3/howto/unicode.html) support ചെയ്യുന്നു. ആയതിനാൽ Python code-ൽ നിങ്ങൾക്കു $\alpha$, $\beta$ തുടങ്ങിയ characters, names ആയി ഉപയോഗിക്കാൻ പറ്റുന്നു.

ഒരു code cell-ൽ, `\alpha` എന്ന് type ചെയ്ത്, keyboard-ലെ tab key press ചെയ്ത് നോക്കുക.

(a_test_program)=
#### A Test Program

ഇനി നമുക്ക് ഒരു test program run ചെയ്‌തു നോകാം.

Here's an arbitrary program we can use: [https://matplotlib.org/stable/gallery/pie_and_polar_charts/polar_bar.html](https://matplotlib.org/stable/gallery/pie_and_polar_charts/polar_bar.html).

ആ page-ൽ നിങ്ങൾക്ക് താഴെ പറയുന്ന code കാണാം:

```{code-cell} ipython
import numpy as np
import matplotlib.pyplot as plt

# Fixing random state for reproducibility
np.random.seed(19680801)

# Compute pie slices
N = 20
θ = np.linspace(0.0, 2 * np.pi, N, endpoint=False)
radii = 10 * np.random.rand(N)
width = np.pi / 4 * np.random.rand(N)
colors = plt.cm.viridis(radii / 10.)

ax = plt.subplot(111, projection='polar')
ax.bar(θ, radii, width=width, bottom=0.0, color=colors, alpha=0.5)

plt.show()
```

ഇപ്പോൾ ഈ code-ന്റെ details-നെ പറ്റി worry ചെയ്യേണ്ട --- തൽകാലം ഈ code run ചെയ്യാം. എന്നിട്ടു എന്ത് സംഭവിക്കുന്നു എന്ന് നോക്കാം.

ഈ code run ചെയ്യാനുള്ള ഏറ്റവും എളുപ്പമുള്ള മാർഗം ഈ code copy ചെയ്ത്, notebook-ലെ ഒരു cell-ൽ paste ചെയ്യുക എന്നതാണ്.

നിങ്ങൾക്കും ഒരു similar plot കിട്ടി എന്ന് കരുതുന്നു.

### Working with the Notebook

Jupyter notebooks-ൽ work ചെയ്യുമ്പോൾ അറിഞ്ഞിരിക്കേണ്ട കുറച്ചു tips ഇതൊക്കെയാണ്:

#### Tab Completion

മുകളിലത്തെ program-ൽ നമ്മൾ `import numpy as np` എന്ന line execute ചെയ്തു.

* അതിൽ NumPy എന്നത് ഒരു numerical library ആണ്, അത് നമ്മൾ വിശദമായി പിന്നീട് പഠിക്കും.

ഈ import command-ന് ശേഷം, NumPy-ലെ functions `np.function_name` എന്ന syntax ഉപയോഗിച്ച് access ചെയ്യാവുന്നതാണ്.

* For example, try `np.random.randn(3)`.

`Tab` key ഉപയോഗിച്ച് `np`-യുടെ attributes explore ചെയ്യാവുന്നതാണ്.

For example, `np.random.r` എന്ന് type ചെയ്ത് `Tab` key press ചെയ്യുക.

```{figure} /_static/lecture_specific/getting_started/nb6.png
:figclass: auto
```

ഇങ്ങനെ നിങ്ങൾക്ക് choose ചെയ്യാൻ പറ്റുന്ന പല possible completions Jupyter notebook നൽകുന്നു.

ഇങ്ങനെ എന്തെലാം available ആണെന്ന് Tab key use ചെയ്‌തു നിങ്ങൾക്കു കണ്ടുപിടികാം. അതുകൂടാതെ Tab key നിങ്ങളുടെ typing കുറയ്ക്കാനും സഹായിക്കുന്നു.

(gs_help)=
#### On-Line Help

```{index} single: Jupyter Notebook; Help
```

നിങ്ങൾക്ക് `np.random.randn`-നെ പറ്റി കൂടുതൽ അറിയാൻ, `np.random.randn?` execute ചെയ്യാം.

Documentation, browser-ന്റെ ഒരു split window-ൽ ഇതുപോലെ നിങ്ങൾക്ക് കാണാം.

```{figure} /_static/lecture_specific/getting_started/nb6a.png
:figclass: auto
```

താഴത്തെ split-ന്റെ top right-ൽ click ചെയ്താൽ on-line help close ആകും.

ഇതുപോലെ documentation എങ്ങനെ create ചെയ്യാം എന്ന് നമ്മൾ {ref}`പിന്നീട് വിശദമായി പഠിക്കും <Docstrings>`!

#### Other Content

Code execute ചെയ്യുന്നതിന് പുറമേ, text, equations, figures, videos തുടങ്ങിയ പലതും, ഒരു page-ൽ embed ചെയ്യാൻ Jupyter notebook-ൽ സാധിക്കുന്നു.

For example, നമ്മൾക്കു code-ന് പകരം plain text-ഉം LaTeX-ഉം mix ചെയ്‌തു enter ചെയ്യാം.

ഇതിനായി നമ്മൾ `Esc` key enter ചെയ്യണം, കാരണം നമ്മൾ mode change ചെയ്‌തു command mode ആകണം. ഇനി `m` type ചെയ്യുക, എന്തിനെന്നാൽ നമ്മൾ [Markdown](https://daringfireball.net/projects/markdown/) എഴുതാൻ പോവുകയാണ് എന്ന് indicate ചെയ്യാൻ. [Markdown](https://daringfireball.net/projects/markdown/), LaTeX-നോട് similar ആയിട്ടുള്ള (പക്ഷേ അതിനേക്കാൾ simpler ആയ) ഒരു mark-up language ആണ്.

(നിങ്ങളുടെ mouse ഉപയോഗിച്ച്, `Code` drop-down list-ൽ നിന്നും `Markdown` select ചെയ്യാവുന്നതാണ്.)

```{figure} /_static/lecture_specific/getting_started/nb7.png
:figclass: auto
```

Markdown code complete ചെയ്താൽ, `Shift+Enter` press ചെയ്യുക.

```{figure} /_static/lecture_specific/getting_started/nb8.png
:figclass: auto
```

### Debugging Code

```{index} single: Jupyter Notebook; Debugging
```

ഒരു program-ലെ errors കണ്ടുപിടിച്ചു അതിനെ remove ചെയ്യുന്ന process ആണ് debugging.

Code debugging-നായി നിങ്ങൾ ധാരാളം സമയം spend ചെയ്യെണ്ടി വരും, അതിനാൽ അത് [എങ്ങനെ effectively ചെയ്യാം എന്ന് പഠിക്കേണ്ടത്](https://www.freecodecamp.org/news/what-is-debugging-how-to-debug-code/) വളരെ important ആണ്. 

നിങ്ങൾ Jupyter-ന്റെ ഒരു പുതിയ version ആണ് use ചെയുന്നതെങ്കിൽ, toolbar-ന്റെ right end-ൽ ഒരു bug icon കാണാം.

```{figure} /_static/lecture_specific/getting_started/debug.png
:scale: 50%
:figclass: auto
```

ആ bug icon-ൽ click ചെയ്താൽ Jupyter-ന്റെ debugger enable ആകും.

<!-- IDEA: This could be turned into a margin note once supported by quantecon-book-theme -->
```{note}
ഇതിനോടൊപ്പം നിങ്ങൾക്ക് Debugger Panel കൂടി തുറക്കേണ്ടി വന്നേക്കാം. (View -> Debugger Panel).
```

Debug ചെയ്യേണ്ട cell-ന്റെ line number-ൽ click ചെയ്ത് breakpoints set ചെയ്യാവുന്നതാണ്. 

Cell run ചെയ്യുമ്പോൾ, debugger, breakpoint-ൽ stop ചെയ്യും.

CALLSTACK (located in the right hand window) toolbar-ലെ "Next" button ഉപയോഗിച്ച് code-ന്റെ ഓരോ line-ഉം നിങ്ങൾക്ക് check ചെയ്യാം.

<!-- IDEA: add a red square around the area of interest in the image -->
```{figure} /_static/lecture_specific/getting_started/debugger_breakpoint.png
:figclass: auto
```

Debugger-ന്റെ functionality-യെ പറ്റി നിങ്ങൾക്ക് കൂടുതൽ അറിയണമെങ്കിൽ [Jupyter documentation](https://jupyterlab.readthedocs.io/en/latest/user/debugger.html) explore ചെയ്യാവുന്നതാണ്.

### Sharing Notebooks

```{index} single: Jupyter Notebook; Sharing
```

```{index} single: Jupyter Notebook; nbviewer
```

Notebook files വെറും text files മാത്രമാണ്. They are structured in [JSON](https://en.wikipedia.org/wiki/JSON). They typically end with `.ipynb`.

മറ്റേതൊരു file-ഉം share ചെയ്യുന്ന രീതിയിൽ നിങ്ങൾക്ക് Notebook files-ഉം share ചെയ്യാം. അല്ലെങ്കിൽ [nbviewer](https://nbviewer.org/) പോലുള്ള web services ഉപയോഗികാം.

ആ site-ൽ നിങ്ങൾ കാണുന്ന notebooks, **static** html representations മാത്രമാണ്.

ഏതെങ്കിലും ഒരു Notebook run ചെയ്യാൻ, top right-ലെ download icon-ൽ click ചെയ്ത് അതിനെ ഒരു `ipynb` file ആയി download ചെയ്യുക.

അതിനെ ഒരിടത്തു save ചെയ്യുക, എന്നിട്ടു Jupyter dashboard-ൽ നിന്ന് അതിലേക്ക് navigate ചെയ്ത്, മുകളിൽ discuss ചെയ്ത പോലെ run ചെയ്യുക.

```{note}
Interactive content അടങ്ങിയ notebooks share ചെയ്യാൻ നിങ്ങൾക്ക് താൽപ്പര്യമുണ്ടെങ്കിൽ [Binder](https://mybinder.org/) explore ചെയ്യാവുന്നതാണ്.

Notebooks-ൽ മറ്റുള്ളവരുമായി collaborate ചെയ്യാൻ താൽപ്പര്യമുണ്ടെങ്കിൽ, താഴെ പറയുന്നവ use ചെയ്യാം

- [Google Colab](https://colab.research.google.com/)
- [Kaggle](https://www.kaggle.com/code)

Code private ആയി വെകാനും, നിങ്ങൾക്ക് familiar ആയിട്ടുള്ള JupyterLab and Notebook interface-ൽ തന്നെ നിങ്ങൾക്ക് collaborate-ഉം ചെയ്യണമെങ്കിൽ, [JupyterLab Real-Time Collaboration extension](https://jupyterlab-realtime-collaboration.readthedocs.io/en/latest/) explore ചെയ്യാവുന്നതാണ്.
```

### QuantEcon Notes

Economics-മായി ബന്ധപ്പെട്ട Jupyter notebooks share ചെയ്യാനായി QuantEcon-ന് സ്വന്തമായി ഒരു site ഉണ്ട് -- [QuantEcon Notes](http://notes.quantecon.org/).

QuantEcon Notes-ലേക്ക് submit ചെയ്യുന്ന notebooks, ഒരു link വഴി share ചെയ്യാവുന്നതാണ്, കൂടാതെ community-യുടെ comments-നും votes-നും തുറന്നിരിക്കുന്നു.

## Installing Libraries

(gs_qe)=
```{index} single: QuantEcon
```

നമുക്ക് ആവശ്യമായ മിക്ക libraries-ഉം Anaconda-യിൽ തന്നെ ഉണ്ട്.

മറ്റ് libraries `pip` അല്ലെങ്കിൽ `conda` ഉപയോഗിച്ച് install ചെയ്യാവുന്നതാണ്.

നമ്മൾ ഉപയോഗിക്കാൻ പോകുന്ന അങ്ങനത്തെ ഒരു library ആണ് [QuantEcon.py](https://quantecon.org/quantecon-py/).

(gs_install_qe)=
നിങ്ങൾക്ക് [QuantEcon.py](https://quantecon.org/quantecon-py/) 2 രീതിയിൽ install ചെയ്യാം. ഒന്നുകിൽ
Jupyter start ചെയ്‌തു, താഴെ പറയുന്ന code ഒരു cell-ൽ type ചെയ്യുക:

```{code-block} ipython3
:class: no-execute

!conda install quantecon
```

അല്ലെങ്കിൽ, terminal open ചെയ്‌തു, അതിലേക്കു താഴെ പറയുന്ന code type ചെയ്യുക

```{code-block} bash
:class: no-execute

conda install quantecon
```

[QuantEcon.py](https://quantecon.org/quantecon-py/)-നെ പറ്റിയുള്ള കൂടുതൽ instructions [library page](https://quantecon.org/quantecon-py/)-ൽ കാണാം.

Latest version-ലേക്ക് upgrade ചെയ്യാൻ — അത് നിങ്ങൾ പതിവായി ചെയ്യണം — താഴെ പറയുന്ന code ഉപയോഗിക്കുക

```{code-block} bash
:class: no-execute

conda upgrade quantecon
```

നമ്മൾ use ചെയ്യാൻ പോകുന്ന മറ്റൊരു library ആണ് [interpolation.py](https://github.com/EconForge/interpolation.py).

അത് install ചെയ്യാനായി, താഴെ പറയുന്ന code Jupyter-ൽ type ചെയ്യുക.

```{code-block} ipython3
:class: no-execute

!conda install -c conda-forge interpolation
```

## Working with Python Files

ഇതുവരെ നമ്മൾ focus ചെയ്തത്, ഒരു Jupyter notebook cell-ൽ enter ചെയ്ത Python code execute ചെയ്യുന്നതിനെ പറ്റിയാണ്.

എന്നാൽ മിക്ക Python code-ഉം ഒരു different രീതിയിലാണ് run ചെയ്യുന്നത്.

ആദ്യമേ നിങ്ങളുടെ code, local machine-ൽ ഒരു text file ആയി save ചെയ്യണം.

നിലവിലുള്ള convention പ്രകാരം, ഈ text files-ന് ഒരു `.py` extension ഉണ്ടായിരിക്കും.

ഇത്തരം ഒരു file-ന്റെ ഒരു example താഴെ പറയുന്ന രീതിയിൽ create ചെയ്യാവുന്നതാണ്:

```{code-cell} ipython
%%writefile foo.py

print("foobar")
```

മുകളിലത്തെ code ഉപയോഗിച്ച് `print("foobar")` എന്ന line, local directory-ലെ `foo.py` എന്ന് പേരുള്ള ഒരു file-ലേക്ക് write ചെയ്യുന്നു.

ഇവിടെ `%%writefile` എന്നത് [cell magic](https://ipython.readthedocs.io/en/stable/interactive/magics.html#cell-magics)-ന്റെ ഒരു example ആണ്.

### Editing and Execution

`*.py` file-ൽ save ചെയ്ത ഒരു code നിങ്ങൾക്ക് കിട്ടിയാൽ, 2 ചോദ്യങ്ങൾ നിങ്ങൾ consider ചെയ്യണം:

1. ആ code എങ്ങനെ execute ചെയ്യാം?
1. ആ code എങ്ങനെ modify / edit ചെയ്യാം?

#### Option 1: {index}`JupyterLab <single: JupyterLab>`

```{index} single: JupyterLab
```

 Jupyter notebooks-ന് മുകളിൽ build ചെയ്തിരിക്കുന്ന ഒരു integrated development environment ആണ് [JupyterLab](https://github.com/jupyterlab/jupyterlab).

JupyterLab ഉപയോഗിച്ച് നിങ്ങൾക്ക് `*.py` files-ഉം, Jupyter notebooks-ഉം edit ചെയ്യാനും, run ചെയ്യാനും സാധിക്കും.

JupyterLab start ചെയ്യാൻ, applications menu-ൽ അത് search ചെയ്യുക, അല്ലെങ്കിൽ ഒരു terminal-ൽ `jupyter-lab` എന്ന് type ചെയ്യുക.

ഇപ്പോൾ നിങ്ങൾക്ക് മുകളിൽ create ചെയ്ത `foo.py` file JupyterLab-ൽ open ചെയ്യാനും, edit ചെയ്യാനും, run ചെയ്യാനും സാധിക്കും.

JupyterLab-നെ പറ്റി കൂടുതൽ അറിയാൻ, ഒന്നുകിൽ അതിന്റെ docs വായിക്കുക അല്ലെങ്കിൽ recent YouTube videos search ചെയ്തു നോക്കുക.

#### Option 2: Using a Text Editor

ഒരു text editor ഉപയോഗിച്ചും നിങ്ങൾക്ക് files edit ചെയ്യാൻ സാധിക്കും. അങ്ങനെ files edit ചെയ്ത ശേഷം നിങ്ങൾക്ക് Jupyter notebook-ൽ നിന്നും അത് run ചെയ്യാം.

ഒരു text editor എന്നത് text files കൈകാര്യം ചെയ്യാൻ വേണ്ടി design ചെയ്തിരിക്കുന്ന ഒരു application ആണ് --- text files such as Python programs.

ഒരു program text-മായി work ചെയ്യുമ്പോൾ, powerful-ഉം efficient-ഉം ആയ ഒരു text editor അത്യാവശ്യമാണ്.

ഒരു നല്ല text editor ഇവ provide ചെയ്യും:

* efficient text editing commands (e.g., copy, paste, search and replace)
* syntax highlighting, etc.

ഇപ്പോൾ, coding-നായി ഏറ്റവും popular ആയിട്ടുള്ള text editor ആണ് [VS Code](https://code.visualstudio.com/).

VS Code ഉപയോഗിക്കാൻ എളുപ്പമാണ്, കൂടാതെ അതിന് നിരവധി high quality extensions-ഉം ഉണ്ട്.

അതല്ല, നിങ്ങൾക്ക് മറ്റൊരു മികച്ച free text editor ആവശ്യമുണ്ടെങ്കിൽ, [Vim](https://www.vim.org/) try ചെയ്യാവുന്നത്. Vim, VS Code പോലെ അത്ര എളുപ്പമല്ല!

## Exercises

```{exercise-start}
:label: gs_ex1
```

Jupyter notebook ഇപ്പോഴും run ചെയ്യുകയാണെങ്കിൽ, അത് start ചെയ്ത terminal-ൽ പോയി, `Ctrl-C` press ചെയ്‌തു quit ചെയ്യുക. 

ഇനി വീണ്ടും Jupyter notebook launch ചെയ്യുക, പക്ഷെ ഇത്തവണ terminal-ൽ `jupyter notebook --no-browser`എന്ന് type ചെയ്യുക.

ഇങ്ങനെ ചെയ്യുമ്പോൾ browser launch ചെയ്യാതെ kernel start ചെയ്യും.

Startup message-ഉം ശ്രദ്ധിക്കുക: അത് notebook run ചെയ്യുന്ന URL തരും such as `http://localhost:8888`.

ഇനി,

1. നിങ്ങളുടെ browser start ചെയ്യുക --- അതല്ല browser already run ചെയ്യുകയാണെങ്കിൽ പുതിയ ഒരു tab open ചെയ്യുക.
1. എന്നിട്ടു, മുകളിലത്തെ URL (e.g. `http://localhost:8888`) address bar-ൽ enter ചെയ്യുക.

ഇപ്പോൾ നിങ്ങൾക്ക് ഒരു standard Jupyter notebook session run ചെയ്യാൻ സാധിക്കും. 

ഇത് Jupyter notebook start ചെയ്യാനുള്ള മറ്റൊരു മാർഗമാണ്.

Webpage അബദ്ധത്തിൽ close ചെയ്താലും, kernel run ചെയ്യുന്നിടത്തോളം കാലം, ഇത് work ആകും.

```{exercise-end}
```
