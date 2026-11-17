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

Anaconda-യിൽ ഉള്ളതിന് പുറമേ, ഈ lecture-ന് താഴെ പറയുന്ന libraries ആവശ്യമായിവരുന്നു:

```{code-cell} ipython3
:tags: [hide-output]

!pip install --upgrade wbgapi
!pip install --upgrade yfinance
```

## Overview

[Pandas](https://pandas.pydata.org/) എന്നത്, Python-നുള്ള വേഗതയേറിയതും efficient-ഉം ആയ data analysis tools-ന്റെ ഒരു package ആണ്.

Data science, machine learning തുടങ്ങിയ മേഖലകളുടെ വളർച്ചയ്‌ക്കൊപ്പം, സമീപ വർഷങ്ങളിൽ ഇതിന്റെ popularity ഗണ്യമായി ഉയർന്നിട്ടുണ്ട്.

Stack Overflow Trends-ന്റെ സഹായത്തോടെ, Matlab, STATA എന്നിവയുമായി comparison ചെയ്യുന്ന ഒരു popularity comparison താഴെ കാണാം:

```{figure} /_static/lecture_specific/pandas/pandas_vs_rest.png
:scale: 100
```

[NumPy](https://numpy.org/), അടിസ്ഥാന array data type-ഉം core array operations-ഉം നൽകുന്നത് പോലെ, pandas

1. data-യുമായി work ചെയ്യാനുള്ള fundamental structures-നെ define ചെയ്യുന്നു, ഒപ്പം
1. താഴെപ്പറയുന്ന operations-നെ സഹായിക്കുന്ന methods-ഉം നൽകുന്നു
    * data read in ചെയ്യുക
    * indices adjust ചെയ്യുക
    * dates-ഉം time series-ഉം ആയി work ചെയ്യുക
    * sorting, grouping, re-ordering, ഒപ്പം സാധാരണ data munging [^mung]
    * missing values മുതലായവ കൈകാര്യം ചെയ്യുക

കൂടുതൽ sophisticated ആയ statistical functionality, pandas-ന് മുകളിൽ build ചെയ്തിരിക്കുന്ന [statsmodels](https://www.statsmodels.org/), [scikit-learn](https://scikit-learn.org/) പോലുള്ള മറ്റ് packages-ൽ ലഭ്യമാണ്.

ഈ lecture pandas-നെക്കുറിച്ചുള്ള ഒരു basic introduction നൽകുന്നു.

ഈ lecture-ൽ ഉടനീളം, താഴെ കൊടുത്തിരിക്കുന്ന imports നടന്നിട്ടുണ്ടെന്ന് നമുക്ക് assume ചെയ്യാം:

```{code-cell} ipython3
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import requests
```

pandas define ചെയ്യുന്ന രണ്ട് പ്രധാനപ്പെട്ട data types ആണ് `Series`, `DataFrame` എന്നിവ.

ഒരു `Series`-നെ data-യുടെ ഒരു "column" ആയി കരുതാം, ഉദാഹരണത്തിന് ഒരു single variable-നെക്കുറിച്ചുള്ള observations-ന്റെ ഒരു collection.

ബന്ധപ്പെട്ട data columns store ചെയ്യാനുള്ള ഒരു two-dimensional object ആണ് `DataFrame`.

## Series

```{index} single: Pandas; Series
```

നമുക്ക് Series-ൽ നിന്നും തുടങ്ങാം.

നാല് random observations ഉള്ള ഒരു series create ചെയ്തുകൊണ്ട് നമുക്ക് തുടങ്ങാം:

```{code-cell} ipython3
rng = np.random.default_rng()
s = pd.Series(rng.standard_normal(4), name='daily returns')
s
```

ഇവിടെ `0, 1, 2, 3` എന്ന indices നാല് listed companies-നെ index ചെയ്യുന്നതായും, ആ values അവയുടെ shares-ന്റെ daily returns ആയും നിങ്ങൾക്ക് സങ്കൽപ്പിക്കാം.

Pandas-ലെ `Series`, NumPy arrays-ന് മുകളിൽ build ചെയ്തിരിക്കുന്നതിനാൽ അതുപോലെയുള്ള പല operations-ഉം support ചെയ്യുന്നു:

```{code-cell} ipython3
s * 100
```

```{code-cell} ipython3
np.abs(s)
```

എന്നാൽ `Series`, NumPy arrays-നേക്കാൾ കൂടുതൽ features നൽകുന്നു.

(statistically oriented ആയ) ചില additional methods അവയ്ക്ക് ഉണ്ടെന്ന് മാത്രമല്ല:

```{code-cell} ipython3
s.describe()
```

അവയുടെ indices കൂടുതൽ flexible ആണ്:

```{code-cell} ipython3
s.index = ['AMZN', 'AAPL', 'MSFT', 'GOOG']
s
```

ഈ രീതിയിൽ നോക്കുമ്പോൾ, `Series`, വേഗതയേറിയതും efficient-ഉം ആയ Python dictionaries പോലെയാണ് (dictionary-യിലെ items എല്ലാം ഒരേ type ആയിരിക്കണം എന്ന നിയന്ത്രണത്തോടെ---ഇവിടെ floats).

വാസ്തവത്തിൽ, Python dictionaries-ൽ ഉപയോഗിക്കുന്ന syntax തന്നെ ഇവിടെയും ഉപയോഗിക്കാം:

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

ഒരു `Series`, data-യുടെ ഒരു single column ആണെങ്കിൽ, ഒരു `DataFrame` ഓരോ variable-ഇനും ഓരോ column എന്ന രീതിയിൽ, പല columns-ഉള്ളതാണ്.

In essence, pandas-ലെ ഒരു `DataFrame`, (highly optimized ആയ) ഒരു Excel spreadsheet-ന് സമാനമാണ്.

അതിനാൽ, rows-ലേക്കും columns-ലേക്കും സ്വാഭാവികമായി organize ചെയ്യപ്പെട്ടിരിക്കുന്ന data represent ചെയ്യാനും analyze ചെയ്യാനും ഇത് ശക്തമായ ഒരു tool ആണ്, individual rows-ഇനും individual columns-ഇനും വേണ്ടി descriptive indexes ഉപയോഗിച്ച്.

[Penn World Tables](https://www.rug.nl/ggdc/productivity/pwt/pwt-releases/pwt-7.0)-ൽ നിന്നും എടുത്തിരിക്കുന്ന `test_pwt.csv` എന്ന CSV file-ൽ നിന്നും data read ചെയ്യുന്ന ഒരു example നമുക്ക് നോക്കാം.

താഴെ പറയുന്ന indicators ഈ dataset-ൽ ഉൾപ്പെടുന്നു:

| Variable Name | Description |
| :-: | :-: |
| POP | Population (in thousands) |
| XRAT | Exchange Rate to US Dollar |                     
| tcgdp | Total PPP Converted GDP (in million international dollar) |
| cc | Consumption Share of PPP Converted GDP Per Capita (%) |
| cg | Government Consumption Share of PPP Converted GDP Per Capita (%) |

`pandas`-ലെ `read_csv` എന്ന function ഉപയോഗിച്ച് നമുക്ക് ഇത് ഒരു URL-ൽ നിന്നും read ചെയ്യാം.

```{code-cell} ipython3
df = pd.read_csv('https://github.com/QuantEcon/data-lectures/raw/main/lectures/test_pwt.csv')
type(df)
```

`test_pwt.csv`-യുടെ content താഴെ കാണാം:

```{code-cell} ipython3
df
```

### Select Data by Position

പ്രായോഗികമായി, നമ്മൾ എപ്പോഴും ചെയ്യുന്ന ഒരു കാര്യം, നമ്മുടെ താല്പര്യത്തിനനുസരിച്ച് data-യുടെ ഒരു subset കണ്ടെത്തി, select ചെയ്ത്, അതുമായി work ചെയ്യുക എന്നതാണ്.

സാധാരണ Python array slicing notation ഉപയോഗിച്ച് നമുക്ക് പ്രത്യേക rows select ചെയ്യാം:

```{code-cell} ipython3
df[2:5]
```

columns select ചെയ്യാൻ, ആവശ്യമുള്ള columns-ന്റെ names, strings ആയി ഉള്ള ഒരു list pass ചെയ്യാം:

```{code-cell} ipython3
df[['country', 'tcgdp']]
```

integers ഉപയോഗിച്ച് rows-ഉം columns-ഉം select ചെയ്യാൻ, `.iloc[rows, columns]` എന്ന format-ൽ `iloc` attribute ഉപയോഗിക്കണം.

```{code-cell} ipython3
df.iloc[2:5, 0:4]
```

integers-ഉം labels-ഉം combine ചെയ്ത് rows-ഉം columns-ഉം select ചെയ്യാൻ, സമാനമായ രീതിയിൽ `loc` attribute ഉപയോഗിക്കാം:

```{code-cell} ipython3
df.loc[df.index[2:5], ['country', 'tcgdp']]
```

### Select Data by Conditions

integers-ഉം names-ഉം ഉപയോഗിച്ച് rows-ഉം columns-ഉം index ചെയ്യുന്നതിന് പകരം, നിശ്ചിത (ഒരുപക്ഷേ complicated ആയ) conditions satisfy ചെയ്യുന്ന ഒരു sub-dataframe-ഉം നമുക്ക് നേടാം.

ഇത് ചെയ്യാനുള്ള പല വഴികൾ ഈ section-ൽ കാണിക്കുന്നു.

ഏറ്റവും എളുപ്പമുള്ള വഴി `[]` operator ഉപയോഗിക്കുന്നതാണ്.

```{code-cell} ipython3
df[df.POP >= 20000]
```

ഇവിടെ എന്താണ് നടക്കുന്നതെന്ന് മനസ്സിലാക്കാൻ, `df.POP >= 20000` boolean values-ന്റെ ഒരു series return ചെയ്യുന്നു എന്ന് ശ്രദ്ധിക്കുക.

```{code-cell} ipython3
df.POP >= 20000
```

ഈ case-ൽ, `df[___]`, boolean values-ന്റെ ഒരു series എടുത്ത്, `True` values ഉള്ള rows മാത്രം return ചെയ്യുന്നു.

ഒരു example കൂടി നോക്കാം:

```{code-cell} ipython3
df[(df.country.isin(['Argentina', 'India', 'South Africa'])) & (df.POP > 40000)]
```

എന്നിരുന്നാലും, വലിയ dataframes-ൽ അൽപ്പം വേഗതയേറിയതും, കൂടുതൽ natural ആയ syntax-ഉള്ളതുമായ, ഇതേ കാര്യം ചെയ്യാനുള്ള മറ്റൊരു വഴിയുണ്ട്.

```{code-cell} ipython3
# the above is equivalent to 
df.query("POP >= 20000")
```

```{code-cell} ipython3
df.query("country in ['Argentina', 'India', 'South Africa'] and POP > 40000")
```

വ്യത്യസ്ത columns-ക്കിടയിൽ arithmetic operations-ഉം നമുക്ക് നടത്താം.

```{code-cell} ipython3
df[(df.cc + df.cg >= 80) & (df.POP <= 20000)]
```

```{code-cell} ipython3
# the above is equivalent to 
df.query("cc + cg >= 80 & POP <= 20000")
```

For example, ഏറ്റവും കൂടുതൽ household consumption - gdp share (`cc`) ഉള്ള country select ചെയ്യാൻ നമുക്ക് conditioning ഉപയോഗിക്കാം.

```{code-cell} ipython3
df.loc[df.cc == max(df.cc)]
```

select ചെയ്തിരിക്കുന്ന ഒരു sub-dataframe-ന്റെ നിശ്ചിത columns മാത്രം നോക്കണമെങ്കിൽ, മുകളിലുള്ള conditions-നോടൊപ്പം `.loc[__ , __]` command ഉപയോഗിക്കാം.

ആദ്യത്തെ argument condition എടുക്കുന്നു, രണ്ടാമത്തെ argument നമുക്ക് return വേണ്ട columns-ന്റെ ഒരു list എടുക്കുന്നു.

```{code-cell} ipython3
df.loc[(df.cc + df.cg >= 80) & (df.POP <= 20000), ['country', 'year', 'POP']]
```

**Application: Subsetting Dataframe**

Real-world datasets [വളരെ വലുതായിരിക്കാം](https://developers.google.com/machine-learning/crash-course/overfitting).

computational efficiency മെച്ചപ്പെടുത്താനും redundancy കുറയ്ക്കാനും, data-യുടെ ഒരു subset ഉപയോഗിച്ച് work ചെയ്യുന്നത് ചിലപ്പോൾ നല്ലതായിരിക്കും.

population (`POP`), total GDP (`tcgdp`) എന്നിവയിൽ മാത്രമാണ് നമുക്ക് താല്പര്യം എന്ന് കരുതുക.

മുകളിൽ വിവരിച്ച selection method ഉപയോഗിച്ച് dataframe-നെ overwrite ചെയ്തുകൊണ്ട്, `df` എന്ന data frame-നെ ഈ variables മാത്രമായി ചുരുക്കാനുള്ള ഒരു വഴി താഴെ കാണാം:

```{code-cell} ipython3
df_subset = df[['country', 'POP', 'tcgdp']]
df_subset
```

കൂടുതൽ analysis-ന് വേണ്ടി ഈ ചെറിയ dataset-നെ നമുക്ക് save ചെയ്യാം.

```{code-block} python3
:class: no-execute

df_subset.to_csv('pwt_subset.csv', index=False)
```

### Apply Method

വ്യാപകമായി ഉപയോഗിക്കുന്ന മറ്റൊരു Pandas method ആണ് `df.apply()`.

ഇത് ഓരോ row/column-ഇനും ഒരു function apply ചെയ്ത്, ഒരു series return ചെയ്യുന്നു.

`max` function പോലുള്ള ഒരു built-in function, ഒരു `lambda` function, അല്ലെങ്കിൽ ഒരു user-defined function ഈ function ആകാം.

`max` function ഉപയോഗിക്കുന്ന ഒരു example താഴെ കാണാം:

```{code-cell} ipython3
df[['year', 'POP', 'XRAT', 'tcgdp', 'cc', 'cg']].apply(max)
```

select ചെയ്തിരിക്കുന്ന എല്ലാ columns-ഇനും ഈ line of code `max` function apply ചെയ്യുന്നു.

`df.apply()` method-നോടൊപ്പം `lambda` function പലപ്പോഴും ഉപയോഗിക്കാറുണ്ട്.

dataframe-ലെ ഓരോ row-ഇനും അതുതന്നെ return ചെയ്യുന്നതാണ് ഒരു trivial example:

```{code-cell} ipython3
df.apply(lambda row: row, axis=1)
```

```{note}
`.apply()` method-ന്:
- axis = 0 -- ഓരോ column-ഇനും (variables) function apply ചെയ്യുന്നു
- axis = 1 -- ഓരോ row-ഇനും (observations) function apply ചെയ്യുന്നു
- axis = 0 ആണ് default parameter
```

കൂടുതൽ advanced ആയ selection ചെയ്യാൻ, ഇത് `.loc[]`-ഉമായി ചേർത്ത് ഉപയോഗിക്കാം.

```{code-cell} ipython3
complexCondition = df.apply(
    lambda row: row.POP > 40000 if row.country in ['Argentina', 'India', 'South Africa'] else row.POP < 20000, 
    axis=1), ['country', 'year', 'POP', 'XRAT', 'tcgdp']
```

if-else statement-ൽ specify ചെയ്തിരിക്കുന്ന condition satisfy ചെയ്യുന്ന rows-ന്റെ boolean values-ന്റെ ഒരു series ഇവിടെ `df.apply()` return ചെയ്യുന്നു.

ഇതിന് പുറമേ, താല്പര്യമുള്ള variables-ന്റെ ഒരു subset-ഉം ഇത് define ചെയ്യുന്നു.

```{code-cell} ipython3
complexCondition
```

ഈ condition dataframe-ൽ apply ചെയ്യുമ്പോൾ, result ഇതായിരിക്കും:

```{code-cell} ipython3
df.loc[complexCondition]
```

### Make Changes in DataFrames

ഭാവിയിലെ analysis-ന് വേണ്ടി ഒരു clean dataset generate ചെയ്യാൻ, dataframes-ൽ changes വരുത്താനുള്ള കഴിവ് പ്രധാനമാണ്.

**1.** നമ്മൾ select ചെയ്ത rows "keep" ചെയ്യാനും, ബാക്കിയുള്ള rows-നെ `NaN` ഉപയോഗിച്ച് replace ചെയ്യാനും `df.where()` convenient ആയി ഉപയോഗിക്കാം:

```{code-cell} ipython3
df.where(df.POP >= 20000)
```

**2.** modify ചെയ്യേണ്ട column specify ചെയ്ത്, values assign ചെയ്യാൻ `.loc[]` ലളിതമായി ഉപയോഗിക്കാം:

```{code-cell} ipython3
df.loc[df.cg == max(df.cg), 'cg'] = np.nan
df
```

**3.** *rows/columns മൊത്തത്തിൽ* modify ചെയ്യാൻ `.apply()` method ഉപയോഗിക്കാം:

```{code-cell} ipython3
def update_row(row):
    # modify POP
    row.POP = np.nan if row.POP<= 10000 else row.POP

    # modify XRAT
    row.XRAT = row.XRAT / 10
    return row

df.apply(update_row, axis=1)
```

**4.** dataframe-ലെ എല്ലാ *individual entries*-ഉം ഒന്നിച്ച് modify ചെയ്യാൻ `.map()` method ഉപയോഗിക്കാം.

```{code-cell} ipython3
# Round all decimal numbers to 2 decimal places
df.map(lambda x : round(x,2) if not isinstance(x, str) else x)
```

**Application: Missing Value Imputation**

Missing values replace ചെയ്യുന്നത് data munging-ലെ ഒരു പ്രധാന step ആണ്.

നമുക്ക് random ആയി കുറച്ച് NaN values insert ചെയ്യാം:

```{code-cell} ipython3
for idx in list(zip([0, 3, 5, 6], [3, 4, 6, 2])):
    df.iloc[idx] = np.nan

df
```

ഇവിടെ `zip()` function, രണ്ട് lists-ൽ നിന്നും values-ന്റെ pairs create ചെയ്യുന്നു (അതായത് [0,3], [3,4] ...)

എല്ലാ missing values-ഉം 0 ഉപയോഗിച്ച് replace ചെയ്യാൻ, `.map()` method നമുക്ക് വീണ്ടും ഉപയോഗിക്കാം:

```{code-cell} ipython3
# replace all NaN values by 0
def replace_nan(x):
    if not isinstance(x, str):
        return  0 if pd.isna(x) else x
    else:
        return x

df.map(replace_nan)
```

missing values replace ചെയ്യാനുള്ള convenient ആയ methods-ഉം pandas നമുക്ക് നൽകുന്നു.

For example, variable means ഉപയോഗിച്ചുള്ള single imputation pandas-ൽ എളുപ്പത്തിൽ ചെയ്യാം:

```{code-cell} ipython3
df = df.fillna(df.iloc[:,2:8].mean())
df
```

വ്യത്യസ്ത machine learning techniques ഉൾപ്പെടുന്ന data science-ലെ ഒരു വലിയ മേഖലയാണ് missing value imputation.

missing values impute ചെയ്യാൻ python-ൽ [കൂടുതൽ advanced ആയ tools](https://scikit-learn.org/stable/modules/impute.html)-ഉം ലഭ്യമാണ്.

### Standardization and Visualization

population (`POP`), total GDP (`tcgdp`) എന്നിവയിൽ മാത്രമാണ് നമുക്ക് താല്പര്യം എന്ന് കരുതുക.

മുകളിൽ വിവരിച്ച selection method ഉപയോഗിച്ച് dataframe-നെ overwrite ചെയ്തുകൊണ്ട്, `df` എന്ന data frame-നെ ഈ variables മാത്രമായി ചുരുക്കാനുള്ള ഒരു വഴി താഴെ കാണാം:

```{code-cell} ipython3
df = df[['country', 'POP', 'tcgdp']]
df
```

ഇവിടെ `0, 1,..., 7` എന്ന index redundant ആണ്, കാരണം country names നമുക്ക് index ആയി ഉപയോഗിക്കാം.

ഇത് ചെയ്യാൻ, dataframe-ലെ `country` variable-നെ നമുക്ക് index ആയി set ചെയ്യാം:

```{code-cell} ipython3
df = df.set_index('country')
df
```

columns-ന് അൽപ്പം മെച്ചപ്പെട്ട names നൽകാം:

```{code-cell} ipython3
df.columns = 'population', 'total GDP'
df
```

`population` variable thousands-ൽ ആണ്, നമുക്ക് single units-ലേക്ക് മടങ്ങാം:

```{code-cell} ipython3
df['population'] = df['population'] * 1e3
df
```

ഇനി, real GDP per capita കാണിക്കുന്ന ഒരു column നമുക്ക് ചേർക്കാം, total GDP millions-ൽ ആയതിനാൽ 1,000,000 കൊണ്ട് multiply ചെയ്തുകൊണ്ട്:

```{code-cell} ipython3
df['GDP percap'] = df['total GDP'] * 1e6 / df['population']
df
```

pandas-ലെ `DataFrame`, `Series` objects-ന്റെ നല്ല കാര്യങ്ങളിലൊന്ന്, Matplotlib വഴി work ചെയ്യുന്ന plotting-ഉം visualization-ഉം ചെയ്യാനുള്ള methods അവയ്ക്ക് ഉണ്ട് എന്നതാണ്.

For example, GDP per capita-യുടെ ഒരു bar plot നമുക്ക് എളുപ്പത്തിൽ generate ചെയ്യാം:

```{code-cell} ipython3
ax = df['GDP percap'].plot(kind='bar')
ax.set_xlabel('country', fontsize=12)
ax.set_ylabel('GDP per capita', fontsize=12)
plt.show()
```

ഇപ്പോൾ data frame countries-ന് അനുസരിച്ച് alphabetically ordered ആണ്---നമുക്ക് അത് GDP per capita അനുസരിച്ച് മാറ്റാം:

```{code-cell} ipython3
df = df.sort_values(by='GDP percap', ascending=False)
df
```

ഇപ്പോൾ മുൻപത്തെ പോലെ plot ചെയ്യുമ്പോൾ ഇത് ലഭിക്കും:

```{code-cell} ipython3
ax = df['GDP percap'].plot(kind='bar')
ax.set_xlabel('country', fontsize=12)
ax.set_ylabel('GDP per capita', fontsize=12)
plt.show()
```

## On-Line Data Sources

```{index} single: Data Sources
```

online databases-നെ programmatically query ചെയ്യുന്നത് Python വഴി എളുപ്പമാക്കാം.

Economists-ന് പ്രധാനപ്പെട്ട ഒരു database ആണ് [FRED](https://fred.stlouisfed.org/) --- St. Louis Fed maintain ചെയ്യുന്ന time series data-യുടെ ഒരു വലിയ collection.

For example, [unemployment rate](https://fred.stlouisfed.org/series/UNRATE)-ൽ നമുക്ക് താല്പര്യമുണ്ടെന്ന് കരുതുക.

(data-യെ ഒരു csv ആയി download ചെയ്യാൻ, top right-ൽ ഉള്ള `Download` click ചെയ്ത്, `CSV (data)` എന്ന option select ചെയ്യുക).

Alternatively, ഒരു Python program-ൽ നിന്നും നമുക്ക് CSV file access ചെയ്യാം.

ഇത് പല methods ഉപയോഗിച്ചും ചെയ്യാവുന്നതാണ്.

താരതമ്യേന low-level ആയ ഒരു method-ൽ നിന്നും നമുക്ക് തുടങ്ങി, പിന്നീട് pandas-ലേക്ക് മടങ്ങാം.

### Accessing Data with {index}`requests <single: requests>`

```{index} single: Python; requests
```

Internet വഴി data request ചെയ്യാനുള്ള standard Python library ആയ [requests](https://requests.readthedocs.io/en/latest/) ഉപയോഗിക്കുന്നതാണ് ഒരു option.

തുടങ്ങാൻ, നിങ്ങളുടെ computer-ൽ താഴെ കൊടുത്തിരിക്കുന്ന code try ചെയ്യുക:

```{code-cell} ipython3
r = requests.get('https://fred.stlouisfed.org/graph/fredgraph.csv?bgcolor=%23e1e9f0&chart_type=line&drp=0&fo=open%20sans&graph_bgcolor=%23ffffff&height=450&mode=fred&recession_bars=on&txtcolor=%23444444&ts=12&tts=12&width=1318&nt=0&thu=0&trc=0&show_legend=yes&show_axis_titles=yes&show_tooltip=yes&id=UNRATE&scale=left&cosd=1948-01-01&coed=2024-06-01&line_color=%234572a7&link_values=false&line_style=solid&mark_type=none&mw=3&lw=2&ost=-99999&oet=99999&mma=0&fml=a&fq=Monthly&fam=avg&fgst=lin&fgsnd=2020-02-01&line_index=1&transformation=lin&vintage_date=2024-07-29&revision_date=2024-07-29&nd=1948-01-01')
```

error message ഒന്നും ഇല്ലെങ്കിൽ, call success ആണ്.

നിങ്ങൾക്ക് error കിട്ടുകയാണെങ്കിൽ, സാധാരണ രണ്ട് കാരണങ്ങൾ ഉണ്ടാകാം:

1. നിങ്ങൾ Internet-മായി connect ആയിട്ടില്ല --- ഇത് അങ്ങനെ അല്ലാതിരിക്കട്ടെ എന്ന് ആശിക്കുന്നു.
1. നിങ്ങളുടെ machine ഒരു proxy server വഴി Internet access ചെയ്യുന്നുണ്ട്, Python-ന് ഇത് അറിയില്ല.

രണ്ടാമത്തെ case-ൽ, നിങ്ങൾക്ക്

* മറ്റൊരു machine-ലേക്ക് മാറാം
* [the documentation](https://requests.readthedocs.io/en/latest/) വായിച്ച് നിങ്ങളുടെ proxy problem പരിഹരിക്കാം

എല്ലാം ശരിയായി work ചെയ്യുന്നുണ്ടെന്ന് കരുതിയാൽ, `requests.get(url)` എന്ന call return ചെയ്ത data-യിൽ നിന്നും `source` object build ചെയ്യാൻ ഇനി നിങ്ങൾക്ക് proceed ചെയ്യാം:

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

ഈ text parse ചെയ്ത് ഒരു array ആയി store ചെയ്യാൻ നമുക്ക് ഇപ്പോൾ അധികമായി കുറച്ച് code എഴുതാം.

പക്ഷേ ഇത് ആവശ്യമില്ല --- pandas-ന്റെ `read_csv` function ഈ task നമുക്കായി കൈകാര്യം ചെയ്യും.

pandas നമ്മുടെ dates column recognize ചെയ്യാനും, ലളിതമായ date filtering സാധ്യമാക്കാനും നമ്മൾ `parse_dates=True` ഉപയോഗിക്കുന്നു:

```{code-cell} ipython3
data = pd.read_csv(url, index_col=0, parse_dates=True)
```

`data` എന്ന pandas DataFrame-ലേക്ക് data read ചെയ്തിരിക്കുന്നു, ഇനി നമുക്ക് അത് സാധാരണ രീതിയിൽ manipulate ചെയ്യാം:

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

2006 മുതൽ 2012 വരെയുള്ള unemployment rate-ഉം നമുക്ക് താഴെ കാണുന്ന രീതിയിൽ plot ചെയ്യാം:

```{code-cell} ipython3
ax = data['2006':'2012'].plot(title='US Unemployment Rate', legend=False)
ax.set_xlabel('year', fontsize=12)
ax.set_ylabel('%', fontsize=12)
plt.show()
```

ശ്രദ്ധിക്കുക, pandas മറ്റ് പല file type alternatives-ഉം നൽകുന്നു.

excel, json, parquet files read ചെയ്യാനോ, database server-ലേക്ക് നേരിട്ട് connect ചെയ്യാനോ നമുക്ക് ഉപയോഗിക്കാവുന്ന top-level methods-ന്റെ [ഒരു വലിയ variety](https://pandas.pydata.org/pandas-docs/stable/user_guide/io.html) pandas-ൽ ഉണ്ട്.

### Using {index}`wbgapi <single: wbgapi>` and {index}`yfinance <single: yfinance>` to Access Data

World Bank publish ചെയ്യുന്ന പല databases-ൽ നിന്നും data fetch ചെയ്യാൻ [wbgapi](https://pypi.org/project/wbgapi/) python library ഉപയോഗിക്കാം.

```{note}
[wbgapi](https://pypi.org/project/wbgapi/) package-നെക്കുറിച്ചുള്ള useful ആയ ചില information, ഈ [world bank blog post](https://blogs.worldbank.org/en/opendata/introducing-wbgapi-new-python-package-accessing-world-bank-data)-ലും, ഈ [tutorial](https://github.com/tgherzog/wbgapi/blob/master/examples/wbgapi-quickstart.ipynb)-ലും നിങ്ങൾക്ക് കണ്ടെത്താം.
```

exercises-ൽ Yahoo finance-ൽ നിന്നും data fetch ചെയ്യാൻ [yfinance](https://pypi.org/project/yfinance/)-ഉം നമുക്ക് ഉപയോഗിക്കാം.

ഇപ്പോൾ, data download ചെയ്ത് plot ചെയ്യുന്നതിന്റെ ഒരു example നമുക്ക് നോക്കാം --- ഇത്തവണ World Bank-ൽ നിന്നും.

ധാരാളം indicators-നെക്കുറിച്ചുള്ള data World Bank [collect ചെയ്ത് organize ചെയ്യുന്നു](https://data.worldbank.org/indicator).

For example, GDP-യുടെ ratio ആയുള്ള government debt-നെക്കുറിച്ചുള്ള കുറച്ച് data [ഇവിടെ](https://data.worldbank.org/indicator/GC.DOD.TOTL.GD.ZS) കാണാം.

അടുത്ത code example, നിങ്ങൾക്കായി data fetch ചെയ്ത്, US-ന്റെയും Australia-യുടെയും time series plot ചെയ്യുന്നു:

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
