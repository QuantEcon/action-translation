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

ഈ lectures-ൽ [Matplotlib](https://matplotlib.org/) ഉപയോഗിച്ച് already ധാരാളം figures നമ്മൾ generate ചെയ്തിട്ടുണ്ട്.

Matplotlib എന്നത് scientific computing-നായി design ചെയ്ത ഒരു മികച്ച graphics library ആണ്. ഇതിൽ ഉള്ളത്:

* high-quality 2D and 3D plots
* സാധാരണ formats-ൽ (PDF, PNG, etc.) output
* LaTeX integration
* presentation-ന്റെ എല്ലാ വശങ്ങളിലും fine-grained control
* animation, etc.

### Matplotlib's Split Personality

Matplotlib-ന്റെ ഒരു പ്രത്യേകത എന്തെന്നാൽ, plotting-ന് ഇത് രണ്ട് വ്യത്യസ്ത interfaces provide ചെയ്യുന്നു.

ഒന്ന്, MATLAB refugees-ന് സുഖമായി പരിചയപ്പെടാൻ വേണ്ടി എഴുതിയ ഒരു simple MATLAB-style API (Application Programming Interface) ആണ്.

മറ്റൊന്ന്, കൂടുതൽ "Pythonic" ആയ ഒരു object-oriented API ആണ്.

താഴെ പറയുന്ന കാരണങ്ങൾ കൊണ്ട്, രണ്ടാമത്തെ API ഉപയോഗിക്കാൻ ഞങ്ങൾ നിർദ്ദേശിക്കുന്നു.

പക്ഷേ ആദ്യം, ഇവ തമ്മിലുള്ള വ്യത്യാസം നമുക്ക് നോക്കാം.

## The APIs

```{index} single: Matplotlib; Simple API
```

### The MATLAB-style API

Introductory treatments-ൽ കാണാൻ സാധിക്കുന്ന തരത്തിലുള്ള ഒരു easy example താഴെ കാണാം:

```{code-cell} ipython
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 200)
y = np.sin(x)

plt.plot(x, y, 'b-', linewidth=2)
plt.show()
```

ഇത് simple-ഉം convenient-ഉം ആണ്, പക്ഷേ ഇതിന് കുറച്ച് പരിമിതികളുണ്ട്, കൂടാതെ un-Pythonic ആണ്.

For example, ഈ function calls-ൽ, programmer-ന് അറിയാതെ തന്നെ ധാരാളം objects create ചെയ്യപ്പെടുകയും pass ചെയ്യപ്പെടുകയും ചെയ്യുന്നു.

Python programmers സാധാരണയായി കൂടുതൽ explicit ആയ ഒരു programming style ആണ് preferring ചെയ്യുന്നത് (ഒരു code block-ൽ `import this` run ചെയ്ത് രണ്ടാമത്തെ line നോക്കുക).

ഇത് നമ്മളെ alternative ആയ, object-oriented Matplotlib API-യിലേക്ക് നയിക്കുന്നു.

### The Object-Oriented API

Object-oriented API ഉപയോഗിച്ച് മുമ്പ് കൊടുത്ത figure-ന് അനുയോജ്യമായ code താഴെ കാണാം:

```{code-cell} python3
fig, ax = plt.subplots()
ax.plot(x, y, 'b-', linewidth=2)
plt.show()
```

ഇവിടെ `fig, ax = plt.subplots()` എന്ന call ഒരു pair return ചെയ്യുന്നു. അതിൽ:

* `fig` ഒരു `Figure` instance ആണ് --- ഒരു blank canvas പോലെ.
* `ax` ഒരു `AxesSubplot` instance ആണ് --- plotting-ന് ഉള്ള ഒരു frame ആയി ഇതിനെ കരുതാം.

`plot()` function യഥാർത്ഥത്തിൽ `ax`-ന്റെ ഒരു method ആണ്.

Typing കുറച്ചുകൂടി കൂടുതലാണെങ്കിലും, objects-ന്റെ ഈ explicit ഉപയോഗം നമുക്ക് കൂടുതൽ നല്ല control നൽകുന്നു.

നമ്മൾ മുന്നോട്ട് പോകുമ്പോൾ ഇത് കൂടുതൽ വ്യക്തമാകും.

### Tweaks

ഇവിടെ line-ന്റെ നിറം red ആയി മാറ്റുകയും ഒരു legend ചേർക്കുകയും ചെയ്തിരിക്കുന്നു:

```{code-cell} python3
fig, ax = plt.subplots()
ax.plot(x, y, 'r-', linewidth=2, label='sine function', alpha=0.6)
ax.legend()
plt.show()
```

Line-നെ അല്പം transparent ആക്കാൻ `alpha`-ഉം നമ്മൾ ഉപയോഗിച്ചിട്ടുണ്ട് --- ഇത് line-നെ കൂടുതൽ smooth ആയി കാണിക്കും.

`ax.legend()`-നെ `ax.legend(loc='upper center')` ആയി മാറ്റുന്നതിലൂടെ legend-ന്റെ സ്ഥാനം മാറ്റാം.

```{code-cell} python3
fig, ax = plt.subplots()
ax.plot(x, y, 'r-', linewidth=2, label='sine function', alpha=0.6)
ax.legend(loc='upper center')
plt.show()
```

എല്ലാം properly configure ചെയ്തിട്ടുണ്ടെങ്കിൽ, LaTeX ചേർക്കുന്നത് വളരെ എളുപ്പമാണ്:

```{code-cell} python3
fig, ax = plt.subplots()
ax.plot(x, y, 'r-', linewidth=2, label=r'$y=\sin(x)$', alpha=0.6)
ax.legend(loc='upper center')
plt.show()
```

Ticks control ചെയ്യുന്നതും titles ചേർക്കുന്നതും തുടങ്ങിയ കാര്യങ്ങളും എളുപ്പമാണ്:

```{code-cell} python3
fig, ax = plt.subplots()
ax.plot(x, y, 'r-', linewidth=2, label=r'$y=\sin(x)$', alpha=0.6)
ax.legend(loc='upper center')
ax.set_yticks([-1, 0, 1])
ax.set_title('Test plot')
plt.show()
```

## More Features

Matplotlib-ന് വളരെയധികം functions-ഉം features-ഉം ഉണ്ട്. ആവശ്യം വരുമ്പോൾ കാലക്രമേണ നിങ്ങൾക്ക് ഇവ discover ചെയ്യാം.

ചുരുക്കം ചില കാര്യങ്ങൾ മാത്രം ഇവിടെ പറയാം.

### Multiple Plots on One Axis

```{index} single: Matplotlib; Multiple Plots on One Axis
```

ഒരേ axes-ൽ multiple plots generate ചെയ്യുന്നത് വളരെ എളുപ്പമാണ്.

Random ആയി മൂന്ന് normal densities generate ചെയ്ത്, അവയുടെ mean-നൊപ്പം ഒരു label ചേർക്കുന്ന example താഴെ കാണാം:

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

ചിലപ്പോൾ ഒരു figure-ൽ multiple subplots വേണ്ടി വരും.

6 histograms generate ചെയ്യുന്ന example താഴെ കാണാം:

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

Matplotlib 3D plots വളരെ നന്നായി ചെയ്യുന്നു --- ഒരു example താഴെ കാണാം:

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

ചിലപ്പോൾ നിങ്ങൾ പതിവായി ഉപയോഗിക്കുന്ന ഒരു set of customizations കണ്ടെത്തിയേക്കാം.

നമ്മുടെ axes എപ്പോഴും origin-ൽ കൂടി കടന്നുപോകണമെന്നും, ഒരു grid ഉണ്ടാകണമെന്നും കരുതുക.

ഈ മാറ്റങ്ങൾ implement ചെയ്യുന്ന ഒരു custom `subplots` function, object-oriented API ഉപയോഗിച്ച് എങ്ങനെ build ചെയ്യാം എന്നതിന്റെ ഒരു നല്ല example [Matthew Doty](https://github.com/xcthulhu)-യിൽ നിന്നും താഴെ കാണാം.

Code സൂക്ഷ്മമായി വായിച്ച്, എന്താണ് നടക്കുന്നത് എന്ന് നിങ്ങൾക്ക് follow ചെയ്യാൻ സാധിക്കുമോ എന്ന് നോക്കുക:

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
1. `ax`-ൽ വേണ്ട customizations ചെയ്യുന്നു, കൂടാതെ
1. `fig, ax` pair-നെ calling code-ലേക്ക് തിരികെ pass ചെയ്യുന്നു.

### Style Sheets

Matplotlib-ലെ മറ്റൊരു വളരെ useful ആയ feature ആണ് [style sheets](https://matplotlib.org/stable/gallery/style_sheets/style_sheets_reference.html).

Uniform styles ഉള്ള plots create ചെയ്യാൻ style sheets നമുക്ക് ഉപയോഗിക്കാം.

`plt.style.available` എന്ന attribute print ചെയ്താൽ, available ആയ styles-ന്റെ ഒരു list നമുക്ക് കണ്ടെത്താം:

```{code-cell} python3
print(plt.style.available)
```

ഇനി style sheet set ചെയ്യാൻ `plt.style.use()` method നമുക്ക് ഉപയോഗിക്കാം.

ഒരു style sheet-ന്റെ name എടുത്ത്, ആ style ഉപയോഗിച്ച് വ്യത്യസ്ത plots draw ചെയ്യുന്ന ഒരു function നമുക്ക് എഴുതാം:

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

ചില styles എങ്ങനെ കാണപ്പെടുന്നു എന്ന് നമുക്ക് നോക്കാം.

ആദ്യം, `seaborn` എന്ന style sheet ഉപയോഗിച്ച് നമുക്ക് graphs draw ചെയ്യാം:

```{code-cell} python3
draw_graphs(style='seaborn-v0_8')
```

Plots-ലെ colors നീക്കം ചെയ്യാൻ `grayscale` നമുക്ക് ഉപയോഗിക്കാം:

```{code-cell} python3
draw_graphs(style='grayscale')
```

`ggplot` എങ്ങനെ കാണപ്പെടുന്നു എന്ന് താഴെ കാണാം:

```{code-cell} python3
draw_graphs(style='ggplot')
```

`dark_background` എന്ന style-ഉം നമുക്ക് ഉപയോഗിക്കാം:

```{code-cell} python3
draw_graphs(style='dark_background')
```

List-ലെ മറ്റ് styles experiment ചെയ്യാൻ ഈ function നിങ്ങൾക്ക് ഉപയോഗിക്കാം.

താല്പര്യമുണ്ടെങ്കിൽ, നിങ്ങൾക്ക് സ്വന്തമായി style sheets പോലും create ചെയ്യാം.

നിങ്ങളുടെ style sheets-ന് വേണ്ട parameters, `plt.rcParams` എന്ന dictionary പോലുള്ള ഒരു variable-ൽ സൂക്ഷിച്ചിരിക്കുന്നു:

```{code-cell} python3
---
tags: [hide-output]
---
 
print(plt.rcParams.keys())

```

നിങ്ങളുടെ style sheets-ന് വേണ്ടി set ചെയ്യാൻ സാധിക്കുന്ന ധാരാളം parameters ഉണ്ട്.

നിങ്ങളുടെ style sheet-ന് വേണ്ട parameters set ചെയ്യാൻ:

1. സ്വന്തമായി ഒരു [`matplotlibrc` file](https://matplotlib.org/stable/users/explain/customizing.html) create ചെയ്യുക, അല്ലെങ്കിൽ
2. `plt.rcParams` എന്ന dictionary പോലുള്ള variable-ൽ സൂക്ഷിച്ചിരിക്കുന്ന values update ചെയ്യുക

രണ്ടാമത്തെ method ഉപയോഗിച്ച്, overlay ചെയ്ത density lines-ന്റെ style നമുക്ക് മാറ്റാം:

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

`.rcParams`-ലെ parameters മാറ്റിയ ശേഷം generate ചെയ്യുന്ന ഏത് plot-ഉം ഈ setting-ന്റെ effect കാണിക്കും.

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

നിങ്ങളുടെ style-നെ default ആയി തിരികെ മാറ്റാൻ, `default` style sheet ഒരിക്കൽ കൂടി apply ചെയ്യുക:

```{code-cell} python3

plt.style.use('default')

# Reset default figure size
plt.rcParams['figure.figsize'] = (10, 6)

```

## Further Reading

* [Matplotlib gallery](https://matplotlib.org/stable/gallery/index.html) ധാരാളം examples provide ചെയ്യുന്നു.
* Nicolas Rougier, Mike Muller, Gael Varoquaux എന്നിവരുടെ ഒരു നല്ല [Matplotlib tutorial](https://scipy-lectures.org/intro/matplotlib/index.html).
* [mpltools](https://tonysyu.github.io/mpltools/index.html) ഉപയോഗിച്ച് plot styles-ന് ഇടയിൽ easy ആയി switch ചെയ്യാം.
* [Seaborn](https://github.com/mwaskom/seaborn), Matplotlib-ൽ common statistics plots create ചെയ്യാൻ സഹായിക്കുന്നു.

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
