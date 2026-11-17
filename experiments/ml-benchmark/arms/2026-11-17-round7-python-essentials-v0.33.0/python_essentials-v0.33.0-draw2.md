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
  title: Python Essentials
  headings:
    Overview: Overview
    Data Types: Data Types
    Data Types::Primitive Data Types: Primitive Data Types
    Data Types::Primitive Data Types::Boolean Values: Boolean Values
    Data Types::Primitive Data Types::Numeric Types: Numeric Types
    Data Types::Containers: Containers
    Data Types::Containers::Slice Notation: Slice Notation
    Data Types::Containers::Sets and Dictionaries: Sets and Dictionaries
    Input and Output: Input and Output
    Input and Output::Paths: Paths
    Iterating: Iterating
    Iterating::Looping over Different Objects: Looping over Different Objects
    Iterating::Looping without Indices: Looping without Indices
    Iterating::List Comprehensions: List Comprehensions
    Comparisons and Logical Operators: Comparisons and Logical Operators
    Comparisons and Logical Operators::Comparisons: Comparisons
    Comparisons and Logical Operators::Combining Expressions: Combining Expressions
    Coding Style and Documentation: Coding Style and Documentation
    'Coding Style and Documentation::Python Style Guidelines: PEP8': 'Python Style Guidelines: PEP8'
    Coding Style and Documentation::Docstrings: Docstrings
    Exercises: Exercises
---

(python_done_right)=
```{raw} jupyter
<div id="qe-notebook-header" align="right" style="text-align:right;">
        <a href="https://quantecon.org/" title="quantecon.org">
                <img style="width:250px;display:inline;" width="250px" src="https://assets.quantecon.org/img/qe-menubar-logo.svg" alt="QuantEcon">
        </a>
</div>
```

# Python Essentials

## Overview

നമ്മൾ examples-ൽ focus ചെയ്തുകൊണ്ട് ഇതിനോടകം ധാരാളം material വളരെ വേഗത്തിൽ cover ചെയ്തു കഴിഞ്ഞു.

ഇനി, Python-ന്റെ ചില core features കുറച്ചുകൂടി systematic ആയ രീതിയിൽ നമുക്ക് cover ചെയ്യാം.

ഈ approach അത്ര exciting അല്ലെങ്കിലും, ചില details വ്യക്തമാക്കാൻ ഇത് സഹായിക്കുന്നു.

## Data Types

```{index} single: Python; Data Types
```

Computer programs സാധാരണയായി പല data types-ഉം track ചെയ്യാറുണ്ട്.

For example, `1.5` എന്നത് ഒരു floating point number ആണ്, `1` എന്നത് ഒരു integer ആണ്.

Programs-ന് വിവിധ കാരണങ്ങളാൽ ഈ രണ്ട് types-നെ വേർതിരിക്കേണ്ടി വരുന്നു.

ഒന്ന്, ഇവ memory-യിൽ store ചെയ്യപ്പെടുന്ന രീതി വ്യത്യസ്തമാണ് എന്നതാണ്.

മറ്റൊന്ന്, arithmetic operations വ്യത്യസ്തമാണ് എന്നതാണ്

* For example, floating point arithmetic മിക്ക machines-ലും ഒരു specialized Floating Point Unit (FPU) ഉപയോഗിച്ചാണ് implement ചെയ്തിരിക്കുന്നത്.

പൊതുവേ, floats കൂടുതൽ informative ആണെങ്കിലും, integers-ലെ arithmetic operations വേഗത്തിലും കൃത്യതയിലും മികച്ചതാണ്.

Python മറ്റ് പല built-in data types-ഉം നൽകുന്നു, അവയിൽ ചിലത് നമ്മൾ already കണ്ടുകഴിഞ്ഞു

* strings, lists, etc.

ഇവയെക്കുറിച്ച് കുറച്ചുകൂടി നമുക്ക് നോക്കാം.

### Primitive Data Types

(boolean)=
#### Boolean Values

`True` അല്ലെങ്കിൽ `False` ആകാവുന്ന ഒരു simple data type ആണ് **Boolean values**

```{code-cell} python3
x = True
x
```

`type()` എന്ന function ഉപയോഗിച്ച് memory-യിലുള്ള ഏത് object-ന്റെയും type നമുക്ക് check ചെയ്യാം.

```{code-cell} python3
type(x)
```

അടുത്ത line of code-ൽ, interpreter = ചിഹ്നത്തിന്റെ വലതുവശത്തുള്ള expression evaluate ചെയ്ത്, ആ value-യിലേക്ക് y-യെ bind ചെയ്യുന്നു

```{code-cell} python3
y = 100 < 10
y
```

```{code-cell} python3
type(y)
```

Arithmetic expressions-ൽ, `True`-യെ `1` ആയും `False`-യെ `0` ആയും convert ചെയ്യുന്നു.

