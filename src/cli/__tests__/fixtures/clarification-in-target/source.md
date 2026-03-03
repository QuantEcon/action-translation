---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
---

# Markov Chains

This lecture introduces finite Markov chains.

## Definitions

A Markov chain is a stochastic process with the property that the future state
depends only on the current state, not on the history.

The transition matrix $P$ has entries $P_{ij} = \Pr(X_{t+1} = j \mid X_t = i)$.

## Simulation

We can simulate a Markov chain as follows:

```{code-cell} python3
import numpy as np

P = np.array([[0.9, 0.1],
              [0.3, 0.7]])

states = [0]
for t in range(100):
    current = states[-1]
    next_state = np.random.choice([0, 1], p=P[current])
    states.append(next_state)

print(f"Final state: {states[-1]}")
```

## Stationary Distribution

A stationary distribution $\pi$ satisfies $\pi P = \pi$.
