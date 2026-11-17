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

നമ്മൾ examples-ൽ focus ചെയ്തുകൊണ്ട് ഒരുപാട് material വളരെ വേഗത്തിൽ cover ചെയ്തു കഴിഞ്ഞു.

ഇനി, Python-ന്റെ ചില core features കുറച്ചുകൂടി systematic ആയ രീതിയിൽ നമുക്ക് cover ചെയ്യാം.

ഈ approach അത്ര exciting അല്ലെങ്കിലും ചില details വ്യക്തമാക്കാൻ ഇത് സഹായിക്കുന്നു.

## Data Types

```{index} single: Python; Data Types
```

Computer programs സാധാരണയായി പല data types-നെ track ചെയ്യാറുണ്ട്.

For example, `1.5` എന്നത് ഒരു floating point number ആണ്, `1` എന്നത് ഒരു integer ആണ്.

പല കാരണങ്ങൾ കൊണ്ട് programs-ന് ഈ രണ്ട് types-നെ distinguish ചെയ്യേണ്ടി വരുന്നു.

ഒന്ന്, ഇവ memory-യിൽ different ആയ രീതിയിലാണ് store ചെയ്യപ്പെടുന്നത്.

മറ്റൊന്ന്, arithmetic operations വ്യത്യസ്തമാണ് എന്നതാണ്

* For example, മിക്ക machines-ലും floating point arithmetic ഒരു specialized Floating Point Unit (FPU) ഉപയോഗിച്ചാണ് implement ചെയ്തിരിക്കുന്നത്.

പൊതുവേ, floats കൂടുതൽ informative ആണ്, പക്ഷേ integers-ലെ arithmetic operations വേഗത കൂടിയതും accurate ആയതും ആണ്.

നമ്മൾ already കണ്ടുകഴിഞ്ഞ strings, lists തുടങ്ങിയവ ഉൾപ്പെടെ, Python വേറെയും അനേകം built-in data types നൽകുന്നു.

* strings, lists, etc.

ഇവയെക്കുറിച്ച് കുറച്ചുകൂടി നമുക്ക് നോക്കാം.

### Primitive Data Types

(boolean)=
#### Boolean Values

ഒരു simple data type ആണ് **Boolean values**, ഇവ `True` അല്ലെങ്കിൽ `False` ആകാം

```{code-cell} python3
x = True
x
```

`type()` എന്ന function ഉപയോഗിച്ച് memory-യിലെ ഏത് object-ന്റെയും type നമുക്ക് check ചെയ്യാം.

```{code-cell} python3
type(x)
```

താഴെയുള്ള line of code-ൽ, interpreter = ചിഹ്നത്തിന്റെ വലതുവശത്തുള്ള expression evaluate ചെയ്ത്, ആ value-യിലേക്ക് y-യെ bind ചെയ്യുന്നു

```{code-cell} python3
y = 100 < 10
y
```

```{code-cell} python3
type(y)
```

Arithmetic expressions-ൽ, `True` എന്നത് `1` ആയും `False` എന്നത് `0` ആയും convert ചെയ്യപ്പെടുന്നു.

ഇതിനെ **Boolean arithmetic** എന്ന് വിളിക്കുന്നു, programming-ൽ ഇത് പലപ്പോഴും useful ആണ്.

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

Numeric types-ഉം important ആയ primitive data types ആണ്.

`integer`, `float` എന്നീ types നമ്മൾ മുമ്പ് കണ്ടിട്ടുണ്ട്.

**Complex numbers** എന്നത് Python-ലെ മറ്റൊരു primitive data type ആണ്

```{code-cell} python3
x = complex(1, 2)
y = complex(2, 1)
print(x * y)

type(x)
```

### Containers

(ഒരുപക്ഷേ heterogeneous ആയ) data-യുടെ collections store ചെയ്യാൻ Python-ൽ പല basic types ഉണ്ട്.

നമ്മൾ {ref}`lists-നെക്കുറിച്ച് already discuss ചെയ്തു കഴിഞ്ഞു <lists_ref>`.

```{index} single: Python; Tuples
```

ഇതുമായി ബന്ധപ്പെട്ട ഒരു data type ആണ് **tuples**, ഇവ "immutable" ആയ lists ആണ്

