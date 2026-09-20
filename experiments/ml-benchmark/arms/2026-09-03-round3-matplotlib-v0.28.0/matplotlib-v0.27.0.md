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
  title: Matplotlib
  headings:
    Overview: Overview
    Overview::Matplotlib's Split Personality: Matplotlib's Split Personality
    The APIs: The APIs
    The APIs::The MATLAB-style API: The MATLAB-style API
    The APIs::The Object-Oriented API: The Object-Oriented API
    The APIs::Tweaks: Tweaks
    More Features: More Features
    More Features::Multiple Plots on One Axis: Multiple Plots on One Axis
    More Features::Multiple Subplots: Multiple Subplots
    More Features::3D Plots: 3D Plots
    More Features::A Customizing Function: A Customizing Function
    More Features::Style Sheets: Style Sheets
    Further Reading: Further Reading
    Exercises: Exercises
---

(matplotlib)=
```{raw} jupyter
<div id="qe-notebook-header" align="right" style="text-align:right;">
        <a href="https://quantecon.org/" title="quantecon.org">
                <img style="width:250px;display:inline;" width="250px" src="https://assets.quantecon.org/img/qe-menubar-logo.svg" alt="QuantEcon">
        </a>
</div>
```

# {index}`Matplotlib <single: Matplotlib>`

```{index} single: Python; Matplotlib
```

## Overview

