#!/usr/bin/env python3
"""
Build the four injection SITES.

A site is one (source edit, control translation) pair. The source edit is a
realistic English lecture change confined to ONE `##`+ section; the control
translation is that change rendered correctly into Simplified Chinese.

Why the confinement matters: the reviewer is instructed that "findings MUST
relate ONLY to the sections changed in this PR", and `identifyChangedSections`
derives those from the SOURCE diff. An injection outside a source-changed
section therefore measures scope suppression, not detection — so every M0
injection lands inside its site's section, and the out-of-scope classes
(de-localisation) are labelled as such deliberately.

Emits, per site:  src.<file>  (source PR head)   zh.<file>  (control PR head)
"""
import pathlib, sys, json

HERE = pathlib.Path(__file__).parent
BASE = HERE / "fixtures" / "base"
OUT = HERE / "fixtures" / "sites"

def load(name):
    return (BASE / name).read_text(encoding="utf-8")

def sub(text, find, replace, label):
    n = text.count(find)
    if n != 1:
        sys.exit(f"FATAL [{label}]: anchor occurs {n} times, expected exactly 1:\n{find[:120]!r}")
    return text.replace(find, replace)

src_lecture = load("src.lecture.md")
zh_lecture  = load("zh.lecture.md")
src_min     = load("src.lecture-minimal.md")
zh_min      = load("zh.lecture-minimal.md")

sites = {}

# ---------------------------------------------------------------- SITE A ----
# lecture.md :: "## Matrix Operations" — prose + code cell.
# Adds a non-commutativity paragraph and a pandas table whose axis names are
# referenced in prose. The axis names are the ground truth for
# `over-translation-of-identifiers`: code defines them, prose must not rename
# them.
A_SRC_ANCHOR = """Matrix multiplication allows us to compose linear transformations. For matrices $A$ and $B$, the product $AB$ represents applying transformation $B$ followed by transformation $A$.

Let's demonstrate matrix operations with an economic application:"""
A_SRC_NEW = """Matrix multiplication allows us to compose linear transformations. For matrices $A$ and $B$, the product $AB$ represents applying transformation $B$ followed by transformation $A$.

The order of composition matters, because matrix multiplication is not commutative: in general $AB \\neq BA$. This is not a technicality. When two policies are represented as matrices, whether they commute decides whether applying them in the other order would have produced the same economy.

Let's demonstrate matrix operations with an economic application:"""

A_CODE_ANCHOR = """print("\\nTotal Output Required (billions):")
print(np.round(total_output, 2))
```"""
A_CODE_NEW = """print("\\nTotal Output Required (billions):")
print(np.round(total_output, 2))

# Label the same matrix so the axes carry economic meaning
import pandas as pd

sectors = ['Agriculture', 'Manufacturing', 'Services']
io_table = pd.DataFrame(input_output, index=sectors, columns=sectors)
io_table.index.name = 'using_sector'
io_table.columns.name = 'supplying_sector'
print(io_table)
```

The labelled table is indexed by `using_sector` down the rows and `supplying_sector` across the columns, so reading down a single column shows what one sector supplies to every other sector."""

a_src = sub(src_lecture, A_SRC_ANCHOR, A_SRC_NEW, "A/src/prose")
a_src = sub(a_src, A_CODE_ANCHOR, A_CODE_NEW, "A/src/code")

A_ZH_ANCHOR = """矩阵乘法允许我们组合线性变换。对于矩阵 $A$ 和 $B$，乘积 $AB$ 表示先应用变换 $B$，然后应用变换 $A$。

让我们用一个经济应用来演示矩阵运算："""
A_ZH_NEW = """矩阵乘法允许我们组合线性变换。对于矩阵 $A$ 和 $B$，乘积 $AB$ 表示先应用变换 $B$，然后应用变换 $A$。

复合的顺序很重要，因为矩阵乘法不满足交换律：一般而言 $AB \\neq BA$。这并非细枝末节。当两项政策被表示为矩阵时，它们是否可交换决定了以相反顺序实施这两项政策是否会得到相同的经济结果。

让我们用一个经济应用来演示矩阵运算："""

