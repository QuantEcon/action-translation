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
  title: Getting Started
  headings:
    Overview: Overview
    Python in the Cloud: Python in the Cloud
    Local Install: Local Install
    Local Install::The Anaconda Distribution: The Anaconda Distribution
    Local Install::Installing Anaconda: Installing Anaconda
    Local Install::Updating `conda`: Updating `conda`
    Jupyter Notebooks: Jupyter Notebooks
    Jupyter Notebooks::Starting the Jupyter Notebook: Starting the Jupyter Notebook
    Jupyter Notebooks::Notebook Basics: Notebook Basics
    Jupyter Notebooks::Notebook Basics::Running Cells: Running Cells
    Jupyter Notebooks::Notebook Basics::Modal Editing: Modal Editing
    Jupyter Notebooks::Notebook Basics::Inserting Unicode (e.g., Greek Letters): Inserting Unicode (e.g., Greek Letters)
    Jupyter Notebooks::Notebook Basics::A Test Program: A Test Program
    Jupyter Notebooks::Working with the Notebook: Working with the Notebook
    Jupyter Notebooks::Working with the Notebook::Tab Completion: Tab Completion
    Jupyter Notebooks::Working with the Notebook::On-Line Help: On-Line Help
    Jupyter Notebooks::Working with the Notebook::Other Content: Other Content
    Jupyter Notebooks::Debugging Code: Debugging Code
    Jupyter Notebooks::Sharing Notebooks: Sharing Notebooks
    Jupyter Notebooks::QuantEcon Notes: QuantEcon Notes
    Installing Libraries: Installing Libraries
    Working with Python Files: Working with Python Files
    Working with Python Files::Editing and Execution: Editing and Execution
    'Working with Python Files::Editing and Execution::Option 1: JupyterLab': 'Option 1: JupyterLab'
    'Working with Python Files::Editing and Execution::Option 2: Using a Text Editor': 'Option 2: Using a Text Editor'
    Exercises: Exercises
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

ഈ lecture-ൽ, നിങ്ങൾ ഇവ പഠിക്കും

1. cloud-ൽ Python use ചെയ്യാൻ
1. ഒരു local Python environment set ചെയ്ത് run ചെയ്യാൻ
1. simple Python commands execute ചെയ്യാൻ
1. ഒരു sample program run ചെയ്യാൻ
1. ഈ lectures-ന്റെ അടിസ്ഥാനമായ code libraries install ചെയ്യാൻ

## Python in the Cloud

Python-ൽ coding തുടങ്ങാനുള്ള ഏറ്റവും easy വഴി അത് cloud-ൽ run ചെയ്യുക എന്നതാണ്.

(അതായത്, Python already install ചെയ്തിട്ടുള്ള ഒരു remote server use ചെയ്തുകൊണ്ട്.)

