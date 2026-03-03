---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
heading-map:
  Vectors: 向量
  Matrix Multiplication: 矩阵乘法
  Applications: 应用
---

# 线性代数

本讲座介绍经济学中的基本线性代数概念。

## 向量

向量是一组有序的数字。在经济学中，我们使用向量来表示价格向量和消费束等数量。

$$
\mathbf{x} = \begin{pmatrix} x_1 \\ x_2 \\ \vdots \\ x_n \end{pmatrix}
$$

## 矩阵乘法

给定矩阵 $A$ 和 $B$，当 $A$ 的列数等于 $B$ 的行数时，乘积 $C = AB$ 才有定义。

```{code-cell} python3
import numpy as np

A = np.array([[1, 2], [3, 4]])
B = np.array([[5, 6], [7, 8]])
C = A @ B
print(C)
```

## 应用

线性代数广泛应用于投入产出分析、投资组合理论和一般均衡模型。