A_ZHCODE_ANCHOR = """print("\\n所需总产出（十亿）：")
print(np.round(total_output, 2))
```"""
A_ZHCODE_NEW = """print("\\n所需总产出（十亿）：")
print(np.round(total_output, 2))

# 为同一矩阵加上标签，使其坐标轴具有经济含义
import pandas as pd

sectors = ['Agriculture', 'Manufacturing', 'Services']
io_table = pd.DataFrame(input_output, index=sectors, columns=sectors)
io_table.index.name = 'using_sector'
io_table.columns.name = 'supplying_sector'
print(io_table)
```

带标签的表格按行以 `using_sector` 为索引，按列以 `supplying_sector` 为索引，因此沿着某一列向下读取即可看出一个部门向其他每个部门供应了什么。"""

a_zh = sub(zh_lecture, A_ZH_ANCHOR, A_ZH_NEW, "A/zh/prose")
a_zh = sub(a_zh, A_ZHCODE_ANCHOR, A_ZHCODE_NEW, "A/zh/code")

sites["A"] = dict(
    section="## Matrix Operations",
    file="lecture.md",
    src=a_src, zh=a_zh,
    note="prose + code cell + pandas axis names (identifier ground truth)",
)

# ---------------------------------------------------------------- SITE B ----
# lecture.md :: "## Eigenvalues and Eigenvectors" — adds a {doc} cross-reference
# whose link TEXT is display prose (must be localised) and an {eq} reference
# whose label is a cross-reference target (must NOT be localised). That pair is
# the ground truth for the in-document half of `de-localisation`.
B_SRC_ANCHOR = """where $\\lambda$ is the eigenvalue. This fundamental equation appears throughout economics, from growth theory to stability analysis."""
B_SRC_NEW = """where $\\lambda$ is the eigenvalue. This fundamental equation appears throughout economics, from growth theory to stability analysis.

Readers who want the economic background first should see {doc}`the introductory lecture <lecture-minimal>`, which sets up supply and demand without any matrix algebra. Equation {eq}`eigenvalue-equation` is the anchor for everything that follows in this section."""

b_src = sub(src_lecture, B_SRC_ANCHOR, B_SRC_NEW, "B/src")

B_ZH_ANCHOR = """其中 $\\lambda$ 是特征值。这个基本方程贯穿整个经济学，从增长理论到稳定性分析。"""
B_ZH_NEW = """其中 $\\lambda$ 是特征值。这个基本方程贯穿整个经济学，从增长理论到稳定性分析。

希望先了解经济学背景的读者可以参阅 {doc}`入门讲义 <lecture-minimal>`，该讲义在不使用矩阵代数的情况下介绍了供给与需求。方程 {eq}`eigenvalue-equation` 是本节后续全部内容的基础。"""

b_zh = sub(zh_lecture, B_ZH_ANCHOR, B_ZH_NEW, "B/zh")

sites["B"] = dict(
    section="## Eigenvalues and Eigenvectors",
    file="lecture.md",
    src=b_src, zh=b_zh,
    note="{doc} link text (localise) + {eq} label (do not localise)",
)

# ---------------------------------------------------------------- SITE C ----
# lecture-minimal.md :: "## Supply and Demand" — plain prose only. This is the
# diff shape closest to a real auto-merge-eligible sync PR, and the cleanest
# host for meaning inversions, which need no structural affordance.
C_SRC_ANCHOR = """When markets are in equilibrium, the quantity supplied equals the quantity demanded. This equilibrium price balances the interests of buyers and sellers."""
C_SRC_NEW = """When markets are in equilibrium, the quantity supplied equals the quantity demanded. This equilibrium price balances the interests of buyers and sellers.

A price set above the equilibrium level leaves some sellers unable to find buyers, and the resulting surplus pushes the price back down. Does the adjustment happen quickly? That depends on how responsive quantities are to price, which is why the slope of each curve matters as much as its position."""

