---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
    format_version: 0.13
    jupytext_version: 1.16.7
kernelspec:
  display_name: Python 3 (ipykernel)
  language: python
  name: python3
translation:
  title: Pandas
  headings:
    Overview: Overview
    Series: Series
    DataFrames: DataFrames
    DataFrames::Select Data by Position: Select Data by Position
    DataFrames::Select Data by Conditions: Select Data by Conditions
    DataFrames::Apply Method: Apply Method
    DataFrames::Make Changes in DataFrames: Make Changes in DataFrames
    DataFrames::Standardization and Visualization: Standardization and Visualization
    On-Line Data Sources: On-Line Data Sources
    On-Line Data Sources::Accessing Data with requests: Accessing Data with requests
    On-Line Data Sources::Using wbgapi and yfinance to Access Data: Using wbgapi and yfinance to Access Data
    Exercises: Exercises
---

(pd)=
```{raw} jupyter
<div id="qe-notebook-header" align="right" style="text-align:right;">
        <a href="https://quantecon.org/" title="quantecon.org">
                <img style="width:250px;display:inline;" width="250px" src="https://assets.quantecon.org/img/qe-menubar-logo.svg" alt="QuantEcon">
        </a>
</div>
```

# {index}`Pandas <single: Pandas>`

```{index} single: Python; Pandas
```

Anaconda-യിൽ ഉള്ളവ കൂടാതെ, ഈ lecture-ന് താഴെ പറയുന്ന libraries-ഉം ആവശ്യമായിവരുന്നു:

```{code-cell} ipython3
:tags: [hide-output]

!pip install --upgrade wbgapi
!pip install --upgrade yfinance
```

## Overview