ഈ lectures-ൽ [Matplotlib](https://matplotlib.org/) ഉപയോഗിച്ച് നമ്മൾ ഇതിനകം ധാരാളം figures generate ചെയ്തിട്ടുണ്ട്.

Matplotlib എന്നത് scientific computing-നു വേണ്ടി design ചെയ്ത ഒരു മികച്ച graphics library ആണ്, അതിൽ ഇവയുണ്ട്:

* high-quality 2D, 3D plots
* സാധാരണ formats-ലെല്ലാമുള്ള output (PDF, PNG മുതലായവ)
* LaTeX integration
* presentation-ന്റെ എല്ലാ വശങ്ങളിലും fine-grained control
* animation മുതലായവ

### Matplotlib's Split Personality

Matplotlib വ്യത്യസ്തമായത് അത് plotting-ന് രണ്ട് വ്യത്യസ്ത interfaces provide ചെയ്യുന്നു എന്നതിലാണ്.

ഒന്ന്, MATLAB refugees-ന് ഒരു ready home കണ്ടെത്താൻ സഹായിക്കാൻ വേണ്ടി എഴുതിയ simple ആയ MATLAB-style API (Application Programming Interface) ആണ്.

മറ്റൊന്ന് കൂടുതൽ "Pythonic" ആയ object-oriented API ആണ്.

താഴെ വിവരിക്കുന്ന കാരണങ്ങളാൽ, രണ്ടാമത്തെ API ഉപയോഗിക്കാൻ ഞങ്ങൾ recommend ചെയ്യുന്നു.

പക്ഷേ ആദ്യം, ഈ വ്യത്യാസം എന്താണെന്ന് നോക്കാം.

## The APIs

```{index} single: Matplotlib; Simple API
```

### The MATLAB-style API

Introductory treatments-ൽ കാണാൻ സാധ്യതയുള്ള ഒരു easy ആയ example താഴെ കാണാം:

```{code-cell} ipython
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 200)
y = np.sin(x)

plt.plot(x, y, 'b-', linewidth=2)
plt.show()
```

ഇത് simple-ഉം convenient-ഉം ആണ്, പക്ഷേ ഇതിന് ചില പരിമിതികളുണ്ട്, മാത്രമല്ല ഇത് un-Pythonic ആണ്.

For example, function calls-ൽ, programmer-നെ അറിയിക്കാതെ തന്നെ ധാരാളം objects create ചെയ്യപ്പെടുകയും pass ചെയ്യപ്പെടുകയും ചെയ്യുന്നു.

Python programmers സാധാരണയായി കൂടുതൽ explicit ആയ ഒരു programming style ആണ് preferചെയ്യുന്നത് (ഒരു code block-ൽ `import this` run ചെയ്ത് രണ്ടാമത്തെ line നോക്കുക).

ഇത് നമ്മെ ഒരു alternative ആയ, object-oriented Matplotlib API-യിലേക്ക് നയിക്കുന്നു.

### The Object-Oriented API

Object-oriented API ഉപയോഗിച്ച്, മുമ്പത്തെ figure-നു അനുയോജ്യമായ code താഴെ കാണാം:

```{code-cell} python3
fig, ax = plt.subplots()
ax.plot(x, y, 'b-', linewidth=2)
plt.show()
```

ഇവിടെ `fig, ax = plt.subplots()` എന്ന call ഒരു pair return ചെയ്യുന്നു, അതിൽ:

* `fig` ഒരു `Figure` instance ആണ് --- ഒരു blank canvas പോലെ.
* `ax` ഒരു `AxesSubplot` instance ആണ് --- plotting ചെയ്യാനുള്ള ഒരു frame ആയി കരുതുക.

`plot()` function യഥാർത്ഥത്തിൽ `ax`-ന്റെ ഒരു method ആണ്.

കുറച്ചുകൂടി typing വേണ്ടിവരുമെങ്കിലും, objects-ന്റെ കൂടുതൽ explicit ആയ ഉപയോഗം നമുക്ക് കൂടുതൽ നല്ല control നൽകുന്നു.

നമ്മൾ മുന്നോട്ട് പോകുമ്പോൾ ഇത് കൂടുതൽ വ്യക്തമാകും.

### Tweaks

ഇവിടെ നമ്മൾ line-ന്റെ നിറം red ആക്കി മാറ്റുകയും ഒരു legend ചേർക്കുകയും ചെയ്തിരിക്കുന്നു:

```{code-cell} python3
fig, ax = plt.subplots()
ax.plot(x, y, 'r-', linewidth=2, label='sine function', alpha=0.6)
ax.legend()
plt.show()
```

Line-നെ അല്പം transparent ആക്കാൻ നമ്മൾ `alpha` ഉപയോഗിച്ചിട്ടുണ്ട് --- ഇത് അതിനെ smooth ആയി കാണിക്കുന്നു.

`ax.legend()`-നെ `ax.legend(loc='upper center')` ഉപയോഗിച്ച് മാറ്റി legend-ന്റെ സ്ഥാനം മാറ്റാൻ സാധിക്കും.

```{code-cell} python3
fig, ax = plt.subplots()
ax.plot(x, y, 'r-', linewidth=2, label='sine function', alpha=0.6)
ax.legend(loc='upper center')
plt.show()
```

എല്ലാം ശരിയായി configure ചെയ്തിട്ടുണ്ടെങ്കിൽ, LaTeX ചേർക്കുന്നത് വളരെ എളുപ്പം ആണ്:

```{code-cell} python3
fig, ax = plt.subplots()
ax.plot(x, y, 'r-', linewidth=2, label=r'$y=\sin(x)$', alpha=0.6)
ax.legend(loc='upper center')
plt.show()
```

Ticks control ചെയ്യുന്നതും titles ചേർക്കുന്നതും മറ്റും also എളുപ്പം ആണ്:

```{code-cell} python3
fig, ax = plt.subplots()
ax.plot(x, y, 'r-', linewidth=2, label=r'$y=\sin(x)$', alpha=0.6)
ax.legend(loc='upper center')
ax.set_yticks([-1, 0, 1])
ax.set_title('Test plot')
plt.show()
```

## More Features

Matplotlib-ന് വളരെ വലിയ ഒരു functions-ന്റെ ഒപ്പം features-ന്റെ collection ഉണ്ട്, ആവശ്യമായി വരുമ്പോൾ കാലക്രമേണ നിങ്ങൾ അവ discover ചെയ്യും.

അതിൽ ചിലത് മാത്രം ഇവിടെ പറയാം.

### Multiple Plots on One Axis

```{index} single: Matplotlib; Multiple Plots on One Axis
```

ഒരേ axes-ൽ multiple plots generate ചെയ്യുന്നത് വളരെ എളുപ്പം ആണ്.

Random ആയി മൂന്ന് normal densities generate ചെയ്ത് അവയുടെ mean-ഉള്ള ഒരു label ചേർക്കുന്ന example താഴെ കാണാം:

```{code-cell} python3
from scipy.stats import norm
from random import uniform

fig, ax = plt.subplots()
x = np.linspace(-4, 4, 150)
for i in range(3):
    m, s = uniform(-1, 1), uniform(1, 2)
    y = norm.pdf(x, loc=m, scale=s)
    current_label = rf'$\mu = {m:.2}$'
    ax.plot(x, y, linewidth=2, alpha=0.6, label=current_label)
ax.legend()
plt.show()
```

### Multiple Subplots

```{index} single: Matplotlib; Subplots
```

ചിലപ്പോൾ നമുക്ക് ഒരു figure-ൽ multiple subplots വേണ്ടിവരും.

6 histograms generate ചെയ്യുന്ന ഒരു example താഴെ കാണാം:

```{code-cell} python3
num_rows, num_cols = 3, 2
fig, axes = plt.subplots(num_rows, num_cols, figsize=(10, 12))
for i in range(num_rows):
    for j in range(num_cols):
        m, s = uniform(-1, 1), uniform(1, 2)
        x = norm.rvs(loc=m, scale=s, size=100)
        axes[i, j].hist(x, alpha=0.6, bins=20)
        t = rf'$\mu = {m:.2}, \quad \sigma = {s:.2}$'
        axes[i, j].set(title=t, xticks=[-4, 0, 4], yticks=[])
plt.show()
```

### 3D Plots

```{index} single: Matplotlib; 3D Plots
```

Matplotlib 3D plots-ന്റെ കാര്യത്തിലും നല്ല ജോലി ചെയ്യുന്നു --- ഒരു example താഴെ കാണാം:

```{code-cell} python3
from mpl_toolkits.mplot3d.axes3d import Axes3D
from matplotlib import cm


def f(x, y):
    return np.cos(x**2 + y**2) / (1 + x**2 + y**2)

xgrid = np.linspace(-3, 3, 50)
ygrid = xgrid
x, y = np.meshgrid(xgrid, ygrid)

fig = plt.figure(figsize=(10, 6))
ax = fig.add_subplot(111, projection='3d')
ax.plot_surface(x,
                y,
                f(x, y),
                rstride=2, cstride=2,
                cmap=cm.jet,
                alpha=0.7,
                linewidth=0.25)
ax.set_zlim(-0.5, 1.0)
plt.show()
```

### A Customizing Function

ഒരു set of customizations നിങ്ങൾ സ്ഥിരമായി ഉപയോഗിക്കുന്നത് കണ്ടെത്തിയേക്കാം.

നമ്മുടെ axes origin-ലൂടെ പോകണം എന്നും, ഒരു grid ഉണ്ടാകണം എന്നും നമ്മൾ സാധാരണയായി preferചെയ്യുന്നു എന്ന് കരുതുക.

ഈ മാറ്റങ്ങൾ implement ചെയ്യുന്ന ഒരു custom `subplots` function build ചെയ്യാൻ object-oriented API എങ്ങനെ ഉപയോഗിക്കാം എന്നതിന്റെ ഒരു നല്ല example [Matthew Doty](https://github.com/xcthulhu)-യിൽ നിന്നും താഴെ കാണാം.

Code ശ്രദ്ധയോടെ വായിച്ച്, എന്താണ് നടക്കുന്നത് എന്ന് follow ചെയ്യാൻ കഴിയുമോ എന്ന് നോക്കുക:

```{code-cell} python3
def subplots():
    "Custom subplots with axes through the origin"
    fig, ax = plt.subplots()

    # Set the axes through the origin
    for spine in ['left', 'bottom']:
        ax.spines[spine].set_position('zero')
    for spine in ['right', 'top']:
        ax.spines[spine].set_color('none')

    ax.grid()
    return fig, ax


fig, ax = subplots()  # Call the local version, not plt.subplots()
x = np.linspace(-2, 10, 200)
y = np.sin(x)
ax.plot(x, y, 'r-', linewidth=2, label='sine function', alpha=0.6)
ax.legend(loc='lower right')
plt.show()
```

Custom `subplots` function:

1. `fig, ax` pair generate ചെയ്യാൻ internal ആയി standard `plt.subplots` function-നെ call ചെയ്യുന്നു,
1. `ax`-ൽ ആവശ്യമായ customizations വരുത്തുന്നു, ഒപ്പം
1. `fig, ax` pair-നെ calling code-ലേക്ക് pass ചെയ്ത് തിരികെ നൽകുന്നു.

### Style Sheets

Matplotlib-ലെ മറ്റൊരു വളരെ useful ആയ feature ആണ് [style sheets](https://matplotlib.org/stable/gallery/style_sheets/style_sheets_reference.html).

Uniform ആയ styles ഉള്ള plots create ചെയ്യാൻ നമുക്ക് style sheets ഉപയോഗിക്കാം.

`plt.style.available` എന്ന attribute print ചെയ്ത് available styles-ന്റെ ഒരു list നമുക്ക് കണ്ടെത്താം:

```{code-cell} python3
print(plt.style.available)
```

ഇനി style sheet set ചെയ്യാൻ നമുക്ക് `plt.style.use()` method ഉപയോഗിക്കാം.

ഒരു style sheet-ന്റെ പേര് എടുത്ത് ആ style ഉപയോഗിച്ച് വ്യത്യസ്ത plots വരയ്ക്കുന്ന ഒരു function നമുക്ക് എഴുതാം:

```{code-cell} python3

def draw_graphs(style='default'):

    # Setting a style sheet
    plt.style.use(style)

    fig, axes = plt.subplots(nrows=1, ncols=4, figsize=(10, 3))
    x = np.linspace(-13, 13, 150)

    # Set seed values to replicate results of random draws
    np.random.seed(9)

    for i in range(3):

        # Draw mean and standard deviation from uniform distributions
        m, s = np.random.uniform(-8, 8), np.random.uniform(2, 2.5)

        # Generate a normal density plot
        y = norm.pdf(x, loc=m, scale=s)
        axes[0].plot(x, y, linewidth=3, alpha=0.7)

        # Create a scatter plot with random X and Y values 
        # from normal distributions
        rnormX = norm.rvs(loc=m, scale=s, size=150)
        rnormY = norm.rvs(loc=m, scale=s, size=150)
        axes[1].plot(rnormX, rnormY, ls='none', marker='o', alpha=0.7)

        # Create a histogram with random X values
        axes[2].hist(rnormX, alpha=0.7)

        # and a line graph with random Y values
        axes[3].plot(x, rnormY, linewidth=2, alpha=0.7)

    style_name = style.split('-')[0]
    plt.suptitle(f'Style: {style_name}', fontsize=13)
    plt.show()

```

ഈ styles-ൽ ചിലത് എങ്ങനെ കാണപ്പെടുന്നു എന്ന് നോക്കാം.

ആദ്യം, `seaborn` എന്ന style sheet ഉപയോഗിച്ച് graphs വരയ്ക്കാം:

```{code-cell} python3
draw_graphs(style='seaborn-v0_8')
```

Plots-ലെ colors ഒഴിവാക്കാൻ നമുക്ക് `grayscale` ഉപയോഗിക്കാം:

```{code-cell} python3
draw_graphs(style='grayscale')
```

`ggplot` എങ്ങനെ കാണപ്പെടുന്നു എന്ന് താഴെ കാണാം:

```{code-cell} python3
draw_graphs(style='ggplot')
```

നമുക്ക് `dark_background` എന്ന style-ഉം ഉപയോഗിക്കാം:

```{code-cell} python3
draw_graphs(style='dark_background')
```

List-ലെ മറ്റ് styles experiment ചെയ്യാൻ നിങ്ങൾക്ക് ഈ function ഉപയോഗിക്കാം.

നിങ്ങൾക്ക് താൽപ്പര്യമുണ്ടെങ്കിൽ, നിങ്ങളുടെ own style sheets തന്നെ create ചെയ്യാം.

നിങ്ങളുടെ style sheets-ന്റെ parameters `plt.rcParams` എന്ന dictionary-like variable-ൽ store ചെയ്യപ്പെടുന്നു:

```{code-cell} python3
---
tags: [hide-output]
---
 
print(plt.rcParams.keys())

```

നിങ്ങളുടെ style sheets-ന് വേണ്ടി set ചെയ്യാൻ കഴിയുന്ന ധാരാളം parameters ഉണ്ട്.

നിങ്ങളുടെ style sheet-ന്റെ parameters set ചെയ്യാൻ:

1. നിങ്ങളുടെ own [`matplotlibrc` file](https://matplotlib.org/stable/users/explain/customizing.html) create ചെയ്യുക, അല്ലെങ്കിൽ
2. `plt.rcParams` എന്ന dictionary-like variable-ൽ store ചെയ്തിരിക്കുന്ന values update ചെയ്യുക

രണ്ടാമത്തെ method ഉപയോഗിച്ച് overlay ചെയ്ത നമ്മുടെ density lines-ന്റെ style മാറ്റാം:

```{code-cell} python3
from cycler import cycler

# set to the default style sheet
plt.style.use('default')

# You can update single values using keys:

# Set the font style to italic
plt.rcParams['font.style'] = 'italic'

# Update linewidth
plt.rcParams['lines.linewidth'] = 2


# You can also update many values at once using the update() method:

parameters = {

    # Change default figure size
    'figure.figsize': (5, 4),

    # Add horizontal grid lines
    'axes.grid': True,
    'axes.grid.axis': 'y',

    # Update colors for density lines
    'axes.prop_cycle': cycler('color', 
                            ['dimgray', 'slategrey', 'darkgray'])
}

plt.rcParams.update(parameters)


```

```{note} 

ഈ settings `global` ആണ്.

`.rcParams`-ലെ parameters മാറ്റിയതിന് ശേഷം generate ചെയ്യുന്ന ഏതൊരു plot-നും ഈ setting affect ചെയ്യും.

```

```{code-cell} python3
fig, ax = plt.subplots()
x = np.linspace(-4, 4, 150)
for i in range(3):
    m, s = uniform(-1, 1), uniform(1, 2)
    y = norm.pdf(x, loc=m, scale=s)
    current_label = rf'$\mu = {m:.2}$'
    ax.plot(x, y, linewidth=2, alpha=0.6, label=current_label)
ax.legend()
plt.show()
```

നിങ്ങളുടെ style വീണ്ടും default ആയി മാറ്റാൻ `default` style sheet വീണ്ടും apply ചെയ്യുക:

```{code-cell} python3

plt.style.use('default')

# Reset default figure size
plt.rcParams['figure.figsize'] = (10, 6)

```

## Further Reading

* [Matplotlib gallery](https://matplotlib.org/stable/gallery/index.html) ധാരാളം examples provide ചെയ്യുന്നു.
* Nicolas Rougier, Mike Muller, Gael Varoquaux എന്നിവരുടെ ഒരു നല്ല [Matplotlib tutorial](https://scipy-lectures.org/intro/matplotlib/index.html).
* [mpltools](https://tonysyu.github.io/mpltools/index.html) plot styles-ന് ഇടയിൽ എളുപ്പം switching ചെയ്യാൻ അനുവദിക്കുന്നു.
* [Seaborn](https://github.com/mwaskom/seaborn) Matplotlib-ൽ common ആയ statistics plots സഹായിക്കുന്നു.

## Exercises

```{exercise-start}
:label: mpl_ex1
```

Plot the function

$$
f(x) = \cos(\pi \theta x) \exp(-x)
$$

over the interval $[0, 5]$ for each $\theta$ in `np.linspace(0, 2, 10)`.

Place all the curves in the same figure.

The output should look like this

```{image} /_static/lecture_specific/matplotlib/matplotlib_ex1.png
:scale: 130
:align: center
```

```{exercise-end}
```

```{solution-start} mpl_ex1
:class: dropdown
```

Here's one solution

```{code-cell} ipython3
def f(x, θ):
    return np.cos(np.pi * θ * x ) * np.exp(- x)

θ_vals = np.linspace(0, 2, 10)
x = np.linspace(0, 5, 200)
fig, ax = plt.subplots()

for θ in θ_vals:
    ax.plot(x, f(x, θ))

plt.show()
```

```{solution-end}
```
