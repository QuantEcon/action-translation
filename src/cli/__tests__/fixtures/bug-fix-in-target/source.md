---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Solow Growth Model

This lecture introduces the Solow growth model.

## The Production Function

The economy produces output using the aggregate production function:

$$
Y = K^\alpha (AL)^{1-\alpha}
$$

where $K$ is capital, $L$ is labor, $A$ is technology, and $\alpha \in (0,1)$.

## Capital Accumulation

Capital evolves according to:

$$
K_{t+1} = sY_t + (1-\delta)K_t
$$

where $s$ is the savings rate and $\delta$ is the depreciation rate.

```{code-cell} python3
import numpy as np
import matplotlib.pyplot as plt

alpha = 0.3
s = 0.2
delta = 0.05
A = 1.0

k = np.linspace(0.1, 50, 100)
y = A * k**alpha
investment = s * y
depreciation = delta * k

fig, ax = plt.subplots()
ax.plot(k, investment, label='Investment $sf(k)$')
ax.plot(k, depreciation, label='Depreciation $\\delta k$')
ax.legend()
ax.set_xlabel('Capital per worker $k$')
ax.set_ylabel('Per worker')
ax.set_title('Solow Model: Steady State')
plt.show()
```

## Steady State

At the steady state, investment equals depreciation:

$$
sf(k^*) = \delta k^*
$$

Solving: $k^* = \left(\frac{s}{\delta}\right)^{\frac{1}{1-\alpha}}$