```{code-cell} python3
x = ('a', 'b')  # Parentheses instead of the square brackets
x = 'a', 'b'    # Or no brackets --- the meaning is identical
x
```

```{code-cell} python3
type(x)
```

Python-ൽ, ഒരു object ഒരിക്കൽ create ചെയ്ത ശേഷം മാറ്റാൻ പറ്റാത്തതാണെങ്കിൽ, അതിനെ **immutable** എന്ന് വിളിക്കുന്നു.

നേരെ മറിച്ച്, create ചെയ്ത ശേഷവും മാറ്റാൻ പറ്റുന്ന object-നെ **mutable** എന്ന് വിളിക്കുന്നു.

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

Mutable, immutable data-യുടെ role-നെക്കുറിച്ച് കൂടുതൽ കാര്യങ്ങൾ നമുക്ക് പിന്നീട് കാണാം.

Tuples-നെയും (lists-നെയും) താഴെ കാണുന്ന രീതിയിൽ "unpack" ചെയ്യാം

```{code-cell} python3
integers = (10, 20, 30)
x, y, z = integers
x
```

```{code-cell} python3
y
```

ഇതിന്റെ ഒരു {ref}`example നിങ്ങൾ already കണ്ടുകഴിഞ്ഞു <tuple_unpacking_example>`.

Tuple unpacking convenient ആണ്, നമുക്ക് ഇത് പലപ്പോഴും ഉപയോഗിക്കേണ്ടി വരും.

#### Slice Notation

```{index} single: Python; Slicing
```

ഒരു sequence-ന്റെ (list, tuple അല്ലെങ്കിൽ string) ഒന്നിലധികം elements access ചെയ്യാൻ, Python-ന്റെ slice
notation ഉപയോഗിക്കാം.

For example,

```{code-cell} python3
a = ["a", "b", "c", "d", "e"]
a[1:]
```

```{code-cell} python3
a[1:3]
```

`a[m:n]` എന്നത് `a[m]`-ൽ തുടങ്ങി `n - m` elements return ചെയ്യുന്നു എന്നതാണ് പൊതുവായ rule.

Negative numbers-ഉം ഉപയോഗിക്കാം

```{code-cell} python3
a[-2:]  # Last two elements of the list
```

Step specify ചെയ്യാൻ `[start:end:step]` എന്ന format-ഉം ഉപയോഗിക്കാം

```{code-cell} python3
a[::2]
```

ഒരു negative step ഉപയോഗിച്ചാൽ, sequence-നെ reverse ആയ order-ൽ return ചെയ്യാം

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

