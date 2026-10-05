# bfc-cut — 板材排样与切割优化器

> 英文原版：[English](../README.md) · 在线计算器：[https://boardfootcalc.net/board-foot-cut-list-calculator/](https://boardfootcalc.net/board-foot-cut-list-calculator/)

在下锯之前，为每一块板材生成真实的**二维切割排样图**。考虑锯缝的 guillotine 切割，支持纹理与缺陷约束、五种评分策略，可打印 SVG / PDF 切割图与 CSV 导出 — 补上切割清单与锯机之间的缺失环节。

相关指南：Companion guide: [板尺切割清单计算器](https://boardfootcalc.net/board-foot-cut-list-calculator/) · See also [如何计算板尺](https://boardfootcalc.net/how-to-calculate-board-feet/) · and [板尺与平方英尺的区别](https://boardfootcalc.net/board-feet-vs-square-feet/)。

## 功能

- **真实二维 guillotine 排样** — 零件放置到每块板上，每次切割把剩余自由矩形一分为二，每刀消耗**锯缝**宽度（默认 1/8"）。
- **缺陷区域** — 标记的缺陷矩形周围不排零件；零件永远不会落在缺陷上。
- **纹理与净边约束** — 启用纹理约束时，竖纹零件和要求净边（`one-clean` / `two-clean`）的零件不会旋转。
- **5 种策略** — `max-yield` 最高出材、`min-waste` 最少废料、`min-cuts` 最少刀数、`grain-priority` 纹理优先、`balanced` 均衡。
- **修边/拼接/刨光余量** — 面向真实车间的定尺逻辑。
- **余料策略** — 可设置值得保留的最短余料长度，剩余料计入出材率。
- **导出** — SVG 切割图（真实比例、零件标注、缺陷标记）、PDF 切割方案（每板一页+切割顺序）、CSV 排布/切割顺序/汇总、完整 JSON。

## 安装

```bash
git clone <your-repo-url> 03-board-cutting-optimizer
cd 03-board-cutting-optimizer
npm install
npm run build        # 编译到 dist/
npm test             # 14 个测试
```

## 快速开始

```bash
npm run demo
bfc-cut plan --boards boards.csv --parts parts.csv --strategy balanced
```

完整命令参考、输入格式与实现原理请见[英文 README](../README.md)。

## 计算引擎

本工具内置了共享的 [BoardFootCalc Desktop 木材计算引擎](https://boardfootcalc.net/board-foot-cut-list-calculator/)
的冻结副本（位于 `src/core/`，涵盖板尺、单位、标称/实际厚度、四分之一厚度、
浪费系数、木种、计价与 CSV）。五个工具共用同一套数学逻辑，因此这里算出的数字
与网站上的在线计算器完全一致。

## 许可

MIT。估算结果仅供规划参考 — 采购前请与您的木材经销商核实尺寸、锯缝与价格。