[Pandas](https://pandas.pydata.org/) എന്നത്, Python-നുള്ള വേഗതയേറിയതും efficient ആയതുമായ data analysis tools-ന്റെ ഒരു package ആണ്.

data science, machine learning പോലുള്ള മേഖലകളുടെ വളർച്ചയ്ക്കൊപ്പം, സമീപ വർഷങ്ങളിൽ ഇതിന്റെ popularity വളരെയധികം ഉയർന്നിട്ടുണ്ട്.

Stack Overflow Trends-ന്റെ സഹായത്തോടെ, Matlab-ഉം STATA-ഉമായി താരതമ്യം ചെയ്തുള്ള popularity-യുടെ ഒരു comparison കാലക്രമേണ താഴെ കാണാം:

```{figure} /_static/lecture_specific/pandas/pandas_vs_rest.png
:scale: 100
```

[NumPy](https://numpy.org/) അടിസ്ഥാന array data type-ഉം core array operations-ഉം നൽകുന്നത് പോലെ, pandas

1. data-യുമായി work ചെയ്യാനുള്ള fundamental structures define ചെയ്യുന്നു, കൂടാതെ
1. താഴെ പറയുന്നത് പോലുള്ള operations സഹായിക്കുന്ന methods-ഉം നൽകുന്നു
    * data read ചെയ്യുക
    * indices adjust ചെയ്യുക
    * dates-ഉം time series-ഉം ആയി work ചെയ്യുക
    * sorting, grouping, re-ordering, general data munging [^mung] എന്നിവ
    * missing values കൈകാര്യം ചെയ്യൽ തുടങ്ങിയവ

കൂടുതൽ sophisticated ആയ statistical functionality, [statsmodels](https://www.statsmodels.org/), [scikit-learn](https://scikit-learn.org/) പോലുള്ള, pandas-ന് മുകളിൽ build ചെയ്തിരിക്കുന്ന മറ്റ് packages-ന് വിട്ടുകൊടുത്തിരിക്കുന്നു.

ഈ lecture pandas-ന്റെ ഒരു അടിസ്ഥാന introduction നൽകുന്നു.

ഈ lecture മുഴുവനും, താഴെ പറയുന്ന imports നടന്നിട്ടുണ്ട് എന്ന് നമുക്ക് കരുതാം:

```{code-cell} ipython3
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import requests
```

pandas define ചെയ്യുന്ന രണ്ട് പ്രധാന data types ആണ് `Series`-ഉം `DataFrame`-ഉം.

ഒരു single variable-ന്റെ observations-ന്റെ collection പോലെ, `Series`-നെ data-യുടെ ഒരു "column" ആയി കരുതാം.

`DataFrame` എന്നത്, related columns ഓഫ് data store ചെയ്യാനുള്ള ഒരു two-dimensional object ആണ്.

## Series

```{index} single: Pandas; Series
```

നമുക്ക് Series-ൽ നിന്നും തുടങ്ങാം.

നാല് random observations-ന്റെ ഒരു series create ചെയ്തുകൊണ്ട് നമുക്ക് തുടങ്ങാം:

```{code-cell} ipython3
rng = np.random.default_rng()
s = pd.Series(rng.standard_normal(4), name='daily returns')
s
```

ഇവിടെ `0, 1, 2, 3` എന്ന indices-നെ, listed ആയ നാല് companies-നെ index ചെയ്യുന്നതായും, values-നെ അവയുടെ shares-ന്റെ daily returns ആയും നിങ്ങൾക്ക് സങ്കൽപ്പിക്കാം.

Pandas-ന്റെ `Series`, NumPy arrays-ന് മുകളിൽ build ചെയ്തിരിക്കുന്നതിനാൽ, സമാനമായ പല operations-ഉം support ചെയ്യുന്നു:

```{code-cell} ipython3
s * 100
```

```{code-cell} ipython3
np.abs(s)
```

എന്നാൽ `Series`, NumPy arrays-നേക്കാൾ കൂടുതൽ നൽകുന്നു.

(statistically oriented ആയ) ചില additional methods ഉള്ളത് കൂടാതെ,

```{code-cell} ipython3
s.describe()
```

അവയുടെ indices കൂടുതൽ flexible ആണ്:

```{code-cell} ipython3
s.index = ['AMZN', 'AAPL', 'MSFT', 'GOOG']
s
```

ഈ രീതിയിൽ നോക്കുമ്പോൾ, `Series` എന്നത് വേഗതയേറിയതും efficient ആയതുമായ Python dictionaries പോലെയാണ് (dictionary-യിലെ items എല്ലാം ഒരേ type ആയിരിക്കണം എന്ന പരിമിതിയോടെ --- ഇവിടെ floats).

വാസ്തവത്തിൽ, Python dictionaries-ൽ ഉപയോഗിക്കുന്ന syntax തന്നെ നിങ്ങൾക്ക് ഇവിടെയും ഉപയോഗിക്കാം:

```{code-cell} ipython3
s['AMZN']
```

```{code-cell} ipython3
s['AMZN'] = 0
s
```

```{code-cell} ipython3
'AAPL' in s
```

## DataFrames

```{index} single: Pandas; DataFrames
```

`Series` എന്നത് data-യുടെ ഒരു single column ആണെങ്കിൽ, `DataFrame` എന്നത് ഓരോ variable-ഇനും ഓരോ column ഉള്ള, ഒന്നിലധികം columns ആണ്.

essence-ൽ, pandas-ലെ ഒരു `DataFrame`, ഒരു (highly optimized) Excel spreadsheet-ന് സമാനമാണ്.

അതിനാൽ, rows-ലേക്കും columns-ലേക്കും സ്വാഭാവികമായി organize ചെയ്തിരിക്കുന്ന data represent ചെയ്യാനും analyze ചെയ്യാനും, individual rows-ഉം individual columns-ഉം സൂചിപ്പിക്കുന്ന descriptive indexes-ഉം ഉൾപ്പെടെ, ഇത് വളരെ powerful ആയ ഒരു tool ആണ്.

[Penn World Tables](https://www.rug.nl/ggdc/productivity/pwt/pwt-releases/pwt-7.0)-ൽ നിന്നും എടുത്ത `test_pwt.csv` എന്ന CSV file-ൽ നിന്നും data read ചെയ്യുന്ന ഒരു example നോക്കാം.

ഈ dataset-ൽ താഴെ പറയുന്ന indicators അടങ്ങിയിരിക്കുന്നു:

| Variable Name | Description |
| :-: | :-: |
| POP | Population (in thousands) |
| XRAT | Exchange Rate to US Dollar |                     
| tcgdp | Total PPP Converted GDP (in million international dollar) |
| cc | Consumption Share of PPP Converted GDP Per Capita (%) |
| cg | Government Consumption Share of PPP Converted GDP Per Capita (%) |

`pandas` function ആയ `read_csv` ഉപയോഗിച്ച്, നമുക്ക് ഇത് ഒരു URL-ൽ നിന്നും read ചെയ്യാം.

```{code-cell} ipython3
df = pd.read_csv('https://github.com/QuantEcon/data-lectures/raw/main/lectures/test_pwt.csv')
type(df)
```

`test_pwt.csv`-യുടെ content താഴെ കാണാം:

```{code-cell} ipython3
df
```

### Select Data by Position

practice-ൽ, നമ്മൾ എപ്പോഴും ചെയ്യുന്ന ഒരു കാര്യം, നമുക്ക് താൽപ്പര്യമുള്ള data-യുടെ ഒരു subset കണ്ടെത്തി select ചെയ്ത് അതുമായി work ചെയ്യുക എന്നതാണ്.

standard ആയ Python array slicing notation ഉപയോഗിച്ച് നമുക്ക് പ്രത്യേക rows select ചെയ്യാം:

```{code-cell} ipython3
df[2:5]
```

columns select ചെയ്യാൻ, നമുക്ക് ആവശ്യമായ columns-ന്റെ names strings ആയി അടങ്ങിയ ഒരു list pass ചെയ്യാം:

```{code-cell} ipython3
df[['country', 'tcgdp']]
```

integers ഉപയോഗിച്ച് rows-ഉം columns-ഉം select ചെയ്യാൻ, `.iloc[rows, columns]` എന്ന format-ൽ `iloc` attribute ഉപയോഗിക്കണം.

```{code-cell} ipython3
df.iloc[2:5, 0:4]
```

integers-ഉം labels-ഉം ചേർന്ന ഒരു mixture ഉപയോഗിച്ച് rows-ഉം columns-ഉം select ചെയ്യാൻ, സമാനമായ രീതിയിൽ `loc` attribute ഉപയോഗിക്കാം:

```{code-cell} ipython3
df.loc[df.index[2:5], ['country', 'tcgdp']]
```

### Select Data by Conditions

integers-ഉം names-ഉം ഉപയോഗിച്ച് rows-ഉം columns-ഉം index ചെയ്യുന്നതിന് പകരം, ചില (ഒരുപക്ഷേ complicated ആയ) conditions satisfy ചെയ്യുന്ന, നമുക്ക് താൽപ്പര്യമുള്ള ഒരു sub-dataframe-ഉം നേടാം.

ഇത് ചെയ്യാനുള്ള വിവിധ രീതികൾ ഈ section-ൽ കാണിക്കുന്നു.

ഏറ്റവും എളുപ്പം ആയ രീതി `[]` operator ഉപയോഗിച്ചുള്ളതാണ്.

```{code-cell} ipython3
df[df.POP >= 20000]
```

ഇവിടെ എന്താണ് നടക്കുന്നതെന്ന് മനസ്സിലാക്കാൻ, `df.POP >= 20000` ഒരു series ഓഫ് boolean values return ചെയ്യുന്നു എന്ന് ശ്രദ്ധിക്കുക.

```{code-cell} ipython3
df.POP >= 20000
```

ഈ case-ൽ, `df[___]`, boolean values-ന്റെ ഒരു series എടുത്ത്, `True` values ഉള്ള rows മാത്രം return ചെയ്യുന്നു.

ഒരു example കൂടി നോക്കാം,

```{code-cell} ipython3
df[(df.country.isin(['Argentina', 'India', 'South Africa'])) & (df.POP > 40000)]
```

എന്നിരുന്നാലും, ഇതേ കാര്യം ചെയ്യാൻ മറ്റൊരു വഴിയുണ്ട്, വലിയ dataframes-ന് കുറച്ചുകൂടി വേഗതയുള്ളതും, കൂടുതൽ natural ആയ syntax ഉള്ളതും ആയ ഒരു വഴി.

```{code-cell} ipython3
# the above is equivalent to 
df.query("POP >= 20000")
```

```{code-cell} ipython3
df.query("country in ['Argentina', 'India', 'South Africa'] and POP > 40000")
```

വ്യത്യസ്ത columns-ക്കിടയിൽ arithmetic operations-ഉം നമുക്ക് അനുവദിക്കാം.

```{code-cell} ipython3
df[(df.cc + df.cg >= 80) & (df.POP <= 20000)]
```

```{code-cell} ipython3
# the above is equivalent to 
df.query("cc + cg >= 80 & POP <= 20000")
```

For example, ഏറ്റവും വലിയ household consumption - gdp share (`cc`) ഉള്ള country select ചെയ്യാൻ, നമുക്ക് conditioning ഉപയോഗിക്കാം.

```{code-cell} ipython3
df.loc[df.cc == max(df.cc)]
```

select ചെയ്ത ഒരു sub-dataframe-ന്റെ ചില columns മാത്രം നോക്കണമെങ്കിൽ, മുകളിൽ പറഞ്ഞ conditions `.loc[__ , __]` command-ഉമായി ചേർത്ത് നമുക്ക് ഉപയോഗിക്കാം.

ആദ്യത്തെ argument condition എടുക്കുന്നു, രണ്ടാമത്തെ argument നമുക്ക് വേണ്ട columns-ന്റെ ഒരു list എടുക്കുന്നു.

```{code-cell} ipython3
df.loc[(df.cc + df.cg >= 80) & (df.POP <= 20000), ['country', 'year', 'POP']]
```

**Application: Subsetting Dataframe**

real-world datasets [enormous](https://developers.google.com/machine-learning/crash-course/overfitting) ആയിരിക്കാം.

computational efficiency ഉയർത്താനും redundancy കുറയ്ക്കാനും, data-യുടെ ഒരു subset ഉപയോഗിച്ച് work ചെയ്യുന്നത് ചിലപ്പോൾ നല്ലതാണ്.

`df` എന്ന data frame-ൽ നമുക്ക് population (`POP`)-ഉം total GDP (`tcgdp`)-ഉം മാത്രമേ താൽപ്പര്യമുള്ളൂ എന്ന് കരുതാം.

മുകളിൽ വിവരിച്ച selection method ഉപയോഗിച്ച് dataframe overwrite ചെയ്തുകൊണ്ട്, `df` എന്ന data frame-നെ ഈ variables മാത്രമാക്കി strip ചെയ്യാനുള്ള ഒരു വഴി താഴെ കാണാം:

```{code-cell} ipython3
df_subset = df[['country', 'POP', 'tcgdp']]
df_subset
```

പിന്നീട് കൂടുതൽ analysis-ന് വേണ്ടി ഈ ചെറിയ dataset നമുക്ക് save ചെയ്യാം.

```{code-block} python3
:class: no-execute

df_subset.to_csv('pwt_subset.csv', index=False)
```

### Apply Method

വ്യാപകമായി ഉപയോഗിക്കുന്ന മറ്റൊരു Pandas method ആണ് `df.apply()`.

ഇത്, ഓരോ row/column-ഇനും ഒരു function apply ചെയ്ത്, ഒരു series return ചെയ്യുന്നു.

ഈ function, `max` function പോലുള്ള ഒരു built-in function ആകാം, ഒരു `lambda` function ആകാം, അല്ലെങ്കിൽ ഒരു user-defined function ആകാം.

`max` function ഉപയോഗിച്ചുള്ള ഒരു example താഴെ കാണാം:

```{code-cell} ipython3
df[['year', 'POP', 'XRAT', 'tcgdp', 'cc', 'cg']].apply(max)
```

ഈ line of code, select ചെയ്ത എല്ലാ columns-ഇനും `max` function apply ചെയ്യുന്നു.

`df.apply()` method-നൊപ്പം `lambda` function പലപ്പോഴും ഉപയോഗിക്കാറുണ്ട്.

dataframe-ലെ ഓരോ row-ഇനും അതുതന്നെ return ചെയ്യുന്ന ഒരു trivial ആയ example:

```{code-cell} ipython3
df.apply(lambda row: row, axis=1)
```

```{note}
`.apply()` method-ൽ
- axis = 0 -- ഓരോ column-ഇനും (variables) function apply ചെയ്യുന്നു
- axis = 1 -- ഓരോ row-ഇനും (observations) function apply ചെയ്യുന്നു
- axis = 0 ആണ് default parameter
```

കുറച്ചുകൂടി advanced ആയ selection ചെയ്യാൻ, `.loc[]`-ഉമായി ചേർത്ത് നമുക്ക് ഇത് ഉപയോഗിക്കാം.

```{code-cell} ipython3
complexCondition = df.apply(
    lambda row: row.POP > 40000 if row.country in ['Argentina', 'India', 'South Africa'] else row.POP < 20000, 
    axis=1), ['country', 'year', 'POP', 'XRAT', 'tcgdp']
```

ഇവിടെ `df.apply()`, if-else statement-ൽ specify ചെയ്തിരിക്കുന്ന condition satisfy ചെയ്യുന്ന rows-ന്റെ boolean values-ന്റെ ഒരു series return ചെയ്യുന്നു.

ഇതുകൂടാതെ, താൽപ്പര്യമുള്ള variables-ന്റെ ഒരു subset-ഉം ഇത് define ചെയ്യുന്നു.

```{code-cell} ipython3
complexCondition
```

ഈ condition dataframe-ൽ apply ചെയ്യുമ്പോൾ, result ഇതായിരിക്കും:

```{code-cell} ipython3
df.loc[complexCondition]
```

### Make Changes in DataFrames

ഭാവിയിലെ analysis-ന് വേണ്ടി ഒരു clean dataset generate ചെയ്യാൻ, dataframes-ൽ changes വരുത്താനുള്ള കഴിവ് പ്രധാനമാണ്.

**1.** select ചെയ്ത rows "keep" ചെയ്യാനും, ബാക്കി rows `NaN` ആയി replace ചെയ്യാനും, `df.where()` സൗകര്യപ്രദമായി ഉപയോഗിക്കാം:

```{code-cell} ipython3
df.where(df.POP >= 20000)
```

**2.** modify ചെയ്യേണ്ട column specify ചെയ്യാനും, values assign ചെയ്യാനും, നമുക്ക് `.loc[]` ഉപയോഗിക്കാം:

```{code-cell} ipython3
df.loc[df.cg == max(df.cg), 'cg'] = np.nan
df
```

**3.** *rows/columns ആയി മൊത്തത്തിൽ* modify ചെയ്യാൻ, `.apply()` method ഉപയോഗിക്കാം:

```{code-cell} ipython3
def update_row(row):
    # modify POP
    row.POP = np.nan if row.POP<= 10000 else row.POP

    # modify XRAT
    row.XRAT = row.XRAT / 10
    return row

df.apply(update_row, axis=1)
```

**4.** dataframe-ലെ എല്ലാ *individual entries*-ഉം ഒരുമിച്ച് modify ചെയ്യാൻ, `.map()` method ഉപയോഗിക്കാം.

```{code-cell} ipython3
# Round all decimal numbers to 2 decimal places
df.map(lambda x : round(x,2) if not isinstance(x, str) else x)
```

**Application: Missing Value Imputation**

Data munging-ൽ missing values replace ചെയ്യുന്നത് ഒരു പ്രധാന step ആണ്.

നമുക്ക് randomly ചില NaN values insert ചെയ്യാം:

```{code-cell} ipython3
for idx in list(zip([0, 3, 5, 6], [3, 4, 6, 2])):
    df.iloc[idx] = np.nan

df
```

ഇവിടെ `zip()` function, രണ്ട് lists-ൽ നിന്നും values-ന്റെ pairs create ചെയ്യുന്നു (i.e. [0,3], [3,4] ...).

എല്ലാ missing values-ഉം 0 ആയി replace ചെയ്യാൻ, നമുക്ക് വീണ്ടും `.map()` method ഉപയോഗിക്കാം:

```{code-cell} ipython3
# replace all NaN values by 0
def replace_nan(x):
    if not isinstance(x, str):
        return  0 if pd.isna(x) else x
    else:
        return x

df.map(replace_nan)
```

missing values replace ചെയ്യാനുള്ള സൗകര്യപ്രദമായ methods-ഉം pandas നമുക്ക് നൽകുന്നു.

For example, variable means ഉപയോഗിച്ചുള്ള single imputation, pandas-ൽ എളുപ്പം ചെയ്യാവുന്നതാണ്:

```{code-cell} ipython3
df = df.fillna(df.iloc[:,2:8].mean())
df
```

Missing value imputation എന്നത്, വിവിധ machine learning techniques ഉൾപ്പെടുന്ന, data science-ലെ ഒരു വലിയ മേഖലയാണ്.

missing values impute ചെയ്യാൻ python-ൽ [advanced tools](https://scikit-learn.org/stable/modules/impute.html)-ഉം ഉണ്ട്.

### Standardization and Visualization

`df` എന്ന data frame-ൽ നമുക്ക് population (`POP`)-ഉം total GDP (`tcgdp`)-ഉം മാത്രമേ താൽപ്പര്യമുള്ളൂ എന്ന് കരുതാം.

മുകളിൽ വിവരിച്ച selection method ഉപയോഗിച്ച് dataframe overwrite ചെയ്തുകൊണ്ട്, `df` എന്ന data frame-നെ ഈ variables മാത്രമാക്കി strip ചെയ്യാനുള്ള ഒരു വഴി താഴെ കാണാം:

```{code-cell} ipython3
df = df[['country', 'POP', 'tcgdp']]
df
```

country names-നെ ഒരു index ആയി ഉപയോഗിക്കാൻ കഴിയുന്നതിനാൽ, ഇവിടെ `0, 1,..., 7` എന്ന index redundant ആണ്.

ഇത് ചെയ്യാൻ, dataframe-ലെ `country` variable-നെ നമുക്ക് index ആയി set ചെയ്യാം:

```{code-cell} ipython3
df = df.set_index('country')
df
```

columns-ന് കുറച്ചുകൂടി നല്ല names നൽകാം:

```{code-cell} ipython3
df.columns = 'population', 'total GDP'
df
```

`population` variable thousands-ൽ ആണ്, നമുക്ക് single units ആയി തിരിച്ച് മാറ്റാം:

```{code-cell} ipython3
df['population'] = df['population'] * 1e3
df
```

അടുത്തതായി, real GDP per capita കാണിക്കുന്ന ഒരു column നമുക്ക് ചേർക്കാം. total GDP millions-ൽ ആയതിനാൽ, 1,000,000 കൊണ്ട് multiply ചെയ്യുന്നു:

```{code-cell} ipython3
df['GDP percap'] = df['total GDP'] * 1e6 / df['population']
df
```

pandas-ന്റെ `DataFrame`-ഉം `Series` objects-ഉം ഉള്ള നല്ല കാര്യങ്ങളിൽ ഒന്ന്, Matplotlib വഴി work ചെയ്യുന്ന plotting-ന്റെയും visualization-ന്റെയും methods അവയ്ക്ക് ഉണ്ട് എന്നതാണ്.

For example, GDP per capita-യുടെ ഒരു bar plot നമുക്ക് എളുപ്പത്തിൽ generate ചെയ്യാം:

```{code-cell} ipython3
ax = df['GDP percap'].plot(kind='bar')
ax.set_xlabel('country', fontsize=12)
ax.set_ylabel('GDP per capita', fontsize=12)
plt.show()
```

നിലവിൽ data frame countries-ന്റെ അടിസ്ഥാനത്തിൽ alphabetically ആയി order ചെയ്തിരിക്കുന്നു --- നമുക്ക് ഇത് GDP per capita അനുസരിച്ച് മാറ്റാം:

```{code-cell} ipython3
df = df.sort_values(by='GDP percap', ascending=False)
df
```

മുമ്പത്തെ പോലെ plot ചെയ്യുമ്പോൾ ഇപ്പോൾ താഴെ കാണുന്ന result ലഭിക്കുന്നു:

```{code-cell} ipython3
ax = df['GDP percap'].plot(kind='bar')
ax.set_xlabel('country', fontsize=12)
ax.set_ylabel('GDP per capita', fontsize=12)
plt.show()
```

## On-Line Data Sources

```{index} single: Data Sources
```

Online databases-നെ programmatically query ചെയ്യുന്നത് Python വളരെ എളുപ്പമാക്കുന്നു.

economists-ന് വേണ്ടിയുള്ള ഒരു പ്രധാന database ആണ് [FRED](https://fred.stlouisfed.org/) --- St. Louis Fed maintain ചെയ്യുന്ന time series data-യുടെ ഒരു വലിയ collection.

For example, [unemployment rate](https://fred.stlouisfed.org/series/UNRATE)-ൽ നമുക്ക് താൽപ്പര്യമുണ്ട് എന്ന് കരുതാം.

(data-യെ ഒരു csv ആയി download ചെയ്യാൻ, മുകളിൽ വലത് വശത്തുള്ള `Download` click ചെയ്ത്, `CSV (data)` എന്ന option select ചെയ്യുക.)

പകരം, ഒരു Python program-നുള്ളിൽ നിന്നും നമുക്ക് CSV file access ചെയ്യാം.

ഇത് വിവിധ methods ഉപയോഗിച്ച് ചെയ്യാവുന്നതാണ്.

താരതമ്യേന low-level ആയ ഒരു method ഉപയോഗിച്ച് നമുക്ക് തുടങ്ങാം, പിന്നീട് pandas-ലേക്ക് തിരികെ വരാം.

### Accessing Data with {index}`requests <single: requests>`

```{index} single: Python; requests
```

Internet-ൽ നിന്നും data request ചെയ്യാനുള്ള standard ആയ ഒരു Python library ആയ [requests](https://requests.readthedocs.io/en/latest/) ഉപയോഗിക്കുന്നതാണ് ഒരു option.

തുടങ്ങാൻ, നിങ്ങളുടെ computer-ൽ താഴെ പറയുന്ന code try ചെയ്യുക:

```{code-cell} ipython3
r = requests.get('https://fred.stlouisfed.org/graph/fredgraph.csv?bgcolor=%23e1e9f0&chart_type=line&drp=0&fo=open%20sans&graph_bgcolor=%23ffffff&height=450&mode=fred&recession_bars=on&txtcolor=%23444444&ts=12&tts=12&width=1318&nt=0&thu=0&trc=0&show_legend=yes&show_axis_titles=yes&show_tooltip=yes&id=UNRATE&scale=left&cosd=1948-01-01&coed=2024-06-01&line_color=%234572a7&link_values=false&line_style=solid&mark_type=none&mw=3&lw=2&ost=-99999&oet=99999&mma=0&fml=a&fq=Monthly&fam=avg&fgst=lin&fgsnd=2020-02-01&line_index=1&transformation=lin&vintage_date=2024-07-29&revision_date=2024-07-29&nd=1948-01-01')
```

error message ഒന്നും ഇല്ലെങ്കിൽ, call succeed ആയി എന്നർത്ഥം.

നിങ്ങൾക്ക് ഒരു error ലഭിച്ചാൽ, സാധ്യതയുള്ള രണ്ട് കാരണങ്ങൾ ഇവയാണ്:

1. നിങ്ങൾ Internet-ഇലേക്ക് connect ആയിട്ടില്ല --- ഇത് ആയിരിക്കില്ല എന്ന് പ്രതീക്ഷിക്കുന്നു.
1. നിങ്ങളുടെ machine ഒരു proxy server വഴിയാണ് Internet access ചെയ്യുന്നത്, ഇത് Python-ന് അറിയില്ല.

രണ്ടാമത്തെ case-ൽ, നിങ്ങൾക്ക്:

* മറ്റൊരു machine-ഇലേക്ക് മാറാം
* [the documentation](https://requests.readthedocs.io/en/latest/) read ചെയ്ത്, നിങ്ങളുടെ proxy problem പരിഹരിക്കാം

എല്ലാം ശരിയായി work ചെയ്യുന്നു എന്ന് കരുതിയാൽ, `requests.get(url)` എന്ന call return ചെയ്യുന്ന data-യിൽ നിന്നും `source` object build ചെയ്യാൻ നിങ്ങൾക്ക് ഇപ്പോൾ തുടരാം:

```{code-cell} ipython3
url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?bgcolor=%23e1e9f0&chart_type=line&drp=0&fo=open%20sans&graph_bgcolor=%23ffffff&height=450&mode=fred&recession_bars=on&txtcolor=%23444444&ts=12&tts=12&width=1318&nt=0&thu=0&trc=0&show_legend=yes&show_axis_titles=yes&show_tooltip=yes&id=UNRATE&scale=left&cosd=1948-01-01&coed=2024-06-01&line_color=%234572a7&link_values=false&line_style=solid&mark_type=none&mw=3&lw=2&ost=-99999&oet=99999&mma=0&fml=a&fq=Monthly&fam=avg&fgst=lin&fgsnd=2020-02-01&line_index=1&transformation=lin&vintage_date=2024-07-29&revision_date=2024-07-29&nd=1948-01-01'
source = requests.get(url).content.decode().split("\n")
source[0]
```

```{code-cell} ipython3
source[1]
```

```{code-cell} ipython3
source[2]
```

ഈ text parse ചെയ്ത് ഒരു array ആയി store ചെയ്യാൻ, നമുക്ക് ഇപ്പോൾ additional ആയ കുറച്ച് code എഴുതാം.

പക്ഷേ ഇത് ആവശ്യമില്ല --- pandas-ന്റെ `read_csv` function ഈ task നമുക്ക് വേണ്ടി handle ചെയ്യും.

pandas നമ്മുടെ dates column recognize ചെയ്യാനും, simple ആയ date filtering സാധ്യമാക്കാനും, നമ്മൾ `parse_dates=True` ഉപയോഗിക്കുന്നു:

```{code-cell} ipython3
data = pd.read_csv(url, index_col=0, parse_dates=True)
```

ഇപ്പോൾ നമുക്ക് സാധാരണ രീതിയിൽ manipulate ചെയ്യാവുന്ന `data` എന്ന pandas DataFrame-ലേക്ക് data read ചെയ്യപ്പെട്ടിരിക്കുന്നു:

```{code-cell} ipython3
type(data)
```

```{code-cell} ipython3
data.head()  # A useful method to get a quick look at a data frame
```

```{code-cell} ipython3
pd.set_option('display.precision', 1)
data.describe()  # Your output might differ slightly
```

നമുക്ക് 2006 മുതൽ 2012 വരെയുള്ള unemployment rate-ഉം താഴെ പറയുന്ന രീതിയിൽ plot ചെയ്യാം:

```{code-cell} ipython3
ax = data['2006':'2012'].plot(title='US Unemployment Rate', legend=False)
ax.set_xlabel('year', fontsize=12)
ax.set_ylabel('%', fontsize=12)
plt.show()
```

pandas മറ്റ് പല file type alternatives-ഉം നൽകുന്നു എന്ന് ശ്രദ്ധിക്കുക.

excel, json, parquet read ചെയ്യാനോ, അല്ലെങ്കിൽ ഒരു database server-ലേക്ക് നേരിട്ട് plug ചെയ്യാനോ നമുക്ക് ഉപയോഗിക്കാവുന്ന [a wide variety](https://pandas.pydata.org/pandas-docs/stable/user_guide/io.html) ഓഫ് top-level methods pandas-ന് ഉണ്ട്.

### Using {index}`wbgapi <single: wbgapi>` and {index}`yfinance <single: yfinance>` to Access Data

World Bank publish ചെയ്യുന്ന പല databases-ൽ നിന്നും data fetch ചെയ്യാൻ [wbgapi](https://pypi.org/project/wbgapi/) എന്ന python library ഉപയോഗിക്കാം.

```{note}
ഈ [world bank blog post](https://blogs.worldbank.org/en/opendata/introducing-wbgapi-new-python-package-accessing-world-bank-data)-ൽ, ഇതുകൂടാതെ ഈ [tutorial](https://github.com/tgherzog/wbgapi/blob/master/examples/wbgapi-quickstart.ipynb)-ലും, [wbgapi](https://pypi.org/project/wbgapi/) package-നെക്കുറിച്ചുള്ള useful ആയ ചില information നിങ്ങൾക്ക് കാണാം
```

Exercises-ൽ, Yahoo finance-ൽ നിന്നും data fetch ചെയ്യാൻ നമ്മൾ [yfinance](https://pypi.org/project/yfinance/)-ഉം ഉപയോഗിക്കും.

ഇപ്പോൾ, data download ചെയ്ത് plot ചെയ്യുന്ന ഒരു example നമുക്ക് നോക്കാം --- ഇത്തവണ World Bank-ൽ നിന്നും.

ധാരാളം indicators-നെക്കുറിച്ചുള്ള data World Bank [collect ചെയ്ത് organize ചെയ്യുന്നു](https://data.worldbank.org/indicator).

For example, GDP-യുടെ ratio ആയ government debt-നെക്കുറിച്ചുള്ള ചില data [ഇവിടെ](https://data.worldbank.org/indicator/GC.DOD.TOTL.GD.ZS) കാണാം.

അടുത്ത code example നിങ്ങൾക്ക് വേണ്ടി data fetch ചെയ്ത്, US-ന്റെയും Australia-യുടെയും time series plot ചെയ്യുന്നു:

```{code-cell} ipython3
import wbgapi as wb
wb.series.info('GC.DOD.TOTL.GD.ZS')
```

```{code-cell} ipython3
govt_debt = wb.data.DataFrame('GC.DOD.TOTL.GD.ZS', economy=['USA','AUS'], time=range(2005,2016))
govt_debt = govt_debt.T    # move years from columns to rows for plotting
```

```{code-cell} ipython3
govt_debt.plot(xlabel='year', ylabel='Government debt (% of GDP)');
```

## Exercises

```{exercise-start}
:label: pd_ex1
```

With these imports:

```{code-cell} ipython3
import datetime as dt
import yfinance as yf
```

Write a program to calculate the percentage price change over 2021 for the following shares:

```{code-cell} ipython3
ticker_list = {'INTC': 'Intel',
               'MSFT': 'Microsoft',
               'IBM': 'IBM',
               'BHP': 'BHP',
               'TM': 'Toyota',
               'AAPL': 'Apple',
               'AMZN': 'Amazon',
               'C': 'Citigroup',
               'QCOM': 'Qualcomm',
               'KO': 'Coca-Cola',
               'GOOG': 'Google'}
```

Here's the first part of the program

```{code-cell} ipython3
def read_data(ticker_list,
          start=dt.datetime(2021, 1, 1),
          end=dt.datetime(2021, 12, 31)):
    """
    This function reads in closing price data from Yahoo
    for each tick in the ticker_list.
    """
    ticker = pd.DataFrame()

    for tick in ticker_list:
        stock = yf.Ticker(tick)
        prices = stock.history(start=start, end=end)

        # Change the index to date-only
        prices.index = pd.to_datetime(prices.index.date)
        
        closing_prices = prices['Close']
        ticker[tick] = closing_prices

    return ticker

ticker = read_data(ticker_list)
```

Complete the program to plot the result as a bar graph like this one:

```{image} /_static/lecture_specific/pandas/pandas_share_prices.png
:scale: 80
:align: center
```

```{exercise-end}
```

```{solution-start} pd_ex1
:class: dropdown
```

There are a few ways to approach this problem using Pandas to calculate
the percentage change.

First, you can extract the data and perform the calculation such as:

```{code-cell} ipython3
p1 = ticker.iloc[0]    #Get the first set of prices as a Series
p2 = ticker.iloc[-1]   #Get the last set of prices as a Series
price_change = (p2 - p1) / p1 * 100
price_change
```

Alternatively you can use an inbuilt method `pct_change` and configure it to
perform the correct calculation using `periods` argument.

```{code-cell} ipython3
change = ticker.pct_change(periods=len(ticker)-1, axis='rows')*100
price_change = change.iloc[-1]
price_change
```

Then to plot the chart

```{code-cell} ipython3
price_change.sort_values(inplace=True)
price_change.rename(index=ticker_list, inplace=True)
```

```{code-cell} ipython3
fig, ax = plt.subplots(figsize=(10,8))
ax.set_xlabel('stock', fontsize=12)
ax.set_ylabel('percentage change in price', fontsize=12)
price_change.plot(kind='bar', ax=ax)
plt.show()
```

```{solution-end}
```


```{exercise-start}
:label: pd_ex2
```

Using the method `read_data` introduced in {ref}`pd_ex1`, write a program to obtain year-on-year percentage change for the following indices:

```{code-cell} ipython3
indices_list = {'^GSPC': 'S&P 500',
               '^IXIC': 'NASDAQ',
               '^DJI': 'Dow Jones',
               '^N225': 'Nikkei'}
```

Complete the program to show summary statistics and plot the result as a time series graph like this one:

```{image} /_static/lecture_specific/pandas/pandas_indices_pctchange.png
:scale: 80
:align: center
```

```{exercise-end}
```

```{solution-start} pd_ex2
:class: dropdown
```

Following the work you did in {ref}`pd_ex1`, you can query the data using `read_data` by updating the start and end dates accordingly.

```{code-cell} ipython3
indices_data = read_data(
        indices_list,
        start=dt.datetime(1971, 1, 1),  #Common Start Date
        end=dt.datetime(2021, 12, 31)
)
```

Then, extract the first and last set of prices per year as DataFrames and calculate the yearly returns such as:

```{code-cell} ipython3
yearly_returns = pd.DataFrame()

for index, name in indices_list.items():
    p1 = indices_data.groupby(indices_data.index.year)[index].first()  # Get the first set of returns as a DataFrame
    p2 = indices_data.groupby(indices_data.index.year)[index].last()   # Get the last set of returns as a DataFrame
    returns = (p2 - p1) / p1
    yearly_returns[name] = returns

yearly_returns
```

Next, you can obtain summary statistics by using the method `describe`.

```{code-cell} ipython3
yearly_returns.describe()
```

Then, to plot the chart

```{code-cell} ipython3
fig, axes = plt.subplots(2, 2, figsize=(10, 8))

for iter_, ax in enumerate(axes.flatten()):            # Flatten 2-D array to 1-D array
    index_name = yearly_returns.columns[iter_]         # Get index name per iteration
    ax.plot(yearly_returns[index_name])                # Plot pct change of yearly returns per index
    ax.set_ylabel("percent change", fontsize = 12)
    ax.set_title(index_name)

plt.tight_layout()
```

```{solution-end}
```

[^mung]: Wikipedia defines munging as cleaning data from one raw form into a structured, purged one.
