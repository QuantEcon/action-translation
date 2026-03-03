---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
heading-map:
  Definitions: 定义
  Simulation: 模拟
  Stationary Distribution: 平稳分布
---

# 马尔可夫链

本讲座介绍有限马尔可夫链。

## 定义

马尔可夫链是一种随机过程，具有以下性质：未来状态仅取决于当前状态，而与历史无关。
这一性质被称为**马尔可夫性质**（又称"无记忆性"）。

转移矩阵 $P$ 的元素为 $P_{ij} = \Pr(X_{t+1} = j \mid X_t = i)$。

需要注意的是，转移矩阵的每一行之和必须等于1，即 $\sum_j P_{ij} = 1$，
因为从任何状态出发，必须转移到某个状态（包括自身）。

## 模拟

我们可以按照以下方式模拟马尔可夫链：

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

## 平稳分布

平稳分布 $\pi$ 满足 $\pi P = \pi$。

对于有限状态的不可约马尔可夫链，平稳分布是唯一的，可以通过求解
线性方程组来得到。直观地说，$\pi_i$ 表示该链在长期运行中
处于状态 $i$ 的时间比例。
