---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  language: python
  name: python3
heading-map:
  Linear Algebra Foundations: مبانی جبر خطی
  Vector Spaces: فضاهای برداری
  Vector Spaces::Basic Properties: ویژگی‌های اساسی
  Vector Spaces::Basic Properties::Applications in Economics: کاربردها در اقتصاد
  Matrix Operations: عملیات ماتریسی
  Matrix Operations::Applications in Economics: کاربردها در اقتصاد
  Eigenvalues and Eigenvectors: مقادیر ویژه و بردارهای ویژه
---

# مبانی جبر خطی

این درس مفاهیم بنیادی جبر خطی را که برای اقتصاد کمی ضروری هستند معرفی می‌کند. فضاهای برداری، ماتریس‌ها و کاربردهای آن‌ها در مسائل اقتصادی را بررسی خواهیم کرد.

## فضاهای برداری

فضای برداری مجموعه‌ای از اشیاء به نام بردار است که می‌توان آن‌ها را با هم جمع کرد و در اسکالرها ضرب نمود. درک فضاهای برداری برای تحلیل اقتصادی مدرن ضروری است.

از نظر ریاضی، یک بردار $\mathbf{v} \in \mathbb{R}^n$ را می‌توان به صورت زیر نمایش داد:

$$
\mathbf{v} = \begin{bmatrix} v_1 \\ v_2 \\ \vdots \\ v_n \end{bmatrix}
$$

بیایید برخی بردارها را در پایتون ایجاد و تجسم کنیم:

```{code-cell} python
import numpy as np
import matplotlib.pyplot as plt

# ایجاد دو بردار
v1 = np.array([2, 3])
v2 = np.array([1, 4])

# تجسم بردارها
fig, ax = plt.subplots(figsize=(8, 6))
ax.quiver(0, 0, v1[0], v1[1], angles='xy', scale_units='xy', scale=1, color='blue', label='v1')
ax.quiver(0, 0, v2[0], v2[1], angles='xy', scale_units='xy', scale=1, color='red', label='v2')
ax.set_xlim(-1, 5)
ax.set_ylim(-1, 5)
ax.set_xlabel('محور x')
ax.set_ylabel('محور y')
ax.set_title('نمایش بردار در فضای دوبعدی')
ax.legend()
ax.grid(True)
plt.show()
```

### ویژگی‌های اساسی

فضاهای برداری چند ویژگی کلیدی را برآورده می‌سازند:
- بسته بودن نسبت به جمع و ضرب اسکالری
- وجود هویت جمعی (بردار صفر)
- وجود معکوس‌های جمعی

این ویژگی‌ها تضمین می‌کنند که فضاهای برداری تحت عملیات ریاضی رفتاری قابل پیش‌بینی دارند.

#### کاربردها در اقتصاد

ویژگی‌های فضای برداری در مدل‌سازی اقتصادی بنیادی هستند. ویژگی بسته بودن تضمین می‌کند که ترکیب‌های تخصیص‌های امکان‌پذیر، امکان‌پذیر باقی می‌مانند، در حالی که وجود معکوس‌ها به ما امکان می‌دهد بدهی‌ها و تعهدات را مدل‌سازی کنیم.

مجموع دو بردار $\mathbf{u}$ و $\mathbf{v}$ به صورت مؤلفه‌ای تعریف می‌شود:

```{math}
\mathbf{u} + \mathbf{v} = \begin{bmatrix} u_1 + v_1 \\ u_2 + v_2 \\ \vdots \\ u_n + v_n \end{bmatrix}
```

## عملیات ماتریسی

ماتریس‌ها آرایه‌های مستطیلی از اعداد هستند که تبدیل‌های خطی را نمایش می‌دهند. آن‌ها ابزارهای بنیادی در مدل‌سازی اقتصادی و تحلیل داده هستند.

یک ماتریس کلی $m \times n$ دارای شکل زیر است:

$$
A = \begin{bmatrix}
a_{11} & a_{12} & \cdots & a_{1n} \\
a_{21} & a_{22} & \cdots & a_{2n} \\
\vdots & \vdots & \ddots & \vdots \\
a_{m1} & a_{m2} & \cdots & a_{mn}
\end{bmatrix}
$$