Free-ഉം reliable-ഉം ആയ ഒരു option ആണ് [Google Colab](https://colab.research.google.com/).

Colab-ന് GPUs provide ചെയ്യുന്നു എന്ന advantage-ഉം ഉണ്ട്, കൂടുതൽ advanced lectures-ൽ നമ്മൾ അവ use ചെയ്യും.

Google Colab എങ്ങനെ തുടങ്ങാം എന്നതിനെക്കുറിച്ചുള്ള tutorials web-ഉം video-ഉം searches വഴി കണ്ടെത്താം.

നമ്മുടെ മിക്ക lectures-ലും മുകളിൽ വലതുഭാഗത്ത് ഒരു "Launch notebook" button (ഒരു play icon-നോടു കൂടി) ഉണ്ട്, അത് നിങ്ങളെ Colab-ലെ ഒരു executable version-മായി connect ചെയ്യുന്നു.


## Local Install

നിങ്ങൾക്ക് suitable ആയ ഒരു machine ലഭ്യമാണെങ്കിൽ, കൂടാതെ substantial ആയ അളവിൽ Python programming ചെയ്യാൻ plan ചെയ്യുന്നുവെങ്കിൽ, local installs ആണ് preferable.

അതേസമയം, Colab പോലുള്ള ഒരു cloud option-നെക്കാൾ കൂടുതൽ work local installs-ന് ആവശ്യമാണ്.

ഈ lecture-ന്റെ ബാക്കി ഭാഗം local installs-മായി ബന്ധപ്പെട്ട ചില details-ലൂടെ നിങ്ങളെ കൊണ്ടുപോകുന്നു.


### The Anaconda Distribution

[core Python package](https://www.python.org/downloads/) install ചെയ്യാൻ easy ആണ്, പക്ഷേ ഈ lectures-ന് നിങ്ങൾ choose ചെയ്യേണ്ടത് അതല്ല.

ഈ lectures-ന് മുഴുവൻ scientific programming ecosystem-ഉം ആവശ്യമാണ്, അത്

* core installation provide ചെയ്യുന്നില്ല
* ഓരോന്നായി install ചെയ്യാൻ painful ആണ്.

അതുകൊണ്ട് നമ്മുടെ purposes-ന് ഏറ്റവും best approach ഇവ അടങ്ങിയ ഒരു Python distribution install ചെയ്യുക എന്നതാണ്

1. core Python language **കൂടാതെ**
1. ഏറ്റവും popular ആയ scientific libraries-ന്റെ compatible versions.

അത്തരത്തിലുള്ള ഏറ്റവും best distribution ആണ് [Anaconda Python](https://www.anaconda.com/).

Anaconda

* വളരെ popular ആണ്
* cross-platform ആണ്
* comprehensive ആണ്
* [അതേ പേരിലുള്ള Nicki Minaj song-മായി](https://www.youtube.com/watch?v=LDZX4ooRsWs) പൂർണ്ണമായും ബന്ധമില്ലാത്തതാണ്

നിങ്ങളുടെ code libraries organize ചെയ്യാൻ ഒരു package management system-ഉം Anaconda-യോടൊപ്പം വരുന്നു.

**താഴെ വരുന്നതെല്ലാം നിങ്ങൾ ഈ recommendation സ്വീകരിക്കുന്നു എന്ന് assume ചെയ്യുന്നു!**

(install_anaconda)=
### Installing Anaconda

```{index} single: Python; Anaconda
```

Anaconda install ചെയ്യാൻ, binary [download](https://www.anaconda.com/download) ചെയ്ത് instructions follow ചെയ്യുക.

Important points:

* നിങ്ങളുടെ OS-ന് correct version തന്നെ install ചെയ്യുന്നു എന്ന് ഉറപ്പാക്കുക.
* Installation process-നിടയിൽ Anaconda നിങ്ങളുടെ default Python installation ആക്കണോ എന്ന് ചോദിച്ചാൽ, yes എന്ന് പറയുക.

### Updating `conda`

നിങ്ങളുടെ Anaconda packages manage ചെയ്യാനും upgrade ചെയ്യാനും `conda` എന്ന ഒരു tool Anaconda supply ചെയ്യുന്നു.

നിങ്ങൾ regularly execute ചെയ്യേണ്ട ഒരു `conda` command മുഴുവൻ Anaconda distribution-ഉം update ചെയ്യുന്നതാണ്.

ഒരു practice run ആയി, ദയവായി ഇനി പറയുന്നത് execute ചെയ്യുക

1. ഒരു terminal open ചെയ്യുക
1. `conda update conda` എന്ന് type ചെയ്യുക

conda-യെക്കുറിച്ചുള്ള കൂടുതൽ information-ന്, ഒരു terminal-ൽ conda help എന്ന് type ചെയ്യുക.

(ipython_notebook)=
## {index}`Jupyter Notebooks <single: Jupyter Notebooks>`

```{index} single: Python; IPython
```

```{index} single: IPython
```

```{index} single: Jupyter
```

Python-ഉം scientific libraries-ഉം ആയി interact ചെയ്യാനുള്ള പല സാധ്യമായ വഴികളിൽ ഒന്നാണ് [Jupyter](https://jupyter.org/) notebooks.

അവ Python-ലേക്ക് ഒരു *browser-based* interface use ചെയ്യുന്നു, ഇവയോടൊപ്പം

* Python commands write ചെയ്യാനും execute ചെയ്യാനുമുള്ള ability.
* Browser-ൽ formatted output, tables, figures, animation മുതലായവ ഉൾപ്പെടെ.
* Formatted text-ഉം mathematical expressions-ഉം mix ചെയ്യാനുള്ള option.

ഈ features കാരണം, Jupyter ഇപ്പോൾ scientific computing ecosystem-ലെ ഒരു major player ആണ്.

Ohne Jupyter notebook-ൽ ചില code ([ഇവിടെ നിന്ന്](https://matplotlib.org/stable/gallery/statistics/hexbin_demo.html) കടമെടുത്തത്) execute ചെയ്യുന്നത് കാണിക്കുന്ന ഒരു image ഇതാ

```{figure} /_static/lecture_specific/getting_started/jp_demo.png
:figclass: auto
```

Python-ൽ code ചെയ്യാനുള്ള ഒരേയൊരു വഴി Jupyter അല്ലെങ്കിലും, നിങ്ങൾ ഇവ ആഗ്രഹിക്കുമ്പോൾ അത് great ആണ്

* Python-ൽ coding തുടങ്ങാൻ
* പുതിയ ideas test ചെയ്യാനോ ചെറിയ code pieces-മായി interact ചെയ്യാനോ
* [Google Colab](https://research.google.com/colaboratory/) പോലുള്ള powerful online interactive environments use ചെയ്യാൻ
* students-മായോ colleagues-മായോ scientific ideas share ചെയ്യാനോ collaborate ചെയ്യാനോ

ഈ lectures Jupyter notebooks-ൽ execute ചെയ്യാൻ design ചെയ്തിരിക്കുന്നു.

### Starting the Jupyter Notebook

```{index} single: Jupyter Notebook; Setup
```

Anaconda install ചെയ്തുകഴിഞ്ഞാൽ, നിങ്ങൾക്ക് Jupyter notebook start ചെയ്യാം.

ഒന്നുകിൽ

* നിങ്ങളുടെ applications menu-ൽ Jupyter search ചെയ്യുക, അല്ലെങ്കിൽ
* ഒരു terminal open ചെയ്ത് `jupyter notebook` എന്ന് type ചെയ്യുക
    * Windows users മുൻപത്തെ വരിയിലെ "terminal" എന്നതിന് പകരം "Anaconda command prompt" substitute ചെയ്യണം.

നിങ്ങൾ രണ്ടാമത്തെ option use ചെയ്താൽ, ഇതുപോലെ എന്തെങ്കിലും കാണാം

```{figure} /_static/lecture_specific/getting_started/starting_nb.png
:figclass: terminal
```

Notebook `http://localhost:8888/`-ൽ run ചെയ്യുന്നു എന്ന് output നമ്മോട് പറയുന്നു

* `localhost` എന്നത് local machine-ന്റെ പേരാണ്
* `8888` നിങ്ങളുടെ computer-ലെ [port number](https://en.wikipedia.org/wiki/Port_%28computer_networking%29) 8888-നെ സൂചിപ്പിക്കുന്നു

അങ്ങനെ, Jupyter kernel നമ്മുടെ local machine-ന്റെ port 8888-ൽ Python commands-നായി listen ചെയ്യുന്നു.

Hopefully, നിങ്ങളുടെ default browser-ഉം ഇതുപോലെ കാണപ്പെടുന്ന ഒരു web page-ഓടെ open ആയിട്ടുണ്ടാകും

```{figure} /_static/lecture_specific/getting_started/nb.png
:figclass: auto
```

ഇവിടെ നിങ്ങൾ കാണുന്നതിനെ Jupyter *dashboard* എന്ന് വിളിക്കുന്നു.

മുകളിലുള്ള URL നോക്കിയാൽ, അത് `localhost:8888` അല്ലെങ്കിൽ സമാനമായത് ആയിരിക്കണം, മുകളിലെ message-മായി match ചെയ്യുന്നത്.

ഇതെല്ലാം OK ആയി work ചെയ്തു എന്ന് assume ചെയ്ത്, നിങ്ങൾക്ക് ഇപ്പോൾ മുകളിൽ വലതുഭാഗത്തുള്ള `New` click ചെയ്ത് `Python 3` അല്ലെങ്കിൽ സമാനമായത് select ചെയ്യാം.

നമ്മുടെ machine-ൽ കാണിക്കുന്നത് ഇതാണ്:

```{figure} /_static/lecture_specific/getting_started/nb2.png
:figclass: auto
```

Notebook ഒരു *active cell* display ചെയ്യുന്നു, അതിലേക്ക് നിങ്ങൾക്ക് Python commands type ചെയ്യാം.

### Notebook Basics

```{index} single: Jupyter Notebook; Basics
```

Code എങ്ങനെ edit ചെയ്യാം, simple programs എങ്ങനെ run ചെയ്യാം എന്നതിൽ നിന്ന് തുടങ്ങാം.

#### Running Cells

മുൻപത്തെ figure-ൽ, cell-ന് ചുറ്റും ഒരു green border ഉള്ളത് ശ്രദ്ധിക്കുക.

ഇതിനർത്ഥം cell *edit mode*-ൽ ആണ് എന്നാണ്.

ഈ mode-ൽ, നിങ്ങൾ type ചെയ്യുന്നതെന്തും flashing cursor-നോടൊപ്പം cell-ൽ appear ചെയ്യും.

ഒരു cell-ലെ code execute ചെയ്യാൻ ready ആകുമ്പോൾ, സാധാരണ `Enter`-ന് പകരം `Shift-Enter` press ചെയ്യുക.

```{figure} /_static/lecture_specific/getting_started/nb3.png
:figclass: auto
```

```{note}
ഒരു cell-ലെ code run ചെയ്യാൻ menu-ഉം button options-ഉം ഉണ്ട്, explore ചെയ്ത് അവ കണ്ടെത്താം.
```

#### Modal Editing

Jupyter notebook-നെക്കുറിച്ച് അടുത്തതായി മനസ്സിലാക്കേണ്ടത് അത് ഒരു *modal* editing system use ചെയ്യുന്നു എന്നതാണ്.

ഇതിനർത്ഥം keyboard-ൽ type ചെയ്യുന്നതിന്റെ effect **നിങ്ങൾ ഏത് mode-ൽ ആണ് എന്നതിനെ ആശ്രയിച്ചിരിക്കുന്നു** എന്നാണ്.

രണ്ട് modes ഇവയാണ്

1. Edit mode
    * ഒരു cell-ന് ചുറ്റുമുള്ള a green border-ഉം a blinking cursor-ഉം കൊണ്ട് സൂചിപ്പിക്കുന്നു
    * നിങ്ങൾ type ചെയ്യുന്നതെന്തും ആ cell-ൽ അതേപടി appear ചെയ്യുന്നു

1. Command mode
    * green border-ന് പകരം ഒരു blue border വരുന്നു
    * Keystrokes commands ആയി interpret ചെയ്യുന്നു --- ഉദാഹരണത്തിന്, `b` type ചെയ്താൽ current cell-ന് താഴെ ഒരു പുതിയ cell add ചെയ്യുന്നു

മാറാൻ

* edit mode-ൽ നിന്ന് command mode-ലേക്ക്, `Esc` key അല്ലെങ്കിൽ `Ctrl-M` press ചെയ്യുക
* command mode-ൽ നിന്ന് edit mode-ലേക്ക്, `Enter` press ചെയ്യുക അല്ലെങ്കിൽ ഒരു cell-ൽ click ചെയ്യുക

Jupyter notebook-ന്റെ modal behavior ശീലമായിക്കഴിഞ്ഞാൽ വളരെ efficient ആണ്.

#### Inserting Unicode (e.g., Greek Letters)

Python [unicode](https://docs.python.org/3/howto/unicode.html) support ചെയ്യുന്നു, ഇത് നിങ്ങളുടെ code-ൽ $\alpha$, $\beta$ പോലുള്ള characters names ആയി use ചെയ്യാൻ allow ചെയ്യുന്നു.

ഒരു code cell-ൽ, `\alpha` type ചെയ്ത് നിങ്ങളുടെ keyboard-ലെ tab key press ചെയ്ത് നോക്കുക.

(a_test_program)=
#### A Test Program

നമുക്ക് ഒരു test program run ചെയ്യാം.

നമുക്ക് use ചെയ്യാവുന്ന ഒരു arbitrary program ഇതാ: [https://matplotlib.org/stable/gallery/pie_and_polar_charts/polar_bar.html](https://matplotlib.org/stable/gallery/pie_and_polar_charts/polar_bar.html).

ആ page-ൽ, നിങ്ങൾക്ക് ഇനി പറയുന്ന code കാണാം

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

ഇപ്പോൾ details-നെക്കുറിച്ച് worry ചെയ്യേണ്ട --- നമുക്ക് അത് run ചെയ്ത് എന്ത് സംഭവിക്കുന്നു എന്ന് നോക്കാം.

ഈ code run ചെയ്യാനുള്ള ഏറ്റവും easy വഴി അത് copy ചെയ്ത് notebook-ലെ ഒരു cell-ലേക്ക് paste ചെയ്യുക എന്നതാണ്.

Hopefully നിങ്ങൾക്ക് സമാനമായ ഒരു plot ലഭിക്കും.

### Working with the Notebook

Jupyter notebooks-മായി work ചെയ്യുന്നതിനെക്കുറിച്ചുള്ള കുറച്ചു tips കൂടി ഇതാ.

#### Tab Completion

മുൻപത്തെ program-ൽ, നമ്മൾ `import numpy as np` എന്ന line execute ചെയ്തു

* NumPy എന്നത് നമ്മൾ ആഴത്തിൽ work ചെയ്യാൻ പോകുന്ന ഒരു numerical library ആണ്.

ഈ import command-ന് ശേഷം, NumPy-യിലെ functions `np.function_name` type syntax use ചെയ്ത് access ചെയ്യാം.

* For example, try `np.random.randn(3)`.

`Tab` key use ചെയ്ത് നമുക്ക് `np`-യുടെ ഈ attributes explore ചെയ്യാം.

ഉദാഹരണത്തിന്, ഇവിടെ നമ്മൾ `np.random.r` type ചെയ്ത് Tab press ചെയ്യുന്നു

```{figure} /_static/lecture_specific/getting_started/nb6.png
:figclass: auto
```

നിങ്ങൾക്ക് choose ചെയ്യാൻ Jupyter പല സാധ്യമായ completions offer ചെയ്യുന്നു.

ഈ രീതിയിൽ, Tab key എന്തൊക്കെ available ആണ് എന്ന് ഓർമ്മിപ്പിക്കാൻ സഹായിക്കുന്നു, കൂടാതെ typing ലാഭിക്കുകയും ചെയ്യുന്നു.

(gs_help)=
#### On-Line Help

```{index} single: Jupyter Notebook; Help
```

`np.random.randn`-നെക്കുറിച്ച് help ലഭിക്കാൻ, നമുക്ക് `np.random.randn?` execute ചെയ്യാം.

Documentation browser-ന്റെ ഒരു split window-ൽ appear ചെയ്യുന്നു, ഇതുപോലെ

```{figure} /_static/lecture_specific/getting_started/nb6a.png
:figclass: auto
```

താഴത്തെ split-ന്റെ മുകളിൽ വലതുഭാഗത്ത് click ചെയ്താൽ on-line help close ആകും.

ഇതുപോലുള്ള documentation എങ്ങനെ create ചെയ്യാം എന്ന് നമ്മൾ {ref}`പിന്നീട് <Docstrings>` കൂടുതൽ പഠിക്കും!

#### Other Content

Code execute ചെയ്യുന്നതിന് പുറമേ, Jupyter notebook page-ൽ text, equations, figures, videos പോലും embed ചെയ്യാൻ allow ചെയ്യുന്നു.

ഉദാഹരണത്തിന്, code-ന് പകരം നമുക്ക് plain text-ഉം LaTeX-ഉം ചേർന്ന ഒരു mixture enter ചെയ്യാം.

അടുത്തതായി നമ്മൾ command mode-ലേക്ക് enter ചെയ്യാൻ `Esc` press ചെയ്യുന്നു, തുടർന്ന് നമ്മൾ [Markdown](https://daringfireball.net/projects/markdown/) — LaTeX-നോട് സമാനമായ (പക്ഷേ അതിനെക്കാൾ simpler ആയ) ഒരു mark-up language — write ചെയ്യുകയാണെന്ന് സൂചിപ്പിക്കാൻ `m` type ചെയ്യുന്നു.

(menu items-ന്റെ list-ന് തൊട്ടു താഴെയുള്ള `Code` drop-down box-ൽ നിന്ന് `Markdown` select ചെയ്യാൻ നിങ്ങളുടെ mouse-ഉം use ചെയ്യാം)

```{figure} /_static/lecture_specific/getting_started/nb7.png
:figclass: auto
```

ഇനി ഇത് produce ചെയ്യാൻ നമ്മൾ `Shift+Enter` press ചെയ്യുന്നു

```{figure} /_static/lecture_specific/getting_started/nb8.png
:figclass: auto
```

### Debugging Code

```{index} single: Jupyter Notebook; Debugging
```

ഒരു program-ൽ നിന്ന് errors identify ചെയ്ത് remove ചെയ്യുന്ന process ആണ് debugging.

നിങ്ങൾ code debug ചെയ്യാൻ ഒരുപാട് സമയം ചെലവഴിക്കും, അതുകൊണ്ട് [അത് effectively എങ്ങനെ ചെയ്യാമെന്ന് പഠിക്കുന്നത്](https://www.freecodecamp.org/news/what-is-debugging-how-to-debug-code/) important ആണ്.

നിങ്ങൾ Jupyter-ന്റെ ഒരു newer version use ചെയ്യുകയാണെങ്കിൽ, toolbar-ന്റെ വലതുവശത്ത് ഒരു bug icon കാണാം.

```{figure} /_static/lecture_specific/getting_started/debug.png
:scale: 50%
:figclass: auto
```

ഈ icon click ചെയ്താൽ Jupyter debugger enable ആകും.

<!-- IDEA: This could be turned into a margin note once supported by quantecon-book-theme -->
```{note}
നിങ്ങൾക്ക് Debugger Panel (View -> Debugger Panel) open ചെയ്യേണ്ടി വന്നേക്കാം.
```

നിങ്ങൾ debug ചെയ്യാൻ ആഗ്രഹിക്കുന്ന cell-ന്റെ line number-ൽ click ചെയ്ത് breakpoints set ചെയ്യാം.

നിങ്ങൾ cell run ചെയ്യുമ്പോൾ, debugger breakpoint-ൽ stop ചെയ്യും.

തുടർന്ന് CALLSTACK toolbar-ലെ (വലതുവശത്തെ window-ൽ സ്ഥിതിചെയ്യുന്നത്) "Next" button-ലെ buttons use ചെയ്ത് നിങ്ങൾക്ക് code-ലൂടെ line by line step ചെയ്യാം.

<!-- IDEA: add a red square around the area of interest in the image -->
```{figure} /_static/lecture_specific/getting_started/debugger_breakpoint.png
:figclass: auto
```

Debugger-ന്റെ കൂടുതൽ functionality [Jupyter documentation](https://jupyterlab.readthedocs.io/en/latest/user/debugger.html)-ൽ explore ചെയ്യാം.

### Sharing Notebooks

```{index} single: Jupyter Notebook; Sharing
```

```{index} single: Jupyter Notebook; nbviewer
```

Notebook files എന്നത് [JSON](https://en.wikipedia.org/wiki/JSON)-ൽ structure ചെയ്ത, സാധാരണയായി `.ipynb`-ൽ അവസാനിക്കുന്ന text files മാത്രമാണ്.

നിങ്ങൾ files share ചെയ്യുന്ന സാധാരണ രീതിയിൽ അവ share ചെയ്യാം --- അല്ലെങ്കിൽ [nbviewer](https://nbviewer.org/) പോലുള്ള web services use ചെയ്തുകൊണ്ട്.

ആ site-ൽ നിങ്ങൾ കാണുന്ന notebooks **static** html representations ആണ്.

ഒരെണ്ണം run ചെയ്യാൻ, മുകളിൽ വലതുഭാഗത്തുള്ള download icon-ൽ click ചെയ്ത് അത് ഒരു `ipynb` file ആയി download ചെയ്യുക.

അത് എവിടെയെങ്കിലും save ചെയ്യുക, Jupyter dashboard-ൽ നിന്ന് അതിലേക്ക് navigate ചെയ്യുക, തുടർന്ന് മുകളിൽ പറഞ്ഞതുപോലെ run ചെയ്യുക.

```{note}
Interactive content അടങ്ങിയ notebooks share ചെയ്യാൻ താൽപ്പര്യമുണ്ടെങ്കിൽ, [Binder](https://mybinder.org/) check ചെയ്യാം.

Notebooks-ൽ മറ്റുള്ളവരുമായി collaborate ചെയ്യാൻ, ഇവ നോക്കാവുന്നതാണ്

- [Google Colab](https://colab.research.google.com/)
- [Kaggle](https://www.kaggle.com/code)

Code private ആയി സൂക്ഷിക്കാനും പരിചിതമായ JupyterLab-ഉം Notebook interface-ഉം use ചെയ്യാനും, [JupyterLab Real-Time Collaboration extension](https://jupyterlab-realtime-collaboration.readthedocs.io/en/latest/) നോക്കുക.
```

### QuantEcon Notes

Economics-മായി ബന്ധപ്പെട്ട Jupyter notebooks share ചെയ്യാൻ QuantEcon-ന് സ്വന്തമായി ഒരു site ഉണ്ട് -- [QuantEcon Notes](http://notes.quantecon.org/).

QuantEcon Notes-ലേക്ക് submit ചെയ്യുന്ന notebooks ഒരു link വഴി share ചെയ്യാം, കൂടാതെ community-യുടെ comments-നും votes-നും അവ open ആണ്.

## Installing Libraries

(gs_qe)=
```{index} single: QuantEcon
```

നമുക്ക് ആവശ്യമുള്ള മിക്ക libraries-ഉം Anaconda-യിൽ വരുന്നു.

മറ്റ് libraries `pip` അല്ലെങ്കിൽ `conda` use ചെയ്ത് install ചെയ്യാം.

നമ്മൾ use ചെയ്യാൻ പോകുന്ന ഒരു library ആണ് [QuantEcon.py](https://quantecon.org/quantecon-py/).

(gs_install_qe)=
Jupyter start ചെയ്ത് ഒരു cell-ലേക്ക് ഇത് type ചെയ്തുകൊണ്ട് നിങ്ങൾക്ക് [QuantEcon.py](https://quantecon.org/quantecon-py/) install ചെയ്യാം

```{code-block} ipython3
:class: no-execute

!conda install quantecon
```

Alternatively, ഒരു terminal-ലേക്ക് ഇനി പറയുന്നത് type ചെയ്യാം

```{code-block} bash
:class: no-execute

conda install quantecon
```

കൂടുതൽ instructions [library page](https://quantecon.org/quantecon-py/)-ൽ കണ്ടെത്താം.

Latest version-ലേക്ക് upgrade ചെയ്യാൻ — അത് നിങ്ങൾ regularly ചെയ്യണം — ഇത് use ചെയ്യുക

```{code-block} bash
:class: no-execute

conda upgrade quantecon
```

നമ്മൾ use ചെയ്യാൻ പോകുന്ന മറ്റൊരു library ആണ് [interpolation.py](https://github.com/EconForge/interpolation.py).

Jupyter-ൽ ഇത് type ചെയ്ത് install ചെയ്യാം

```{code-block} ipython3
:class: no-execute

!conda install -c conda-forge interpolation
```

## Working with Python Files

ഇതുവരെ നമ്മൾ ഒരു Jupyter notebook cell-ലേക്ക് enter ചെയ്ത Python code execute ചെയ്യുന്നതിലാണ് focus ചെയ്തത്.

Traditionally മിക്ക Python code-ഉം വ്യത്യസ്തമായ ഒരു രീതിയിലാണ് run ചെയ്തിരുന്നത്.

Code ആദ്യം ഒരു local machine-ലെ ഒരു text file-ൽ save ചെയ്യുന്നു

Convention അനുസരിച്ച്, ഈ text files-ന് ഒരു `.py` extension ഉണ്ട്.

അത്തരമൊരു file-ന്റെ ഒരു example നമുക്ക് ഇങ്ങനെ create ചെയ്യാം:

```{code-cell} ipython
%%writefile foo.py

print("foobar")
```

ഇത് `print("foobar")` എന്ന line, local directory-യിലെ `foo.py` എന്ന file-ലേക്ക് write ചെയ്യുന്നു.

ഇവിടെ `%%writefile` എന്നത് ഒരു [cell magic](https://ipython.readthedocs.io/en/stable/interactive/magics.html#cell-magics)-ന്റെ example ആണ്.

### Editing and Execution

ഒരു `*.py` file-ൽ save ചെയ്ത code നിങ്ങൾ കണ്ടെത്തിയാൽ, ഈ questions consider ചെയ്യേണ്ടിവരും:

1. അത് എങ്ങനെ execute ചെയ്യണം?
1. അത് എങ്ങനെ modify ചെയ്യണം അല്ലെങ്കിൽ edit ചെയ്യണം?

#### Option 1: {index}`JupyterLab <single: JupyterLab>`

```{index} single: JupyterLab
```

[JupyterLab](https://github.com/jupyterlab/jupyterlab) എന്നത് Jupyter notebooks-ന് മുകളിൽ build ചെയ്ത ഒരു integrated development environment ആണ്.

JupyterLab കൊണ്ട് നിങ്ങൾക്ക് `*.py` files-ഉം Jupyter notebooks-ഉം edit ചെയ്യാനും run ചെയ്യാനും കഴിയും.

JupyterLab start ചെയ്യാൻ, applications menu-ൽ അത് search ചെയ്യുക അല്ലെങ്കിൽ ഒരു terminal-ൽ `jupyter-lab` എന്ന് type ചെയ്യുക.

ഇനി മുകളിൽ create ചെയ്ത `foo.py` എന്ന file JupyterLab-ൽ open ചെയ്ത് നിങ്ങൾക്ക് അത് open ചെയ്യാനും edit ചെയ്യാനും run ചെയ്യാനും കഴിയണം.

കൂടുതൽ information കണ്ടെത്താൻ docs read ചെയ്യുക അല്ലെങ്കിൽ ഒരു recent YouTube video search ചെയ്യുക.

#### Option 2: Using a Text Editor

ഒരു text editor use ചെയ്ത് files edit ചെയ്ത് പിന്നീട് Jupyter notebooks-ൽ നിന്ന് അവ run ചെയ്യാനും കഴിയും.

Python programs പോലുള്ള text files-മായി work ചെയ്യാൻ specifically design ചെയ്ത ഒരു application ആണ് ഒരു text editor.

Program text-മായി work ചെയ്യാൻ ഒരു നല്ല text editor-ന്റെ power-ഉം efficiency-ഉം വെല്ലാൻ മറ്റൊന്നിനും കഴിയില്ല.

ഒരു നല്ല text editor ഇവ provide ചെയ്യും

* efficient ആയ text editing commands (ഉദാ., copy, paste, search and replace)
* syntax highlighting മുതലായവ.

ഇപ്പോൾ, coding-ന് extremely popular ആയ ഒരു text editor ആണ് [VS Code](https://code.visualstudio.com/).

VS Code out of the box use ചെയ്യാൻ easy ആണ്, കൂടാതെ ധാരാളം high quality extensions-ഉം ഉണ്ട്.

Alternatively, ഒരു outstanding free text editor വേണം എന്നും, നിങ്ങളുടെ എല്ലാ neural pathways-ഉം rewire ചെയ്യപ്പെടുമ്പോൾ ഉള്ള pain and suffering-ന്റെ നീണ്ട ദിവസങ്ങൾക്കൊപ്പം ഏതാണ്ട് vertical ആയ ഒരു learning curve-നെ പറ്റി പ്രശ്നമില്ല എന്നും ഉണ്ടെങ്കിൽ, [Vim](https://www.vim.org/) try ചെയ്യുക.

## Exercises

```{exercise-start}
:label: gs_ex1
```

Jupyter ഇപ്പോഴും run ചെയ്യുന്നുണ്ടെങ്കിൽ, നിങ്ങൾ അത് start ചെയ്ത terminal-ൽ `Ctrl-C` use ചെയ്ത് quit ചെയ്യുക.

ഇനി വീണ്ടും launch ചെയ്യുക, പക്ഷേ ഇത്തവണ `jupyter notebook --no-browser` use ചെയ്ത്.

ഇത് browser launch ചെയ്യാതെ kernel start ചെയ്യണം.

Startup message-ഉം ശ്രദ്ധിക്കുക: notebook run ചെയ്യുന്ന `http://localhost:8888` പോലുള്ള ഒരു URL അത് നിങ്ങൾക്ക് നൽകണം.

ഇനി

1. നിങ്ങളുടെ browser start ചെയ്യുക --- അല്ലെങ്കിൽ അത് already run ചെയ്യുന്നുണ്ടെങ്കിൽ ഒരു പുതിയ tab open ചെയ്യുക.
1. മുകളിലുള്ള address bar-ൽ മുകളിൽ പറഞ്ഞ URL (ഉദാ. `http://localhost:8888`) enter ചെയ്യുക.

ഇനി നിങ്ങൾക്ക് ഒരു standard Jupyter notebook session run ചെയ്യാൻ കഴിയണം.

Notebook start ചെയ്യാനുള്ള ഇത് ഒരു alternative വഴിയാണ്, ഇത് handy ആയിരിക്കാം.

Kernel ഇപ്പോഴും run ചെയ്യുന്നിടത്തോളം കാലം, നിങ്ങൾ accidentally webpage close ചെയ്താലും ഇത് work ചെയ്യും.

```{exercise-end}
```