ഇതിനെ **Boolean arithmetic** എന്ന് പറയുന്നു, ഇത് programming-ൽ പലപ്പോഴും useful ആണ്.

ചില examples താഴെ കാണാം

```{code-cell} python3
x + y
```

```{code-cell} python3
x * y
```

```{code-cell} python3
True + True
```

```{code-cell} python3
bools = [True, True, False, True]  # List of Boolean values

sum(bools)
```

#### Numeric Types

Numeric types-ഉം പ്രധാനപ്പെട്ട primitive data types ആണ്.

നമ്മൾ ഇതിനകം `integer`-ഉം `float` types-ഉം കണ്ടുകഴിഞ്ഞു.

Python-ലെ മറ്റൊരു primitive data type ആണ് **Complex numbers**

```{code-cell} python3
x = complex(1, 2)
y = complex(2, 1)
print(x * y)

type(x)
```

### Containers

Collections of (possibly heterogeneous) data store ചെയ്യാൻ Python-ൽ പല basic types-ഉം ഉണ്ട്.

നമ്മൾ {ref}`lists-നെക്കുറിച്ച് already പറഞ്ഞുകഴിഞ്ഞു <lists_ref>`.

```{index} single: Python; Tuples
```

"Immutable" ആയ lists ആണ് **tuples** എന്ന related data type

```{code-cell} python3
x = ('a', 'b')  # Parentheses instead of the square brackets
x = 'a', 'b'    # Or no brackets --- the meaning is identical
x
```

```{code-cell} python3
type(x)
```

Python-ൽ, ഒരു object create ചെയ്ത ശേഷം അതിനെ മാറ്റാൻ സാധിക്കില്ലെങ്കിൽ, ആ object-നെ **immutable** എന്ന് വിളിക്കുന്നു.

മറിച്ച്, create ചെയ്ത ശേഷവും മാറ്റാൻ സാധിക്കുന്ന object-നെ **mutable** എന്ന് പറയുന്നു.

Python lists mutable ആണ്

```{code-cell} python3
x = [1, 2]
x[0] = 10
x
```

പക്ഷേ tuples അങ്ങനെയല്ല

```{code-cell} python3
---
tags: [raises-exception]
---
x = (1, 2)
x[0] = 10
```

Mutable-ഉം immutable-ഉം ആയ data-യുടെ role-നെക്കുറിച്ചുള്ള കൂടുതൽ കാര്യങ്ങൾ നമുക്ക് പിന്നീട് കാണാം.

Tuples-നെ (ഒപ്പം lists-നെയും) താഴെ കാണുന്ന രീതിയിൽ "unpack" ചെയ്യാം

```{code-cell} python3
integers = (10, 20, 30)
x, y, z = integers
x
```

```{code-cell} python3
y
```

ഇതിന്റെ ഒരു {ref}`example നിങ്ങൾ already കണ്ടുകഴിഞ്ഞു <tuple_unpacking_example>`.

Tuple unpacking convenient ആണ്, ഇത് നമ്മൾ പലപ്പോഴും ഉപയോഗിക്കും.

#### Slice Notation

```{index} single: Python; Slicing
```

ഒരു sequence-ന്റെ (list, tuple, അല്ലെങ്കിൽ string) ഒന്നിലധികം elements access ചെയ്യാൻ, Python-ന്റെ slice
notation ഉപയോഗിക്കാം.

For example,

```{code-cell} python3
a = ["a", "b", "c", "d", "e"]
a[1:]
```

```{code-cell} python3
a[1:3]
```

`a[m:n]`, `a[m]`-ൽ തുടങ്ങി `n - m` elements return ചെയ്യും എന്നതാണ് പൊതുവായ rule.

Negative numbers-ഉം ഉപയോഗിക്കാം

```{code-cell} python3
a[-2:]  # Last two elements of the list
```

Step specify ചെയ്യാൻ `[start:end:step]` എന്ന format-ഉം ഉപയോഗിക്കാം

```{code-cell} python3
a[::2]
```

ഒരു negative step ഉപയോഗിച്ചാൽ, sequence-നെ reverse order-ൽ return ചെയ്യാം

```{code-cell} python3
a[-2::-1] # Walk backwards from the second last element to the first element
```

ഇതേ slice notation tuples-ലും strings-ലും work ചെയ്യുന്നു

```{code-cell} python3
s = 'foobar'
s[-3:]  # Select the last three elements
```

#### Sets and Dictionaries

```{index} single: Python; Sets
```

```{index} single: Python; Dictionaries
```

