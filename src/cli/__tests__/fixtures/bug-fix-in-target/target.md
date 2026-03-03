---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
heading-map:
  The Production Function: 生产函数
  Capital Accumulation: 资本积累
  Steady State: 稳态
---

# 索洛增长模型

本讲座介绍索洛增长模型。

## 生产函数

经济体使用总量生产函数进行生产：

$$
Y = K^\alpha (AL)^{1-\alpha}
$$

其中 $K$ 是资本，$L$ 是劳动力，$A$ 是技术水平，$\alpha \in (0,1)$。

## 资本积累

资本按以下公式演变：

$$
K_{t+1} = sY_t + (1-\delta)K_t
$$

其中 $s$ 是储蓄率，$\delta$ 是折旧率。

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

fig, ax = plt.subplots(figsize=(10, 6))
ax.plot(k, investment, label='投资 $sf(k)$')
ax.plot(k, depreciation, label='折旧 $\\delta k$')
ax.legend(fontsize=12)
ax.set_xlabel('人均资本 $k$', fontsize=12)
ax.set_ylabel('人均', fontsize=12)
ax.set_title('索洛模型：稳态', fontsize=14)
plt.show()
```

## 稳态

在稳态时，投资等于折旧：

$$
sf(k^*) = \delta k^*
$$

求解可得：$k^* = \left(\frac{sA}{\delta}\right)^{\frac{1}{1-\alpha}}$

注意：稳态资本存量取决于技术参数 $A$。当 $A$ 增加时，稳态资本也随之增加。