ضرب ماتریسی به ما امکان می‌دهد تبدیل‌های خطی را ترکیب کنیم. برای ماتریس‌های $A$ و $B$، حاصل‌ضرب $AB$ نشان‌دهنده اعمال تبدیل $B$ و سپس تبدیل $A$ است.

بیایید عملیات ماتریسی را با یک کاربرد اقتصادی نشان دهیم:

```{code-cell} python
# ایجاد یک ماتریس داده-ستانده ساده برای یک اقتصاد سه‌بخشی
# بخش‌ها: کشاورزی، تولید، خدمات
input_output = np.array([
    [0.2, 0.3, 0.1],  # نهاده‌های کشاورزی
    [0.3, 0.2, 0.2],  # نهاده‌های تولید
    [0.1, 0.2, 0.3]   # نهاده‌های خدمات
])

# بردار تقاضای نهایی (به میلیارد)
final_demand = np.array([100, 150, 200])

# محاسبه تولید کل با استفاده از معکوس لئونتیف: x = (I - A)^{-1} * d
I = np.eye(3)
leontief_inverse = np.linalg.inv(I - input_output)
total_output = leontief_inverse @ final_demand

print("ماتریس داده-ستانده:")
print(input_output)
print("\nمعکوس لئونتیف:")
print(np.round(leontief_inverse, 3))
print("\nتولید کل مورد نیاز (میلیارد):")
print(np.round(total_output, 2))
```

### کاربردها در اقتصاد

مدل‌های اقتصادی اغلب از ماتریس‌ها برای نمایش موارد زیر استفاده می‌کنند:
- روابط داده-ستانده در تولید
- احتمالات انتقال در زنجیره‌های مارکوف
- ماتریس‌های ضریب در سیستم‌های معادلات خطی

معکوس لئونتیف $(I - A)^{-1}$ از اهمیت ویژه‌ای برخوردار است، که در آن $I$ ماتریس همانی و $A$ ماتریس ضرایب داده-ستانده است.

## مقادیر ویژه و بردارهای ویژه

مقادیر ویژه و بردارهای ویژه ویژگی‌های مهم تبدیل‌های خطی را آشکار می‌سازند. یک بردار ویژه $v$ از ماتریس $A$ رابطه زیر را برآورده می‌کند:

```{math}
:label: eigenvalue-equation
Av = \lambda v
```

که در آن $\lambda$ مقدار ویژه است. این معادله بنیادی در سراسر اقتصاد، از نظریه رشد تا تحلیل پایداری، ظاهر می‌شود.

برای یک ماتریس $n \times n$ به نام $A$، چندجمله‌ای مشخصه عبارت است از:

$$
\det(A - \lambda I) = 0
$$

حل این معادله مقادیر ویژه را به دست می‌دهد. بیایید مقادیر ویژه را برای یک ماتریس انتقال محاسبه کنیم:

```{code-cell} python
# ایجاد یک ماتریس انتقال برای یک زنجیره مارکوف ساده
# حالات: شاغل، بیکار
transition_matrix = np.array([
    [0.95, 0.05],  # شاغل -> (شاغل، بیکار)
    [0.20, 0.80]   # بیکار -> (شاغل، بیکار)
])

# محاسبه مقادیر ویژه و بردارهای ویژه
eigenvalues, eigenvectors = np.linalg.eig(transition_matrix)

print("ماتریس انتقال:")
print(transition_matrix)
print("\nمقادیر ویژه:")
print(np.round(eigenvalues, 4))
print("\nبردارهای ویژه:")
print(np.round(eigenvectors, 4))

# بردار ویژه متناظر با مقدار ویژه 1 توزیع حالت پایدار را می‌دهد
steady_state_index = np.argmax(eigenvalues)
steady_state = eigenvectors[:, steady_state_index]
steady_state = steady_state / steady_state.sum()  # نرمال‌سازی

print("\nتوزیع حالت پایدار:")
print(f"شاغل: {steady_state[0]:.2%}")
print(f"بیکار: {steady_state[1]:.2%}")
```

این مفاهیم برای تحلیل سیستم‌های اقتصادی پویا، مانند مدل‌های رشد و تحلیل پایداری، ضروری هستند.

روش تکرار توانی را می‌توان برای یافتن مقدار ویژه غالب استفاده کرد:

$$
\lambda_1 = \lim_{k \to \infty} \frac{\|A^k \mathbf{v}_0\|}{\|A^{k-1} \mathbf{v}_0\|}
$$