c_src = sub(src_min, C_SRC_ANCHOR, C_SRC_NEW, "C/src")

C_ZH_ANCHOR = """当市场处于均衡状态时，供给量等于需求量。这个均衡价格平衡了买家和卖家的利益。"""
C_ZH_NEW = """当市场处于均衡状态时，供给量等于需求量。这个均衡价格平衡了买家和卖家的利益。

如果价格被设定在均衡水平之上，部分卖方将找不到买方，由此产生的过剩会将价格重新压低。这种调整会很快发生吗？这取决于数量对价格的反应程度，因此每条曲线的斜率与其位置同样重要。"""

c_zh = sub(zh_min, C_ZH_ANCHOR, C_ZH_NEW, "C/zh")

sites["C"] = dict(
    section="## Supply and Demand",
    file="lecture-minimal.md",
    src=c_src, zh=c_zh,
    note="plain prose — the production sync shape; hosts meaning inversions",
)

# ---------------------------------------------------------------- SITE D ----
# lecture.md :: "## Vector Spaces" — the source edit adds a seaborn theme call
# to the EXISTING code cell (no new directive, so structural parity holds).
# The correct translation adds the CJK font override AFTER set_theme; the
# injected variant moves it before, which is the catalogue's ordering variant.
D_SRC_ANCHOR = """```{code-cell} python
import numpy as np
import matplotlib.pyplot as plt

# Create two vectors"""
D_SRC_NEW = """```{code-cell} python
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# Use a consistent house style for every figure in this lecture
sns.set_theme(style='whitegrid')

# Fix the seed so the jitter below is reproducible
np.random.seed(42)
jitter = np.random.normal(scale=0.05, size=2)

# Create two vectors"""


D_AX_ANCHOR = """ax.set_xlabel('x-axis')
ax.set_ylabel('y-axis')"""
D_AX_SRC = """ax.set_xlabel(r'$\\alpha$ component')
ax.set_ylabel(r'$\\beta$ component')"""

D_AX_ANCHOR_ZH = """ax.set_xlabel('x轴')
ax.set_ylabel('y轴')"""
D_AX_ZH = """ax.set_xlabel(r'$\\alpha$ 分量')
ax.set_ylabel(r'$\\beta$ 分量')"""

d_src = sub(src_lecture, D_SRC_ANCHOR, D_SRC_NEW, "D/src")
d_src = sub(d_src, D_AX_ANCHOR, D_AX_SRC, "D/src/axes")

D_ZH_ANCHOR = """```{code-cell} python
import numpy as np
import matplotlib.pyplot as plt

# 创建两个向量"""
D_ZH_NEW = """```{code-cell} python
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# 为本讲义的所有图形使用统一的样式
sns.set_theme(style='whitegrid')

# set_theme 会重置字体设置，因此中文字体必须在其之后配置
plt.rcParams['font.family'] = ['Noto Sans CJK SC', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False

# 固定随机种子，使下面的抖动可复现
np.random.seed(42)
jitter = np.random.normal(scale=0.05, size=2)

# 创建两个向量"""

d_zh = sub(zh_lecture, D_ZH_ANCHOR, D_ZH_NEW, "D/zh")
d_zh = sub(d_zh, D_AX_ANCHOR_ZH, D_AX_ZH, "D/zh/axes")

sites["D"] = dict(
    section="## Vector Spaces",
    file="lecture.md",
    src=d_src, zh=d_zh,
    note="seaborn theme in the existing cell — hosts the font-block ordering variant",
)