തുടരുന്നതിന് മുമ്പ് പറയേണ്ട മറ്റ് രണ്ട് container types ആണ് [sets](https://docs.python.org/3/tutorial/datastructures.html#sets)-ഉം [dictionaries](https://docs.python.org/3/tutorial/datastructures.html#dictionaries)-ഉം.

Dictionaries, lists-നെ പോലെ തന്നെയാണ്, പക്ഷേ items-ന് number-ന് പകരം name ആണ് ഉള്ളത്

```{code-cell} python3
d = {'name': 'Frodo', 'age': 33}
type(d)
```

```{code-cell} python3
d['age']
```

`'name'`, `'age'` എന്നീ names-നെ *keys* എന്ന് വിളിക്കുന്നു.

Keys map ചെയ്തിരിക്കുന്ന objects-നെ (`'Frodo'`, `33`) `values` എന്ന് വിളിക്കുന്നു.

Sets എന്നത് duplicates ഇല്ലാത്ത unordered collections ആണ്, set methods സാധാരണ set-theoretic operations നൽകുന്നു

```{code-cell} python3
s1 = {'a', 'b'}
type(s1)
```

```{code-cell} python3
s2 = {'b', 'c'}
s1.issubset(s2)
```

```{code-cell} python3
s1.intersection(s2)
```

`set()` എന്ന function sequences-ൽ നിന്നും sets create ചെയ്യുന്നു

```{code-cell} python3
s3 = set(('foo', 'bar', 'foo'))
s3
```

## Input and Output

```{index} single: Python; IO
```

Text files-ലേക്ക് read ചെയ്യുന്നതും write ചെയ്യുന്നതും സംബന്ധിച്ച് ഒരു ചെറിയ review നമുക്ക് നോക്കാം, writing-ൽ നിന്നും തുടങ്ങാം

```{code-cell} python3
f = open('newfile.txt', 'w')   # Open 'newfile.txt' for writing
f.write('Testing\n')           # Here '\n' means new line
f.write('Testing again')
f.close()
```

ഇവിടെ

* Built-in function ആയ `open()`, writing-നുള്ള ഒരു file object create ചെയ്യുന്നു.
* `write()`-ഉം `close()`-ഉം file objects-ന്റെ methods ആണ്.

നമ്മൾ create ചെയ്ത ഈ file എവിടെയാണ്?

Python, Jupyter അല്ലെങ്കിൽ IPython-ൽ നിന്നും locate ചെയ്യാവുന്ന present working directory (pwd) എന്ന ഒരു concept maintain ചെയ്യുന്നു എന്ന് ഓർക്കുക

```{code-cell} ipython
%pwd
```

ഒരു path specify ചെയ്തിട്ടില്ലെങ്കിൽ, ഇവിടെയാണ് Python write ചെയ്യുന്നത്.

താഴെ കൊടുത്തിരിക്കുന്ന രീതിയിൽ `newline.txt`-ന്റെ contents read ചെയ്യാനും Python ഉപയോഗിക്കാം

```{code-cell} python3
f = open('newfile.txt', 'r')
out = f.read()
out
```

```{code-cell} python3
print(out)
```

In fact, modern Python-ൽ ശുപാർശ ചെയ്യുന്ന approach, files properly acquire ചെയ്യുകയും release ചെയ്യുകയും ചെയ്യുന്നുവെന്ന് ഉറപ്പാക്കാൻ ഒരു `with` statement ഉപയോഗിക്കുക എന്നതാണ്.

Operations-നെ ഒരേ block-നകത്ത് ഉൾപ്പെടുത്തുന്നത് നിങ്ങളുടെ code-ന്റെ clarity-യും improve ചെയ്യുന്നു.

```{note}
ഇത്തരം ഒരു block-നെ ഔദ്യോഗികമായി [*context*](https://realpython.com/python-with-statement/#the-with-statement-approach) എന്ന് refer ചെയ്യുന്നു.
```

മുകളിലെ രണ്ട് examples-നെ ഒരു `with` statement ആയി convert ചെയ്യാൻ നമുക്ക് നോക്കാം.

ആദ്യം writing example മാറ്റാം
```{code-cell} python3

with open('newfile.txt', 'w') as f:  
    f.write('Testing\n')         
    f.write('Testing again')
```

`with` block, അതിന്റെ അവസാനം stream close ആകുന്നുവെന്ന് ഉറപ്പാക്കുന്നതിനാൽ `close()` method call ചെയ്യേണ്ട ആവശ്യമില്ല എന്നത് ശ്രദ്ധിക്കുക.

ചെറിയ മാറ്റങ്ങളോടെ, `with` ഉപയോഗിച്ച് files read ചെയ്യാനും സാധിക്കും

```{code-cell} python3
with open('newfile.txt', 'r') as fo:
    out = fo.read()
    print(out)
```
ഇനി, ഒരു file-ൽ നിന്നും input read ചെയ്ത്, മറ്റൊരു file-ലേക്ക് output write ചെയ്യണം എന്ന് കരുതുക. 
`with` statements ഉപയോഗിച്ച്, operating system-ലേക്ക് resources കൃത്യമായി acquire ചെയ്തും return ചെയ്തും ഈ task എങ്ങനെ 
പൂർത്തിയാക്കാം എന്ന് താഴെ കാണാം:

```{code-cell} python3
with open("newfile.txt", "r") as f:
    file = f.readlines()
    with open("output.txt", "w") as fo:
        for i, line in enumerate(file):
            fo.write(f'Line {i}: {line} \n')
```

Output file ഇതായിരിക്കും

```{code-cell} python3
with open('output.txt', 'r') as fo:
    print(fo.read())
```

രണ്ട് `with` statements-നെ ഒറ്റ line-ൽ group ചെയ്തുകൊണ്ട് മുകളിലെ example-നെ നമുക്ക് simplify ചെയ്യാം

```{code-cell} python3
with open("newfile.txt", "r") as f, open("output2.txt", "w") as fo:
        for i, line in enumerate(f):
            fo.write(f'Line {i}: {line} \n')
```

Output file ഇതേ രീതിയിൽ ആയിരിക്കും

```{code-cell} python3
with open('output2.txt', 'r') as fo:
    print(fo.read())
```

നിലവിലുള്ള file overwrite ചെയ്യാതെ, അതിലേക്ക് തുടർന്ന് write ചെയ്യണം എന്ന് കരുതുക.

append mode-നെ സൂചിപ്പിക്കുന്ന `a`-യിലേക്ക് mode മാറ്റാം

```{code-cell} python3
with open('output2.txt', 'a') as fo:
    fo.write('\nThis is the end of the file')
```

```{code-cell} python3
with open('output2.txt', 'r') as fo:
    print(fo.read())
```

```{note}
ഇവിടെ നമ്മൾ `r`, `w`, `a` എന്നീ mode-കൾ മാത്രമാണ് cover ചെയ്തത്, ഇവയാണ് ഏറ്റവും സാധാരണയായി ഉപയോഗിക്കുന്ന modes. 
നിങ്ങൾക്ക് experiment ചെയ്യാവുന്ന [പലതരം modes](https://www.geeksforgeeks.org/python/reading-writing-text-files-python/) 
Python നൽകുന്നുണ്ട്.
```

### Paths

```{index} single: Python; Paths
```

`newfile.txt`, present working directory-യിൽ ഇല്ലെങ്കിൽ `open()`-ലേക്കുള്ള ഈ call fail ആകും എന്നത് ശ്രദ്ധിക്കുക.

ഈ സാഹചര്യത്തിൽ, നിങ്ങൾക്ക് file-നെ pwd-യിലേക്ക് മാറ്റുകയോ, അല്ലെങ്കിൽ file-ന്റെ [full path](https://en.wikipedia.org/wiki/Path_%28computing%29) specify ചെയ്യുകയോ ചെയ്യാം

```{code-block} python3
:class: no-execute

f = open('insert_full_path_to_file/newfile.txt', 'r')
```

(iterating_version_1)=
## Iterating

```{index} single: Python; Iteration
```

Computing-ലെ ഏറ്റവും പ്രധാനപ്പെട്ട tasks-ൽ ഒന്ന്, ഒരു sequence of data-യിലൂടെ step ചെയ്തു
തന്നിരിക്കുന്ന ഒരു action perform ചെയ്യുക എന്നതാണ്.

`for` loop വഴി ഇത്തരം iteration-ന് simple-ഉം flexible-ഉം ആയ ഒരു interface നൽകുന്നു എന്നതാണ് Python-ന്റെ ഒരു strength.

### Looping over Different Objects

പല Python objects-ഉം "iterable" ആണ്, അതായത് അവയ്ക്ക് മുകളിലൂടെ loop ചെയ്യാൻ സാധിക്കും.

ഒരു example ആയി, US cities-നെയും അവയുടെ population-നെയും list ചെയ്യുന്ന us_cities.txt എന്ന file present working directory-ലേക്ക് നമുക്ക് write ചെയ്യാം.

(us_cities_data)=
```{code-cell} ipython
%%writefile us_cities.txt
new york: 8244910
los angeles: 3819702
chicago: 2707120
houston: 2145146
philadelphia: 1536471
phoenix: 1469471
san antonio: 1359758
san diego: 1326179
dallas: 1223229
```

ഇവിടെ `%%writefile` എന്നത് ഒരു [IPython cell magic](https://ipython.readthedocs.io/en/stable/interactive/magics.html#cell-magics) ആണ്.

Names capitalize ചെയ്തും thousands സൂചിപ്പിക്കാൻ commas ചേർത്തും, ഈ information കൂടുതൽ readable ആക്കണം എന്ന് കരുതുക.

താഴെയുള്ള program ഈ data read ചെയ്ത് conversion നടത്തുന്നു:

```{code-cell} python3
data_file = open('us_cities.txt', 'r')
for line in data_file:
    city, population = line.split(':')         # Tuple unpacking
    city = city.title()                        # Capitalize city names
    population = f'{int(population):,}'        # Add commas to numbers
    print(city.ljust(15) + population)
data_file.close()
```

ഇവിടെ `f'` എന്നത് strings-ലേക്ക് variables insert ചെയ്യാൻ [ഉപയോഗിക്കുന്ന](https://docs.python.org/3/library/string.html#formatspec) ഒരു f-string ആണ്.

ഓരോ line-ന്റെയും reformatting മൂന്ന് വ്യത്യസ്ത string methods-ന്റെ ഫലമാണ്, അവയുടെ details പിന്നീട് നോക്കാം.

ഈ program-ലെ നമുക്ക് interesting ആയ ഭാഗം line 2 ആണ്, അത് കാണിക്കുന്നത്

1. File object ആയ `data_file` iterable ആണ്, അതായത് ഒരു `for` loop-നകത്ത് `in`-ന്റെ വലതുവശത്ത് ഇതിനെ വെക്കാൻ സാധിക്കും.
1. Iteration, file-ലെ ഓരോ line-ഇലൂടെയും step ചെയ്യുന്നു.

ഇത് നമ്മുടെ program-ൽ കാണുന്ന clean-ഉം convenient-ഉം ആയ syntax-ലേക്ക് നയിക്കുന്നു.

മറ്റ് പല തരം objects-ഉം iterable ആണ്, അവയിൽ ചിലത് നമുക്ക് പിന്നീട് നോക്കാം.

### Looping without Indices

Python explicit indexing ഇല്ലാതെ looping ചെയ്യുന്നതിനെ prefer ചെയ്യുന്നു എന്നത് നിങ്ങൾ ശ്രദ്ധിച്ചിരിക്കാം.

For example,

```{code-cell} python3
x_values = [1, 2, 3]  # Some iterable x
for x in x_values:
    print(x * x)
```

ഇതാണ്, ഇതിനേക്കാൾ preferred

```{code-cell} python3
for i in range(len(x_values)):
    print(x_values[i] * x_values[i])
```

ഈ രണ്ട് alternatives-ഉം compare ചെയ്യുമ്പോൾ, ആദ്യത്തേത് എന്തുകൊണ്ട് preferred ആണെന്ന് നിങ്ങൾക്ക് മനസ്സിലാകും.

Indices ഇല്ലാതെ looping ചെയ്യുന്നത് simplify ചെയ്യാൻ Python ചില facilities നൽകുന്നു.

അതിലൊന്നാണ് `zip()`, ഇത് രണ്ട് sequences-ൽ നിന്നുള്ള pairs-ഇലൂടെ step ചെയ്യാൻ ഉപയോഗിക്കുന്നു.

For example, താഴെയുള്ള code run ചെയ്തു നോക്കുക

```{code-cell} python3
countries = ('Japan', 'Korea', 'China')
cities = ('Tokyo', 'Seoul', 'Beijing')
for country, city in zip(countries, cities):
    print(f'The capital of {country} is {city}')
```

Dictionaries create ചെയ്യാനും `zip()` function useful ആണ് --- for
example

```{code-cell} python3
names = ['Tom', 'John']
marks = ['E', 'F']
dict(zip(names, marks))
```

നമുക്ക് ഒരു list-ൽ നിന്നും index വേണമെങ്കിൽ, ഒരു option `enumerate()` ഉപയോഗിക്കുക എന്നതാണ്.

`enumerate()` എന്താണ് ചെയ്യുന്നത് എന്ന് മനസ്സിലാക്കാൻ, താഴെയുള്ള example നോക്കാം

```{code-cell} python3
letter_list = ['a', 'b', 'c']
for index, letter in enumerate(letter_list):
    print(f"letter_list[{index}] = '{letter}'")
```
(list_comprehensions)=
### List Comprehensions

```{index} single: Python; List comprehension
```

*list comprehension* എന്ന ഒന്ന് ഉപയോഗിച്ച്, random draws-ന്റെ list generate ചെയ്യുന്നതിനുള്ള code-നെ നമുക്ക് വളരെയധികം simplify ചെയ്യാം.

Lists create ചെയ്യാനുള്ള ഒരു elegant Python tool ആണ് [List comprehensions](https://en.wikipedia.org/wiki/List_comprehension).

താഴെയുള്ള example നോക്കാം, ഇതിൽ list comprehension രണ്ടാമത്തെ line-ന്റെ
വലതുവശത്താണ് ഉള്ളത്

```{code-cell} python3
animals = ['dog', 'cat', 'bird']
plurals = [animal + 's' for animal in animals]
plurals
```

Here's another example

```{code-cell} python3
range(8)
```

```{code-cell} python3
doubles = [2 * x for x in range(8)]
doubles
```

## Comparisons and Logical Operators

### Comparisons

```{index} single: Python; Comparison
```

പല വ്യത്യസ്ത തരം expressions-ഉം Boolean values-ൽ ഒന്നായി (അതായത്, `True` അല്ലെങ്കിൽ `False`) evaluate ചെയ്യപ്പെടുന്നു.

ഒരു common type comparisons ആണ്, ഉദാഹരണത്തിന്

```{code-cell} python3
x, y = 1, 2
x < y
```

```{code-cell} python3
x > y
```

നമുക്ക് inequalities *chain* ചെയ്യാം എന്നതാണ് Python-ന്റെ ഒരു nice feature

```{code-cell} python3
1 < 2 < 3
```

```{code-cell} python3
1 <= 2 <= 3
```

നേരത്തെ നമ്മൾ കണ്ടതുപോലെ, equality test ചെയ്യുമ്പോൾ നമ്മൾ `==` ഉപയോഗിക്കുന്നു

```{code-cell} python3
x = 1    # Assignment
x == 2   # Comparison
```

"Not equal"-നായി `!=` ഉപയോഗിക്കുക

```{code-cell} python3
1 != 2
```

Conditions test ചെയ്യുമ്പോൾ, **ഏത്** valid Python expression-ഉം നമുക്ക് ഉപയോഗിക്കാം എന്നത് ശ്രദ്ധിക്കുക

```{code-cell} python3
x = 'yes' if 42 else 'no'
x
```

```{code-cell} python3
x = 'yes' if [] else 'no'
x
```

ഇവിടെ എന്താണ് നടക്കുന്നത്?

Rule ഇതാണ്:

* Zero, empty sequences അല്ലെങ്കിൽ containers (strings, lists, etc.) ആയി evaluate ചെയ്യുന്ന expressions-ഉം `None`-ഉം എല്ലാം `False`-ന് തുല്യമാണ്.
    * for example, ഒരു `if` clause-ൽ `[]`-ഉം `()`-ഉം `False`-ന് തുല്യമാണ്
* മറ്റ് എല്ലാ values-ഉം `True`-ന് തുല്യമാണ്.
    * for example, ഒരു `if` clause-ൽ `42`, `True`-ന് തുല്യമാണ്

### Combining Expressions

```{index} single: Python; Logical Expressions
```

`and`, `or`, `not` എന്നിവ ഉപയോഗിച്ച് expressions-നെ നമുക്ക് combine ചെയ്യാം.

ഇവയാണ് standard logical connectives (conjunction, disjunction, denial)

```{code-cell} python3
1 < 2 and 'f' in 'foo'
```

```{code-cell} python3
1 < 2 and 'g' in 'foo'
```

```{code-cell} python3
1 < 2 or 'g' in 'foo'
```

```{code-cell} python3
not True
```

```{code-cell} python3
not not True
```

ഓർക്കുക

* `P and Q`, രണ്ടും `True` ആണെങ്കിൽ `True` ആണ്, അല്ലെങ്കിൽ `False`
* `P or Q`, രണ്ടും `False` ആണെങ്കിൽ `False` ആണ്, അല്ലെങ്കിൽ `True`

Expressions-ന്റെ ഒരു sequence test ചെയ്യാൻ `all()`-ഉം `any()`-ഉം ഉപയോഗിക്കാം

```{code-cell} python3
all([1 <= 2 <= 3, 5 <= 6 <= 7])
```
```{code-cell} python3
all([1 <= 2 <= 3, "a" in "letter"])
```
```{code-cell} python3
any([1 <= 2 <= 3, "a" in "letter"])
```

```{note}
* Sequence-ലെ *എല്ലാ* boolean values/expressions-ഉം `True` ആകുമ്പോൾ `all()`, `True` return ചെയ്യുന്നു
* Sequence-ലെ *ഏതെങ്കിലും* boolean values/expressions `True` ആകുമ്പോൾ `any()`, `True` return ചെയ്യുന്നു
```

## Coding Style and Documentation

Consistent ആയ ഒരു coding style-ഉം documentation-ന്റെ ഉപയോഗവും 
code-നെ മനസ്സിലാക്കാനും maintain ചെയ്യാനും എളുപ്പമാക്കുന്നു.

### Python Style Guidelines: PEP8

```{index} single: Python; PEP8
```

Prompt-ൽ `import this` എന്ന് type ചെയ്താൽ Python programming philosophy നിങ്ങൾക്ക് കണ്ടെത്താം.

മറ്റ് പല കാര്യങ്ങൾക്കൊപ്പം, programming style-ൽ consistency-യെ Python ശക്തമായി prefer ചെയ്യുന്നു.

Consistency-യെയും little minds-നെയും കുറിച്ചുള്ള പഴഞ്ചൊല്ല് നമ്മൾ എല്ലാവരും കേട്ടിട്ടുണ്ട്.

എന്നാൽ programming-ൽ, mathematics-ലേത് പോലെ തന്നെ, നേരെ വിപരീതമാണ് ശരി

* $\cup$, $\cap$ എന്നീ symbols മാറ്റിവെച്ച ഒരു mathematical paper, author അത് ആദ്യ
  page-ൽ തന്നെ നിങ്ങളോട് പറഞ്ഞിരുന്നാലും, വായിക്കാൻ വളരെ ബുദ്ധിമുട്ടായിരിക്കും.

Python-ൽ, standard style [PEP8](https://peps.python.org/pep-0008/)-ൽ വിവരിച്ചിരിക്കുന്നു.

(ഈ lectures-ൽ mathematical notation-മായി കൂടുതൽ യോജിക്കുന്നതിന് ചിലപ്പോൾ നമ്മൾ PEP8-ൽ നിന്നും വ്യതിചലിക്കും)

(Docstrings)=
### Docstrings

```{index} single: Python; Docstrings
```

Modules, classes, functions, etc.-ലേക്ക് comments ചേർക്കാനുള്ള ഒരു system Python-ൽ ഉണ്ട്, ഇതിനെ *docstrings* എന്ന് വിളിക്കുന്നു.

Docstrings-ന്റെ nice ആയ കാര്യം, അവ run-time-ൽ available ആണ് എന്നതാണ്.

ഇത് run ചെയ്തു നോക്കുക

```{code-cell} python3
def f(x):
    """
    This function squares its argument
    """
    return x**2
```

ഈ code run ചെയ്ത ശേഷം, docstring available ആണ്

```{code-cell} ipython
f?
```

```{code-block} ipython
:class: no-execute

Type:       function
String Form:<function f at 0x2223320>
File:       /home/john/temp/temp.py
Definition: f(x)
Docstring:  This function squares its argument
```

```{code-cell} ipython
f??
```

```{code-block} ipython
:class: no-execute

Type:       function
String Form:<function f at 0x2223320>
File:       /home/john/temp/temp.py
Definition: f(x)
Source:
def f(x):
    """
    This function squares its argument
    """
    return x**2
```

ഒരു question mark ഉപയോഗിച്ചാൽ docstring കാണാം, രണ്ട് ഉപയോഗിച്ചാൽ source code-ഉം കൂടി കാണാം.

Docstrings-നുള്ള conventions [PEP257](https://peps.python.org/pep-0257/)-ൽ നിങ്ങൾക്ക് കണ്ടെത്താം.

## Exercises

Solve the following exercises.

(For some, the built-in function `sum()` comes in handy).

```{exercise-start}
:label: pyess_ex1
```
Part 1: Given two numeric lists or tuples `x_vals` and `y_vals` of equal length, compute
their inner product using `zip()`.

Part 2: In one line, count the number of even numbers in 0,...,99.

Part 3: Given `pairs = ((2, 5), (4, 2), (9, 8), (12, 10))`, count the number of pairs `(a, b)`
such that both `a` and `b` are even.

```{hint}
:class: dropdown

`x % 2` returns 0 if `x` is even, 1 otherwise.

```

```{exercise-end}
```


```{solution-start} pyess_ex1
:class: dropdown
```

**Part 1 Solution:**

Here's one possible solution

```{code-cell} python3
x_vals = [1, 2, 3]
y_vals = [1, 1, 1]
sum([x * y for x, y in zip(x_vals, y_vals)])
```

This also works

```{code-cell} python3
sum(x * y for x, y in zip(x_vals, y_vals))
```

**Part 2 Solution:**

One solution is

```{code-cell} python3
sum([x % 2 == 0 for x in range(100)])
```

This also works:

```{code-cell} python3
sum(x % 2 == 0 for x in range(100))
```

Some less natural alternatives that nonetheless help to illustrate the
flexibility of list comprehensions are

```{code-cell} python3
len([x for x in range(100) if x % 2 == 0])
```

and

```{code-cell} python3
sum([1 for x in range(100) if x % 2 == 0])
```

**Part 3 Solution:**

Here's one possibility

```{code-cell} python3
pairs = ((2, 5), (4, 2), (9, 8), (12, 10))
sum([x % 2 == 0 and y % 2 == 0 for x, y in pairs])
```

```{solution-end}
```

```{exercise-start}
:label: pyess_ex2
```

Consider the polynomial

```{math}
:label: polynom0

p(x)
= a_0 + a_1 x + a_2 x^2 + \cdots a_n x^n
= \sum_{i=0}^n a_i x^i
```

Write a function `p` such that `p(x, coeff)` that computes the value in {eq}`polynom0` given a point `x` and a list of coefficients `coeff` ($a_1, a_2, \cdots a_n$).

Try to use `enumerate()` in your loop.

```{exercise-end}
```

```{solution-start} pyess_ex2
:class: dropdown
```
Here’s a solution:

```{code-cell} python3
def p(x, coeff):
    return sum(a * x**i for i, a in enumerate(coeff))
```

```{code-cell} python3
p(1, (2, 4))
```

```{solution-end}
```


```{exercise-start}
:label: pyess_ex3
```

Write a function that takes a string as an argument and returns the number of capital letters in the string.

```{hint}
:class: dropdown

`'foo'.upper()` returns `'FOO'`.

```

```{exercise-end}
```

```{solution-start} pyess_ex3
:class: dropdown
```

Here's one solution:

```{code-cell} python3
def f(string):
    count = 0
    for letter in string:
        if letter == letter.upper() and letter.isalpha():
            count += 1
    return count

f('The Rain in Spain')
```

An alternative, more pythonic solution:

```{code-cell} python3
def count_uppercase_chars(s):
    return sum([c.isupper() for c in s])

count_uppercase_chars('The Rain in Spain')
```

```{solution-end}
```



```{exercise}
:label: pyess_ex4

Write a function that takes two sequences `seq_a` and `seq_b` as arguments and
returns `True` if every element in `seq_a` is also an element of `seq_b`, else
`False`.

* By "sequence" we mean a list, a tuple or a string.
* Do the exercise without using [sets](https://docs.python.org/3/tutorial/datastructures.html#sets) and set methods.
```

```{solution-start} pyess_ex4
:class: dropdown
```

Here's a solution:

```{code-cell} python3
def f(seq_a, seq_b):
    for a in seq_a:
        if a not in seq_b:
            return False
    return True

# == test == #
print(f("ab", "cadb"))
print(f("ab", "cjdb"))
print(f([1, 2], [1, 2, 3]))
print(f([1, 2, 3], [1, 2]))
```

An alternative, more pythonic solution using `all()`:

```{code-cell} python3
def f(seq_a, seq_b):
  return all([i in seq_b for i in seq_a])

# == test == #
print(f("ab", "cadb"))
print(f("ab", "cjdb"))
print(f([1, 2], [1, 2, 3]))
print(f([1, 2, 3], [1, 2]))
```

Of course, if we use the `sets` data type then the solution is easier

```{code-cell} python3
def f(seq_a, seq_b):
    return set(seq_a).issubset(set(seq_b))
```

```{solution-end}
```


```{exercise}
:label: pyess_ex5

When we cover the numerical libraries, we will see they include many
alternatives for interpolation and function approximation.

Nevertheless, let's write our own function approximation routine as an exercise.

In particular, without using any imports, write a function `linapprox` that takes as arguments

* A function `f` mapping some interval $[a, b]$ into $\mathbb R$.
* Two scalars `a` and `b` providing the limits of this interval.
* An integer `n` determining the number of grid points.
* A number `x` satisfying `a <= x <= b`.

and returns the [piecewise linear interpolation](https://en.wikipedia.org/wiki/Linear_interpolation) of `f` at `x`, based on `n` evenly spaced grid points `a = point[0] < point[1] < ... < point[n-1] = b`.

Aim for clarity, not efficiency.
```

```{solution-start} pyess_ex5
:class: dropdown
```
Here’s a solution:

```{code-cell} python3
def linapprox(f, a, b, n, x):
    """
    Evaluates the piecewise linear interpolant of f at x on the interval
    [a, b], with n evenly spaced grid points.

    Parameters
    ==========
        f : function
            The function to approximate

        x, a, b : scalars (floats or integers)
            Evaluation point and endpoints, with a <= x <= b

        n : integer
            Number of grid points

    Returns
    =======
        A float. The interpolant evaluated at x

    """
    length_of_interval = b - a
    num_subintervals = n - 1
    step = length_of_interval / num_subintervals

    # === find first grid point larger than x === #
    point = a
    while point <= x:
        point += step

    # === x must lie between the gridpoints (point - step) and point === #
    u, v = point - step, point

    return f(u) + (x - u) * (f(v) - f(u)) / (v - u)
```

```{solution-end}
```


```{exercise-start}
:label: pyess_ex6
```

Using list comprehension syntax, we can simplify the loop in the following
code.

```{code-cell} python3
import numpy as np

rng = np.random.default_rng()
n = 100
ϵ_values = []
for i in range(n):
    e = rng.standard_normal()
    ϵ_values.append(e)
```

```{exercise-end}
```

```{solution-start} pyess_ex6
:class: dropdown
```

Here's one solution.

```{code-cell} python3
rng = np.random.default_rng()
n = 100
ϵ_values = [rng.standard_normal() for i in range(n)]
```

```{solution-end}
```
