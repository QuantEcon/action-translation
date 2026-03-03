---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
heading-map:
  The Bellman Equation: 贝尔曼方程
  Numerical Solution: 数值解
  Policy Function: 策略函数
---

# 动态规划

本讲座介绍动态规划方法。

## 贝尔曼方程

价值函数满足贝尔曼方程：

$$
V(x) = \max_a \{u(x, a) + \beta V(T(x, a))\}
$$

## 数值解

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

## 策略函数

最优策略函数为：

$$
a^*(x) = \arg\max_a \{u(x, a) + \beta V(T(x, a))\}
$$
