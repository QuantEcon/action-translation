---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Dynamic Programming

This lecture introduces dynamic programming methods.

## The Bellman Equation

The value function satisfies the Bellman equation:

$$
V(x) = \max_a \{u(x, a) + \beta V(T(x, a))\}
$$

## Numerical Solution

```{code-cell} python3
import numpy as np

beta = 0.95
n_states = 50
grid = np.linspace(0, 10, n_states)

V = np.zeros(n_states)
for iteration in range(200):
    V_new = np.zeros(n_states)
    for i, x in enumerate(grid):
        values = np.log(x + 1) + beta * V
        V_new[i] = np.max(values)
    V = V_new

print(f"Converged value at x=5: {V[25]:.4f}")
```

## Policy Function

The optimal policy function is:

$$
a^*(x) = \arg\max_a \{u(x, a) + \beta V(T(x, a))\}
$$
