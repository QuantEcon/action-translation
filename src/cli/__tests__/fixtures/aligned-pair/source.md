---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Linear Algebra

This lecture covers basic linear algebra concepts for economics.

## Vectors

A vector is an ordered list of numbers. In economics, we use vectors to represent
quantities like price vectors and consumption bundles.

$$
\mathbf{x} = \begin{pmatrix} x_1 \\ x_2 \\ \vdots \\ x_n \end{pmatrix}
$$

## Matrix Multiplication

Given matrices $A$ and $B$, the product $C = AB$ is defined when the number of
columns in $A$ equals the number of rows in $B$.

```{code-cell} python3
import numpy as np

A = np.array([[1, 2], [3, 4]])
B = np.array([[5, 6], [7, 8]])
C = A @ B
print(C)
```

## Applications

Linear algebra is used extensively in input-output analysis, portfolio theory,
and general equilibrium models.