മുന്നോട്ട് പോകുന്നതിന് മുമ്പ് പറയേണ്ട മറ്റ് രണ്ട് container types ആണ് [sets](https://docs.python.org/3/tutorial/datastructures.html#sets), [dictionaries](https://docs.python.org/3/tutorial/datastructures.html#dictionaries) എന്നിവ.

Dictionaries, lists-നെ പോലെ തന്നെയാണ്, പക്ഷേ items-ന് number-ന് പകരം name ഉണ്ടാകും

```{code-cell} python3
d = {'name': 'Frodo', 'age': 33}
type(d)
```

```{code-cell} python3
d['age']
```

`'name'`, `'age'` എന്നീ names-നെ *keys* എന്ന് വിളിക്കുന്നു.

Keys ഏതൊക്കെ objects-ലേക്കാണോ map ചെയ്യപ്പെടുന്നത് (`'Frodo'`, `33`) അവയെ `values` എന്ന് വിളിക്കുന്നു.

Sets എന്നത് duplicates ഇല്ലാത്ത unordered collections ആണ്, സാധാരണ set-theoretic operations set methods നൽകുന്നു

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

`set()` function sequences-ൽ നിന്നും sets create ചെയ്യുന്നു

```{code-cell} python3
s3 = set(('foo', 'bar', 'foo'))
s3
```

## Input and Output

```{index} single: Python; IO
```

Text files-ലേക്ക് read, write ചെയ്യുന്നതിനെക്കുറിച്ച് ചുരുക്കമായി നമുക്ക് നോക്കാം, ആദ്യം writing-ൽ നിന്നും തുടങ്ങാം

```{code-cell} python3
f = open('newfile.txt', 'w')   # Open 'newfile.txt' for writing
f.write('Testing\n')           # Here '\n' means new line
f.write('Testing again')
f.close()
```

ഇവിടെ

* Built-in function ആയ `open()`, write ചെയ്യാനുള്ള ഒരു file object create ചെയ്യുന്നു.
* `write()`, `close()` എന്നിവ രണ്ടും file objects-ന്റെ methods ആണ്.

നമ്മൾ create ചെയ്ത ഈ file എവിടെയാണ്?

Python-ന് present working directory (pwd) എന്ന ഒരു concept ഉണ്ടെന്ന് ഓർക്കുക, ഇത് Jupyter-ൽ നിന്നോ IPython-ൽ നിന്നോ താഴെ കൊടുത്തിരിക്കുന്ന രീതിയിൽ കണ്ടുപിടിക്കാം

```{code-cell} ipython
%pwd
```

ഒരു path specify ചെയ്തിട്ടില്ലെങ്കിൽ, ഇവിടേക്കാണ് Python write ചെയ്യുന്നത്.

`newline.txt`-ന്റെ content read ചെയ്യാനും നമുക്ക് Python താഴെ കൊടുത്തിരിക്കുന്ന രീതിയിൽ ഉപയോഗിക്കാം

```{code-cell} python3
f = open('newfile.txt', 'r')
out = f.read()
out
```

```{code-cell} python3
print(out)
```

In fact, files properly acquire ചെയ്യപ്പെടുകയും release ചെയ്യപ്പെടുകയും ചെയ്യുന്നുവെന്ന് ഉറപ്പാക്കാൻ modern Python-ൽ recommend ചെയ്യുന്ന approach ഒരു `with` statement ഉപയോഗിക്കുക എന്നതാണ്.

Operations-നെ ഒരേ block-ൽ ഉൾപ്പെടുത്തുന്നത് നിങ്ങളുടെ code-ന്റെ clarity-യും improve ചെയ്യുന്നു.

```{note}
ഇത്തരത്തിലുള്ള block-നെ formal ആയി [*context*](https://realpython.com/python-with-statement/#the-with-statement-approach) എന്ന് വിളിക്കുന്നു.
```

മുകളിൽ കൊടുത്ത രണ്ട് examples-നെയും ഒരു `with` statement ആയി convert ചെയ്യാൻ നമുക്ക് നോക്കാം.

ആദ്യം writing example മാറ്റാം
```{code-cell} python3

with open('newfile.txt', 'w') as f:  
    f.write('Testing\n')         
    f.write('Testing again')
```

ശ്രദ്ധിക്കുക, `close()` method call ചെയ്യേണ്ട ആവശ്യമില്ല, കാരണം block-ന്റെ അവസാനം stream close ആകുന്നുവെന്ന് `with` block ഉറപ്പാക്കും.

ചെറിയ modifications-ഓടെ, `with` ഉപയോഗിച്ച് files-നെ read ചെയ്യാനും കഴിയും

```{code-cell} python3
with open('newfile.txt', 'r') as fo:
    out = fo.read()
    print(out)
```
ഇനി, ഒരു file-ൽ നിന്നും input read ചെയ്ത് മറ്റൊരു file-ലേക്ക് output write ചെയ്യണം എന്ന് കരുതുക. 
`with` statements ഉപയോഗിച്ച്, operating system-ലേക്ക് resources ശരിയായി acquire ചെയ്തും return ചെയ്തും ഈ task എങ്ങനെ ചെയ്യാം എന്ന് താഴെ കാണാം:

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

രണ്ട് `with` statements-നെയും ഒറ്റ line-ൽ group ചെയ്ത് മുകളിലെ example-നെ നമുക്ക് simplify ചെയ്യാം

```{code-cell} python3
with open("newfile.txt", "r") as f, open("output2.txt", "w") as fo:
        for i, line in enumerate(f):
            fo.write(f'Line {i}: {line} \n')
```

Output file ഇതേപോലെ തന്നെ ആയിരിക്കും

```{code-cell} python3
with open('output2.txt', 'r') as fo:
    print(fo.read())
```

Existing file overwrite ചെയ്യാതെ അതിലേക്ക് write ചെയ്യുന്നത് തുടരണം എന്ന് കരുതുക.

append mode-നെ സൂചിപ്പിക്കുന്ന `a` എന്ന mode-ലേക്ക് നമുക്ക് മാറാം

```{code-cell} python3
with open('output2.txt', 'a') as fo:
    fo.write('\nThis is the end of the file')
```

```{code-cell} python3
with open('output2.txt', 'r') as fo:
    print(fo.read())
```

```{note}
ശ്രദ്ധിക്കുക, ഏറ്റവും സാധാരണയായി ഉപയോഗിക്കുന്ന `r`, `w`, `a` എന്നീ modes മാത്രമാണ് ഇവിടെ നമ്മൾ cover ചെയ്തത്. 
നിങ്ങൾക്ക് experiment ചെയ്യാനായി Python [പല modes](https://www.geeksforgeeks.org/python/reading-writing-text-files-python/) നൽകുന്നു.
```

### Paths

```{index} single: Python; Paths
```

ശ്രദ്ധിക്കുക, `newfile.txt` present working directory-യിൽ ഇല്ലെങ്കിൽ `open()`-ലേക്കുള്ള ഈ call fail ആകും.

ഈ അവസ്ഥയിൽ, file-നെ pwd-യിലേക്ക് മാറ്റുകയോ ആ file-ലേക്കുള്ള [full path](https://en.wikipedia.org/wiki/Path_%28computing%29) specify ചെയ്യുകയോ ചെയ്യാം

```{code-block} python3
:class: no-execute

f = open('insert_full_path_to_file/newfile.txt', 'r')
```

(iterating_version_1)=
## Iterating

```{index} single: Python; Iteration
```

Computing-ലെ ഏറ്റവും important ആയ tasks-ൽ ഒന്നാണ് data-യുടെ ഒരു sequence-ലൂടെ step ചെയ്തു പോയി, തന്നിരിക്കുന്ന ഒരു action perform ചെയ്യുക എന്നത്.

`for` loop വഴി ഇത്തരം iteration-ന് simple-ഉം flexible-ഉം ആയ ഒരു interface നൽകുന്നു എന്നതാണ് Python-ന്റെ ഒരു strength.

### Looping over Different Objects

പല Python objects-ഉം "iterable" ആണ്, അതായത് അവയ്ക്ക് മീതെ loop ചെയ്യാൻ കഴിയും.

ഒരു example നൽകാൻ, US cities-ഉം അവയുടെ population-ഉം list ചെയ്യുന്ന us_cities.txt എന്ന file present working directory-യിലേക്ക് നമുക്ക് write ചെയ്യാം.

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

Names-നെ capitalize ചെയ്തും thousands-നെ സൂചിപ്പിക്കാൻ commas ചേർത്തും ഈ information-നെ കൂടുതൽ readable ആക്കണം എന്ന് കരുതുക.

താഴെയുള്ള program data read ചെയ്ത്, ആ conversion ചെയ്യുന്നു:

```{code-cell} python3
data_file = open('us_cities.txt', 'r')
for line in data_file:
    city, population = line.split(':')         # Tuple unpacking
    city = city.title()                        # Capitalize city names
    population = f'{int(population):,}'        # Add commas to numbers
    print(city.ljust(15) + population)
data_file.close()
```

ഇവിടെ `f'` എന്നത് strings-ലേക്ക് variables [insert ചെയ്യാൻ ഉപയോഗിക്കുന്ന](https://docs.python.org/3/library/string.html#formatspec) ഒരു f-string ആണ്.

ഓരോ line-ന്റെയും reformatting മൂന്ന് different string methods-ന്റെ result ആണ്, അവയുടെ details പിന്നീട് നോക്കാം.

ഈ program-ലെ നമുക്ക് interesting ആയ ഭാഗം line 2 ആണ്, അത് കാണിക്കുന്നത്

1. File object ആയ `data_file` iterable ആണ്, അതായത് ഇതിനെ ഒരു `for` loop-ലെ `in`-ന്റെ വലതുവശത്ത് വെക്കാം.
1. Iteration file-ലെ ഓരോ line-ഇലൂടെയും step ചെയ്യുന്നു.

ഇത് നമ്മുടെ program-ൽ കാണുന്ന clean-ഉം convenient-ഉം ആയ syntax-ലേക്ക് നയിക്കുന്നു.

വേറെയും പല തരം objects iterable ആണ്, അവയിൽ ചിലതിനെക്കുറിച്ച് നമുക്ക് പിന്നീട് നോക്കാം.

### Looping without Indices

Explicit ആയ indexing ഇല്ലാതെ loop ചെയ്യുന്നതിനെ Python prefer ചെയ്യുന്നു എന്നതാണ് നിങ്ങൾ ശ്രദ്ധിച്ചിട്ടുണ്ടാകാവുന്ന ഒരു കാര്യം.

For example,

```{code-cell} python3
x_values = [1, 2, 3]  # Some iterable x
for x in x_values:
    print(x * x)
```

ഇതിനെയാണ്

```{code-cell} python3
for i in range(len(x_values)):
    print(x_values[i] * x_values[i])
```

ഇതിനേക്കാൾ prefer ചെയ്യുന്നത്.

ഈ രണ്ട് alternatives-നെ compare ചെയ്യുമ്പോൾ, ആദ്യത്തേത് എന്തുകൊണ്ട് prefer ചെയ്യുന്നു എന്ന് നിങ്ങൾക്ക് മനസ്സിലാക്കാം.

Indices ഇല്ലാതെ loop ചെയ്യുന്നത് simplify ചെയ്യാൻ Python ചില facilities നൽകുന്നു.

അതിലൊന്നാണ് `zip()`, രണ്ട് sequences-ൽ നിന്നുള്ള pairs-ഇലൂടെ step ചെയ്യാൻ ഇത് ഉപയോഗിക്കുന്നു.

For example, താഴെയുള്ള code run ചെയ്ത് നോക്കുക

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

ഒരു list-ൽ നിന്നും index വേണമെങ്കിൽ, ഒരു option `enumerate()` ഉപയോഗിക്കുക എന്നതാണ്.

`enumerate()` എന്താണ് ചെയ്യുന്നതെന്ന് മനസ്സിലാക്കാൻ, താഴെയുള്ള example നോക്കാം

```{code-cell} python3
letter_list = ['a', 'b', 'c']
for index, letter in enumerate(letter_list):
    print(f"letter_list[{index}] = '{letter}'")
```
(list_comprehensions)=
### List Comprehensions

```{index} single: Python; List comprehension
```

*List comprehension* എന്ന ഒന്ന് ഉപയോഗിച്ച്, random draws-ന്റെ list generate ചെയ്യാനുള്ള code-നെ നമുക്ക് ഗണ്യമായി simplify ചെയ്യാം.

Lists create ചെയ്യാനുള്ള ഒരു elegant Python tool ആണ് [List comprehensions](https://en.wikipedia.org/wiki/List_comprehension).

താഴെയുള്ള example നോക്കാം, രണ്ടാമത്തെ line-ന്റെ വലതുവശത്താണ് list comprehension ഉള്ളത്

```{code-cell} python3
animals = ['dog', 'cat', 'bird']
plurals = [animal + 's' for animal in animals]
plurals
```

മറ്റൊരു example താഴെ കാണാം

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

പല expressions-ഉം Boolean values-ൽ ഒന്നായി (അതായത് `True` അല്ലെങ്കിൽ `False`) evaluate ആകുന്നു.

ഒരു common type ആണ് comparisons, ഇതുപോലെ

```{code-cell} python3
x, y = 1, 2
x < y
```

```{code-cell} python3
x > y
```

Python-ന്റെ ഒരു നല്ല feature, നമുക്ക് inequalities-നെ *chain* ചെയ്യാം എന്നതാണ്

```{code-cell} python3
1 < 2 < 3
```

```{code-cell} python3
1 <= 2 <= 3
```

നമ്മൾ മുമ്പ് കണ്ടതുപോലെ, equality test ചെയ്യുമ്പോൾ `==` ഉപയോഗിക്കുന്നു

```{code-cell} python3
x = 1    # Assignment
x == 2   # Comparison
```

"Not equal"-ന് `!=` ഉപയോഗിക്കുക

```{code-cell} python3
1 != 2
```

ശ്രദ്ധിക്കുക, conditions test ചെയ്യുമ്പോൾ, valid ആയ **ഏത്** Python expression-ഉം നമുക്ക് ഉപയോഗിക്കാം

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

* Zero-യിലേക്കോ empty sequences അല്ലെങ്കിൽ containers-ലേക്കോ (strings, lists, etc.) evaluate ആകുന്ന expressions-ഉം `None`-ഉം എല്ലാം `False`-ന് equivalent ആണ്.
    * for example, ഒരു `if` clause-ൽ `[]`-ഉം `()`-ഉം `False`-ന് equivalent ആണ്
* മറ്റ് എല്ലാ values-ഉം `True`-ന് equivalent ആണ്.
    * for example, ഒരു `if` clause-ൽ `42` എന്നത് `True`-ന് equivalent ആണ്

### Combining Expressions

```{index} single: Python; Logical Expressions
```

`and`, `or`, `not` എന്നിവ ഉപയോഗിച്ച് expressions-നെ നമുക്ക് combine ചെയ്യാം.

ഇവ standard logical connectives ആണ് (conjunction, disjunction, denial)

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

ഓർക്കുക:

* രണ്ടും `True` ആണെങ്കിൽ `P and Q`, `True` ആണ്, അല്ലെങ്കിൽ `False`
* രണ്ടും `False` ആണെങ്കിൽ `P or Q`, `False` ആണ്, അല്ലെങ്കിൽ `True`

Expressions-ന്റെ ഒരു sequence test ചെയ്യാൻ `all()`, `any()` എന്നിവയും നമുക്ക് ഉപയോഗിക്കാം

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
* Sequence-ലെ *എല്ലാ* boolean values/expressions-ഉം `True` ആകുമ്പോൾ `all()` `True` return ചെയ്യുന്നു
* Sequence-ലെ *ഏതെങ്കിലും* boolean values/expressions `True` ആകുമ്പോൾ `any()` `True` return ചെയ്യുന്നു
```

## Coding Style and Documentation

ഒരു consistent ആയ coding style-ഉം documentation-ന്റെ ഉപയോഗവും, code-നെ മനസ്സിലാക്കാനും maintain ചെയ്യാനും എളുപ്പമാക്കുന്നു.

### Python Style Guidelines: PEP8

```{index} single: Python; PEP8
```

Prompt-ൽ `import this` എന്ന് type ചെയ്താൽ Python programming philosophy നിങ്ങൾക്ക് കണ്ടുപിടിക്കാം.

മറ്റ് പല കാര്യങ്ങളുടെയും കൂട്ടത്തിൽ, Python, programming style-ൽ consistency-യെ ശക്തമായി prefer ചെയ്യുന്നു.

Consistency-യെയും ചെറിയ minds-നെയും കുറിച്ചുള്ള ആ പഴഞ്ചൊല്ല് നമ്മൾ എല്ലാവരും കേട്ടിട്ടുണ്ട്.

Programming-ൽ, mathematics-ലെ പോലെ തന്നെ, നേരെ മറിച്ചാണ് ശരി

* $\cup$, $\cap$ എന്നീ symbols മാറ്റിവെച്ചിരിക്കുന്ന ഒരു mathematical paper, author ആദ്യത്തെ page-ൽ തന്നെ അത് പറഞ്ഞിരുന്നാലും read ചെയ്യാൻ വളരെ ബുദ്ധിമുട്ടായിരിക്കും.

Python-ൽ, standard style [PEP8](https://peps.python.org/pep-0008/)-ൽ set ചെയ്തിരിക്കുന്നു.

(Mathematical notation-മായി കൂടുതൽ match ചെയ്യാൻ, ഈ lectures-ൽ ചിലപ്പോൾ നമ്മൾ PEP8-ൽ നിന്നും deviate ചെയ്യും)

(Docstrings)=
### Docstrings

```{index} single: Python; Docstrings
```

Modules, classes, functions, etc.-ലേക്ക് comments ചേർക്കാൻ *docstrings* എന്ന ഒരു system Python-ന് ഉണ്ട്.

Docstrings-ന്റെ നല്ല കാര്യം, അവ run-time-ൽ available ആണ് എന്നതാണ്.

ഇത് run ചെയ്ത് നോക്കുക

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

ഒരു question mark ഉപയോഗിച്ചാൽ docstring കിട്ടും, രണ്ടെണ്ണം ഉപയോഗിച്ചാൽ source code-യും കൂടി കിട്ടും.

Docstrings-ന്റെ conventions [PEP257](https://peps.python.org/pep-0257/)-ൽ നിങ്ങൾക്ക് കാണാം.

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
