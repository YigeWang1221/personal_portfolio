## 参数估计 {#estimation}

### 最大似然估计与 Newton–Raphson {#mle}

推导指数分布和 Beta 分布的最大似然估计量，用 Newton–Raphson 法数值求解，并检查二阶导数（Hessian）以确认得到的是极大值。在一次两人实验和我自己的作业中都用到了这个方法。

### 矩估计 {#moments}

通过匹配样本矩拟合正态分布；这是一次关于偏差与方差权衡的实验的一部分。

## 模拟 {#simulation}

### 蒙特卡罗模拟与穷举对比 {#monte-carlo}

用蒙特卡罗模拟估计概率，再与穷举全部 7⁶ 种结果得到的精确值对比，观察模拟收敛的速度。后来的一次实验还用百万次模拟求解了一组概率题。

## 贝叶斯模型 {#bayesian}

### Beta–Binomial 模型 {#beta-binomial}

在 PyMC 中用 Beta–Binomial 模型刻画胜率，其中包括一项基于模拟 F1 赛季的研究。

### 变点检测 {#switchpoint}

在 PyMC 中用泊松变点模型，找出赛车遥测数据中速率发生变化的时刻。

### 手写 Metropolis–Hastings，再对比 NUTS {#metropolis}

从零实现 Metropolis–Hastings 采样器，再在同一模型上与 PyMC 的 NUTS 采样器对比，并用 ArviZ 检查收敛情况。

### 分层模型 {#hierarchical}

在一次实验中搭建了只有三名车手的小型分层模型。它后来成为我的 F1 项目的起点，F1 项目把它扩展到了全部车手：[基于分层贝叶斯模型的 F1 比赛预测](/projects/f1-bayesian/)。

## 假设检验 {#testing}

在同一组数据上，把 Welch t 检验与均值差的贝叶斯估计做对比，比较两种方法各自给出的结论形式。

## 关于这些卡片 {#about}

部分实验是两人合作完成的，因此卡片描述的是方法，而不是个人的具体结果。这些 notebook 属于评分作业，不公开；课程的教师资料也不公开。