# ---------------------------------------------------------------- SITE E ----
# lecture-minimal.md :: "## Economic Models" — the affordance host. Carries a
# Wikipedia link, a bold definition, a target anchor, a {todo} the source keeps,
# a Latin-script term name, inline math against CJK, and a small code cell.
# Between them these support every deterministic-check control and every
# negative control without contorting the other four sites.
E_SRC_ANCHOR = """Models make assumptions to simplify reality. While no model is perfect, good models provide valuable insights into how the economy works."""
E_SRC_NEW = """Models make assumptions to simplify reality. While no model is perfect, good models provide valuable insights into how the economy works.

A model's **calibration** is the choice of parameter values that makes its predictions line up with observed data. Calibration is not estimation: it fixes parameters by matching a handful of target moments rather than by maximising a likelihood. Search models such as the McCall model are usually calibrated this way. See the [Wikipedia entry on calibration](https://en.wikipedia.org/wiki/Calibration_(statistics)) for the statistical background.

```{todo}
Add a worked calibration example once the data appendix is finalised.
```

(sec:calibration)=
### Calibration in Practice

In practice a modeller picks a discount factor $\\beta$ close to $0.95$ and then checks whether the implied capital-output ratio is plausible.

```{code-cell} python
# A one-line calibration check
beta = 0.95
print(f"annual discount rate: {1 / beta - 1:.2%}")
```"""

e_src = sub(src_min, E_SRC_ANCHOR, E_SRC_NEW, "E/src")

E_ZH_HEADINGS_ANCHOR = """    Supply and Demand: 供给与需求
    Economic Models: 经济模型"""
E_ZH_HEADINGS_NEW = """    Supply and Demand: 供给与需求
    Economic Models: 经济模型
    Economic Models::Calibration in Practice: 实践中的校准"""

E_ZH_ANCHOR = """模型做出假设以简化现实。虽然没有模型是完美的，但好的模型可以提供关于经济如何运作的宝贵见解。"""
E_ZH_NEW = """模型做出假设以简化现实。虽然没有模型是完美的，但好的模型可以提供关于经济如何运作的宝贵见解。

模型的**校准**是指选择一组参数值，使模型的预测与观测数据相吻合。校准不是估计：它通过匹配少数几个目标矩来确定参数，而不是通过最大化似然函数。诸如 McCall 模型这样的搜寻模型通常就是这样校准的。统计学背景可参阅 [维基百科的校准条目](https://en.wikipedia.org/wiki/Calibration_(statistics))。

```{todo}
Add a worked calibration example once the data appendix is finalised.
```

(sec:calibration)=
### 实践中的校准

在实践中，建模者会选取一个接近 $0.95$ 的贴现因子 $\\beta$，然后检查由此隐含的资本产出比是否合理。

```{code-cell} python
# 一行式校准检查
beta = 0.95
print(f"annual discount rate: {1 / beta - 1:.2%}")
```"""

e_zh = sub(zh_min, E_ZH_HEADINGS_ANCHOR, E_ZH_HEADINGS_NEW, "E/zh/headings")
e_zh = sub(e_zh, E_ZH_ANCHOR, E_ZH_NEW, "E/zh")

sites["E"] = dict(
    section="## Economic Models",
    file="lecture-minimal.md",
    src=e_src, zh=e_zh,
    note="affordance host: wiki link, bold, anchor, {todo}, Latin term, inline math, code cell",
)

# ------------------------------------------------------------------ emit ----
OUT.mkdir(parents=True, exist_ok=True)
index = {}
for key, s in sites.items():
    (OUT / f"{key}.src.{s['file']}").write_text(s["src"], encoding="utf-8")
    (OUT / f"{key}.zh.{s['file']}").write_text(s["zh"], encoding="utf-8")
    index[key] = {k: v for k, v in s.items() if k not in ("src", "zh")}
    index[key]["srcFile"] = f"{key}.src.{s['file']}"
    index[key]["zhFile"] = f"{key}.zh.{s['file']}"
(OUT / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps(index, indent=2, ensure_ascii=False))
