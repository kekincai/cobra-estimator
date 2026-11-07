# Estima — CoBRA 法 工数見積り Web 版 实现说明

> 给实现者（Claude Opus 或工程师）的交接文档。目标是把 `design/` 里的 14 个画面设计稿做成可运行的 Web 应用。
> 设计稿（可交互）：https://claude.ai/artifact/Qgo5ctFGkFRXFmHe9fh7en
> 旧 Excel 版要件定义书：`工数見積もり.xlsx`（IPA「CoBRA法に基づく見積り支援ツール 統合見積りモデル機能」v1.3, 2009）

---

## 0. 一句话

用 CoBRA 法做软件工数估算：**工数 = α × 規模 × (1 + ΣCO)**。α 从过去实绩算出，ΣCO 来自专家给的"变动要因"三角分布，用蒙特卡洛得到工数分布，再做风险评估和 A4 报告。旧版是 Excel + VBA 单机工具，这次做成组织内共享的 Web 应用，UI 日文，概念与旧版一一对应。

---

## 1. 参考资料怎么用

| 资料 | 用途 |
|---|---|
| `design/*.dc.html` | 14 个画面的**像素级设计稿**。每个文件是自包含 HTML：`<x-dc>` 里是标记和内联样式，`<helmet><style>` 是页面级 CSS，底部 `<script type="text/x-dc">` 里的 `class Component` 是交互逻辑（React 风格 state + `renderVals()` 返回模板变量）。**样式、文案、交互和示例数值以此为准。** |
| `design/canvas.json` | 画面清单、尺寸、分组。 |
| `工数見積もり.xlsx` | 旧版要件。业务 ID（J-MDL-001 等）在本文 §5 已映射到画面，一般不必再读；需要时用 `uv run --with openpyxl python -I dump.py` 之类脚本转文本。 |
| 本文 | 领域规则、数据模型、计算定义、画面间关系、验收标准。**设计稿与本文数值不一致时以本文为准**（设计稿各页为了演示用了少量不同的示例数据）。 |

设计稿模板语法速查（读 `.dc.html` 时会碰到）：`{{x}}` 插值；`<sc-for list="{{items}}" as="i">` 循环；`<sc-if value="{{flag}}">` 条件；`style="{{obj}}"` 绑定样式对象；`onClick="{{fn}}"` 事件。`data-props` 里的 `accent` 是可调的主题色，默认 `#D4FF4F`。

---

## 2. 领域模型与计算规则

### 2.1 实体

```
Model            见積りモデル（组织内一个主模型，可多个）
  ├ Factor[]     変動要因（8 个起步，可增删）
  │   ├ levels[4]        L0〜L3 の定義文
  │   ├ kind             direct | indirect
  │   ├ targetFactorId   kind=indirect 时必填：强化的直接要因（一个直接要因最多挂一个间接要因；间接不能再被间接强化）
  │   └ Triangle[]       三角分布，按専門家（担当者）一人一条：{ expert, best, likely, worst }  // L3 时的工数增加率（0.26 = +26%）
  ├ Group[]      実績データのグループ（A / B …）
  ├ Project[]    プロジェクト実績：{ name, groupId, sizeFP, effortMM, levels[nFactors], note, adopted, excludedReason }
  ├ ModelVersion[] 構築結果：{ version, builtAt, builtBy, expertMode, groupId, runs, seed, alpha, ci95:[lo,hi], mmre, pred25, looErrors[], inconsistencies[], active }
  └ Estimate[]   見積り案件：{ name, generations: Generation[] (≤5), reportGenerationId }
        Generation { id G1..G5, sizeFP, levels[], notes, runs, seed, results: { p50, pct[5..95], histogram[], contributions[], sco } , createdAt }
```

单位：规模统一存 **FP**，工数统一存 **人月**。录入时允许 KLOC / 画面数、人時，按换算系数转存（默认 1 KLOC = 100 FP，1 画面 = 30 FP，160 h = 1 人月；系数可配置）。

### 2.2 CO（Cost Overhead）的计算

对直接要因 *i*，等级 *L*∈{0,1,2,3}，专家 *e* 的三角分布 (best, likely, worst)：

- L0 → CO = 0
- 三角分布按等级**线性内插**：`tri_L = tri_L3 × L / 3`（best/likely/worst 三个点同时乘 L/3）
- 蒙特卡洛每次试行从 `tri_L` 抽一个值作为 `CO_i`；确定性计算（表格、寄与度）用期望值 `(best+likely+worst)/3`
- **间接要因**：不加自己的 CO，而是给目标直接要因乘倍率 `m = 1 + k × L_indirect/3`。本项目取 `k = 0.225`（L2 → ×1.15，L3 → ×1.225）。设为模型级常量，可配置
- `ΣCO = Σ_i CO_i × m_i`
- 专家选择 `expertMode`：某一位专家 / "平均"（各点取专家平均后再抽样）

### 2.3 工数

```
nominal   = α × sizeFP
overhead  = nominal × ΣCO
effort    = nominal × (1 + ΣCO) × ε,   ε = exp(σ·z),  z ~ N(0, 1)
```

蒙特卡洛：`runs` 次（默认 10,000；可选 1,000 / 100,000），固定 `seed`（默认固定，可"每次更新"）。输出：排序后的 effort 数组 → p5/p20/p50/p80/p95、24 桶直方图、各要因寄与（`contribution_i = nominal × E[CO_i × m_i]`，单位人月与占比）。**推定值 = P50（超过概率 50%）**，报告和 UI 都要注明。

**模型误差 ε**（2026-11 追加，理由见 §11）：只对三角分布抽样时，ΣCO 是若干个小的有界分布之和，P5–P95 只有 P50 的 ±7% 左右，远窄于实绩的散布。因此每次试行再乘一个对数正态的模型误差 `ε = exp(σ·z)`：

- `σ` = 所用模型版本的**预测误差**，即 LOO 残差的对数 RMS（§2.4），由 `buildModel` 输出（`BuildResult.sigma`），也可从保存的 `looErrors` 用 `predictiveSigma(loo)` 重算。传给 `EstimateInput.sigma`；未指定或 0 时退化为只有 CO 的旧行为
- `ε` 的中位数为 1，所以 `P50 ≈ nominal × (1 + E[ΣCO])`，"推定值 = 名目 + 上乗せ" 的读法不变；σ 只影响幅度（P5/P20/P80/P95、超过概率）
- 乱数顺序：每次试行先按要因顺序各取 1 个均匀数（L0 也消费），σ > 0 时再取 1 个，经标准正规逆 CDF 得 `z`。打ち手比较（§2.5）因此用的是同一组随机数

### 2.4 模型构筑（α 推定）

输入：某 Group 内 `adopted=true` 的 Project，expertMode，runs，seed。

- 每条实绩的 ΣCO 由其 levels 用期望值算出，`α_j = effort_j / (sizeFP_j × (1 + ΣCO_j))`
- `α = mean(α_j)`；95% 区间用 bootstrap（runs 次重抽样）或 t 分布，二选一写清
- **1 件抜き交差検証（LOO）**：对每条 j，用其余数据算 α₋ⱼ，预测 `ê_j`，误差 `MRE_j = |e_j − ê_j| / e_j`
  - `MMRE = mean(MRE_j)`，`PRED(25) = count(MRE_j ≤ 0.25) / n`
  - 符号误差 `error_j = (ê_j − e_j) / e_j`（正 = 過大見積り）
  - **预测误差** `σ = sqrt(mean_j(ln(e_j / ê_j)²))`（LOO 残差的对数 RMS，不减均值），供 §2.3 的模型误差使用
- **95% CI**：bootstrap 百分位法——对 α_j 有放回重抽 n 个取平均，重复 `runs` 次（与构筑回数相同，用同一 `seed`），取 2.5 / 97.5 百分位
- **不整合检测**：`gap_j = α_j / α − 1`，`|gap_j| > 0.25` 标为不整合（UI 文案：ΣCO と生産性の不整合），列出并建议除外；不自动除外。不采用（除外中）的实绩也用同一 α 判定（`BuildOptions.excluded` → 结果带 `excluded: true`），用于提示「除外のまま — 不整合を確認」
- 构筑结果存为新 `ModelVersion`，旧版本保留，可切换 `active`
- 构筑过程分三段上报进度（α 推定 → モンテカルロ → 交差検証），前端显示步骤条，见 `Build.dc.html`

### 2.5 风险评估

- 超过概率曲线：`P(effort > x)` 由蒙特卡洛样本经验分布得到（也可用对数正态拟合平滑绘制，σ 由样本估计）
- 工数 → 概率、概率 → 工数双向查询
- 横轴切换：人月 / 中央値を 100% とした比率
- 寄与度：按 `contribution_i` 排序或按要因番号；% / 人月切换
- "効く打ち手"：对每个 L≥1 的直接要因，模拟把等级降 1 级后的 P50 差与给定预算下的新超过概率，取前 3

### 2.6 报告

A4 单页（可溢出到第 2 页），内容见 `Report.dc.html`：标题/元信息、推定値与 P80、P5〜P95 见込み幅条、三段公式卡、要因表（等级、判断根拠、CO 条、寄与）、直方图（P50/P80/予算线）、超过概率表、打ち手 3 条、模型信息与精度、前提注意、作成/確認/承認栏。PDF 由浏览器打印（`window.print()` →「PDF として保存」）生成；服务端 PDF 暂不做（见 §7）。**不含实绩数据明细。**

---

## 3. 数据交换格式

### 3.1 模型参数 JSON（替代旧 XML / Shift-JIS，EF001 / EF002）

```jsonc
{
  "format": "estima-model/1",
  "exportedAt": "2026-11-06T05:12:00Z",
  "exportedBy": "K. Cai",
  "model": { "name": "社内Web系開発 標準モデル", "version": 3, "alpha": 0.0210, "ci95": [0.0186, 0.0237] },
  "groups": [ { "id": "A", "name": "Web 系", "projects": 12 } ],          // 可选
  "excluded": [ { "projectId": "PJ-007", "reason": "ΣCO と生産性の不整合" } ], // 可选
  "factors": [                                                            // 标准要因 + 独自要因
    { "no": 1, "name": "要件の安定性", "category": "プロダクト", "kind": "direct", "origin": "standard|custom",
      "definition": "…", "levels": ["…","…","…","…"] },
    { "no": 2, "name": "顧客の関与度", "kind": "indirect", "targetNo": 1, "...": "…" }
  ],
  "triangles": [ { "factorNo": 1, "expert": "S.T.", "l3": [0.18, 0.26, 0.40] } ],
  "relations": [ { "indirectNo": 2, "directNo": 1, "k": 0.225 } ],
  "accuracy": { "mmre": 0.184, "pred25": 0.75, "loo": [ { "projectId": "PJ-001", "mre": -0.06 } ] },
  "projects": [ { "id": "PJ-001", "sizeFP": 860, "effortMM": 19.5, "levels": [2,1,1,2,1,2,1,0], "groupId": "A", "note": "" } ] // 仅当用户勾选"実績データを含める"
}
```

导入：旧 `.xml`（Shift-JIS，`<CoBRAModel>` 根）先转成上述 JSON 再走同一流程。导入前必须预览并处理**同名要因冲突**（既存を残す / 上書き / 別名で追加）。

### 3.2 CSV 实绩导入

首行表头；列对应由用户在界面确认（自动按表头猜测）。必填：プロジェクト名、規模、工数。每个要因一列等级 0–3。校验：空值、范围外、同名。可登录的行先登录（`adopted=true`，默认 Group A），有问题的行列出让用户去 ProjectEdit 改。

### 3.3 送付 → 上传审批（替代 J-MDL-007 的邮件）

导出时选"管理者へアップロード"：创建 `Submission { modelVersionId, payload, note, status: pending|approved|rejected }`，管理者在后台批准后合入"CoBRA 標準データ"。MVP 可只做提交 + 状态显示。

---

## 4. 设计系统（必须遵守）

- **暗色为主**。背景 `#0B0D12`，卡片 `#13161E`，边框 `#222734`（hover `#3A4257`），正文 `#F2F4F8`，次要 `#8B93A5`，弱 `#5E677A`
- 强调色 `accent` 默认 `#D4FF4F`（青柠），可换 `#5EEAD4 / #6E9BFF / #FFB020`；风险/L3/超预算用珊瑚 `#FF7A59`；成功 `#7EE2B8`；信息蓝 `#6E9BFF`；黄色提醒 `#FFB020`
- 字体：正文 Noto Sans JP；数字与标题 Space Grotesk（`.n` 类：700、`letter-spacing -0.03em`、`tabular-nums`）
- 布局：左侧 232px 导航（Estima 标志 → ダッシュボード → MODEL 组 → ESTIMATE 组 → 底部 CoBRA法の解説 + 用户），主区 12 列 bento 网格，间距 16，卡片圆角 18
- 动效：卡片入场 `rise`（0.7s，错开 60–90ms）；数字滚动（rAF，cubic ease）；条形/环形用 CSS transition；流程边线 `stroke-dasharray` 流动；全部尊重 `prefers-reduced-motion`
- 键盘可达：所有按钮/链接有 `:focus-visible` 描边；开关、分段按钮都是 `<button>`
- 报告页例外：白底、黑字、印刷安全，仅青柠作小面积标记

---

## 5. 画面一览与旧业务 ID 映射

路由建议写在括号里。每个画面的细节（布局、文案、状态、交互）看对应 `.dc.html`。

| # | 画面 | 文件 | 路由 | 旧 ID | 要点 |
|---|---|---|---|---|---|
| 1 | ダッシュボード | Main | `/` | — | 当前模型与最近见积概览：推定值滚动、P20–P95 带、直方图、预算环、α 推移、MMRE/PRED、寄与条、世代列表、PJ-007 警示、最近操作 |
| 2 | 変動要因 | Factors | `/model/factors` | J-MDL-003 ①–④ | 分类筛选、专家切换；右侧详情可编辑定义 / L0–L3 / 两位专家三角分布，改数字三角形即时变；间接→直接关系行；删除 |
| 3 | 要因を追加 | FactorNew | `/model/factors/new` | J-MDL-002, J-MDL-003 ① | **默认"一から定義する"**，可切到"標準要因から選ぶ"（14 个标准要因，筛选、预览、多选加入） |
| 4 | 要因関係図 | Relations | `/model/relations` | J-MDL-003 ⑤ (V-MDL04) | 只读。环形图，线粗 = L3 CO 或 G3 寄与，间接虚线"強める"，点选看详情，底部三条规则 |
| 5 | 実績データ | ProjectData | `/model/projects` | J-MDL-004 | 列表 + 搜索 + 组筛选；采用开关切换时名目线（α）重算；散点标除外点；规模分布 |
| 6 | 実績を追加・編集 | ProjectEdit | `/model/projects/new`, `/:id` | J-MDL-004 | 表单 + 单位换算；右侧实时散点定位、生产性 vs α×(1+ΣCO) 偏差条（±25% 判定）、保存前检查 |
| 7 | モデル構築 | Build | `/model/build` | J-MDL-005 | 构筑条件（组、专家、回数、乱数）、构筑前检查、三段进度、α 滚动 + 与上一版差分、LOO 散点带误差标签、版本列表（采用切换）、不整合卡 |
| 8 | 取り込み / 書き出し | Transfer | `/transfer` | J-MDL-001, 006, 007, EF001/002 | 三页签：JSON 导入（预览、分组勾选、同名冲突）、JSON 导出（8 项勾选、机密默认不含、下载 / 上传审批）、CSV 实绩（单位、列对应、预览校验） |
| 9 | 工数見積り | Estimate | `/estimate/:id` | J-EST-001, 002, 003 | 规模 + 8 要因等级输入即时重算；执行 10,000 次有进度；推定值与上一世代差分；P20–P95 带；直方图；名目 + 各要因堆叠；世代条（≤5，可选报告用世代） |
| 10 | リスク | Risk | `/estimate/:id/risk` | J-RSK-001–004 | 超过概率曲线（网格、推定线、予算内区域）、预算输入 + 快捷键、工数⇄概率、横轴切换、寄与度（排序/单位切换、累计%）、効く打ち手 Top3、概率速查表 |
| 11 | 見積りレポート | Report | `/estimate/:id/report` | J-REP-001 | A4 白底打印版，见 §2.6 |
| 12 | シミュレーション設定 | SimSettings | 弹层（Build / Estimate 内） | J-MDL-005 ※, J-EST-001 | 适用先、回数三档（耗时、P50 误差）、乱数固定/更新、种子输入与生成 |
| 13 | CoBRA法の解説 | Guide | `/guide#sec` | F-INF01 | 8 节；公式三滑杆、三角分布三滑杆可动；"使い方"6 步直达画面；用語集 |
| 14 | 業務フロー | Flow | `/guide/flow` | 2.1 / 3.3 | 六步流程可点可自动播放，边线流动，详情面板；数据出入与旧版置换对照。可作为帮助页保留 |

未实现（有意）：J-ENQ-001 利用者アンケート（旧版是 IPA 站点问卷，与产品无关）。

画面间链接（设计稿里已接好，实现时保持）：导航全站共通；Main 的「インポート / エクスポート」→ Transfer；Factors 的「+ 要因を追加 / 標準要因から選ぶ」→ FactorNew，「関係図」→ Relations；ProjectData 的「CSV から取り込む」→ Transfer，「+ プロジェクトを追加」→ ProjectEdit；Build / Estimate 的「設定」→ SimSettings；Estimate 的「リスクを見る」→ Risk，「レポート」→ Report。

---

## 6. 示例数据（用作 seed，与设计稿一致）

> ⚠️ **2026-11 校准**：本节的模型精度、G3 结果、LOO 误差已改为 `cobra-core` 实际算出的值（10,000 回，seed 20261106），由 `packages/cobra-core/test/core.test.ts` 以 ±1% 校验。设计稿原值与不能一致的原因见 §11「§6 数值的校准」。设计稿里与此不同的数字（42.3、49.1、18.4% 等）以本节为准。

**模型**：社内Web系開発 標準モデル v3，α = 0.0210 人月/FP（0.02098），95% CI 0.0194–0.0225，MMRE 12.8%，PRED(25) 82%（11 件中 9 件），预测误差 σ = 0.145，Group A 12 件采用 11 件（PJ-007 除外），专家 S.T. / Y.T.，构筑用"平均"。<sub>（原：CI 0.0186–0.0237，MMRE 18.4%，PRED 75%（8/11））</sub>

**要因（L3 的三角分布，S.T. / Y.T.）**

| No | 名称 | 类别 | 种类 | S.T. best/likely/worst | Y.T. |
|---|---|---|---|---|---|
| 01 | 要件の安定性 | プロダクト | 直接 | .18 / .26 / .40 | .15 / .25 / .36 |
| 02 | 顧客の関与度 | プロダクト | 間接 → 01 | .10 / .20 / .30 | .12 / .18 / .28 |
| 03 | 開発者のスキル・経験 | 人 | 直接 | .06 / .12 / .22 | .05 / .10 / .20 |
| 04 | チーム間のコミュニケーション | 人 | 直接 | .05 / .11 / .18 | .06 / .10 / .16 |
| 05 | 新規技術の割合 | プロダクト | 直接 | .08 / .15 / .25 | .07 / .14 / .22 |
| 06 | 外部システム連携数 | プロダクト | 直接 | .10 / .18 / .30 | .09 / .17 / .27 |
| 07 | 開発プロセスの成熟度 | プロセス | 直接 | .02 / .06 / .10 | .03 / .05 / .09 |
| 08 | 納期の厳しさ | プロセス | 直接 | .02 / .05 / .09 | .01 / .04 / .08 |

L0–L3 定义文见 `ProjectEdit.dc.html` 的 `fdefs`。

**示例见积 G3「顧客ポータル刷新 — 案B (外部連携あり)」**：規模 1,200 FP，等级 [3,2,1,2,2,3,1,1]，用 v3 的 α 与 σ：ΣCO = +74.3%，名目 25.2，上乗せ 18.7，推定 43.9 人月，P80 49.9，P5 34.3，P95 56.2；予算 45 → 超过概率 43%。寄与：01 7.7 / 06 4.7 / 05 2.5 / 04 1.9 / 03 1.0 / 07 0.5 / 08 0.4（02 含于 01）。効く打ち手：01 L3→L2（P50 −2.6）、06 L3→L2（−1.6）、05 L2→L1（−1.3）。<sub>（原：ΣCO +68%，上乗せ 17.1，推定 42.3，P80 49.1，P5 31.4，P95 56.9，34%；寄与 6.5 / 4.6 / 2.6 / 1.7 / 1.0 / 0.4 / 0.3）</sub>

**実績 12 件（Group A）**：sizeFP / effortMM = 420/8.2, 560/12.9, 680/13.1, 760/17.8, 900/21.5, 980/19.4, 1100/26.9(PJ-007, 除外), 1250/31.2, 1400/29.1, 1620/41.3, 1880/46.8, 2150/55.2。等级见 `packages/cobra-core/src/seed.ts`（校准后 ΣCO：PJ-010 +58%、PJ-003 +13%、其余 +2〜9%；PJ-007 +58%）。LOO 误差（%）：001 +10 / 002 −4 / 003 +25 / 004 −10 / 005 −7 / 006 +9 / 008 −9 / 009 +3 / 010 +33 / 011 −13 / 012 −17，**PJ-003 与 PJ-010 在 ±25% 带外**。PJ-007 的 gap = −26%（ΣCO が高いのに工数が少ない）→ 不整合。<sub>（原：`Build.dc.html` 的 `errs`，PJ-005 −41%、PJ-010 +34% 在带外；PJ-007 为"ΣCO が低いのに工数が多い"）</sub>

**历史版本**：v1 S.T./初回 α 0.0232 MMRE 24.1%（10/14, 9 件）；v2 Y.T. α 0.0198 MMRE 19.8%（10/28, 11 件）；v3 平均 α 0.0210 MMRE 18.4%（11/05, 11 件，採用中）。

---

## 7. 技术栈（已定：部署到 Cloudflare 免费版）

### 7.1 约束

部署目标是 **Cloudflare Workers 免费版**，决定架构的限制：

- Worker 每次请求 **10 ms CPU**（官方价格页），每天 10 万请求；静态资源请求不计入
- D1（SQLite）免费额度有每日读写上限与总存储上限，超出当天报错，内部工具用量远低于此
- Browser Rendering 免费版每天 10 分钟浏览器时长，不作为常规 PDF 手段

结论：**服务端只做轻量 JSON CRUD，所有计算在浏览器里跑；不做 SSR。** 本应用是登录后使用的内部工具，无 SEO 需求，SPA 足够。

### 7.2 选型

| 层 | 选择 | 理由 |
|---|---|---|
| 前端 | Vite + React 19 + TypeScript，TanStack Router（或 React Router library mode） | 纯 SPA，构建产物由 Workers Static Assets 托管；设计稿的 `class Component` 是 React 风格，移植直接 |
| 样式 | Tailwind v4，§4 的 token 写进 `@theme` | 颜色、字体、圆角统一管理；页面级动画沿用设计稿 CSS |
| 图表/动效 | 自绘 SVG 组件；CSS transition/keyframes，必要时 Motion | 设计稿全是 SVG/CSS，不引图表库，包更小、像素更贴合 |
| 计算 | `packages/cobra-core`（纯 TS，无 DOM 依赖）+ Vitest | CO 内插、三角抽样、蒙特卡洛、α/LOO/MMRE/PRED、超过概率、寄与、打ち手。浏览器 Web Worker 与 Worker 后端共用。PRNG 用 mulberry32（或 xoshiro128**），同种子同结果 |
| 执行方式 | 浏览器 Web Worker | 1 万次 < 1 s，10 万次与模型构筑也在浏览器内完成；三段进度用 `postMessage` 上报，**不需要 SSE / Durable Objects** |
| API | Hono，挂在同一个 Worker 的 `/api/*` | 轻量、Workers 原生；配 zod 校验请求体 |
| 数据库 | Cloudflare D1 + Drizzle ORM（drizzle-kit 迁移） | 免费、SQLite 语义足够；seed 用 SQL/TS 脚本写入 §6 数据 |
| 文件 | 不用 R2 | JSON/CSV 导入导出在浏览器内解析/生成后走 API；旧 XML（Shift-JIS）用 `TextDecoder('shift_jis')` 在浏览器转 JSON |
| 认证 | Cloudflare Access（Zero Trust）保护整个域名 | 不自建登录。Worker 校验 `Cf-Access-Jwt-Assertion` 并取邮箱，在 D1 `users` 表映射角色。免费人数上限请以 Access 价格页为准 |
| PDF | `/estimate/:id/report` 的 `@media print` 样式 + `window.print()` | 免费、与屏幕一致。服务端 PDF（Browser Rendering）留作以后 |
| 工程 | pnpm workspace monorepo；`wrangler dev`（本地 D1）/ `wrangler deploy` | 一个 Worker 同时出静态资源和 API |

实际目录（已搭好，用 `@cloudflare/vite-plugin` 把 SPA 和 Worker 放在同一个 Vite 工程）：

```
apps/web/src/          React SPA：pages/（每画面一个文件）、features/<area>/、ui/、data/api.ts、lib/cobra-client.ts（Web Worker）
apps/web/worker/       Hono：index.ts 入口、routes/<area>.ts、db/schema.ts、auth.ts
apps/web/shared/       前后端共用的 API 类型
apps/web/migrations/   D1 迁移（0001_seed.sql 由 scripts/seed-sql.ts 从 cobra-core/seed 生成）
apps/web/wrangler.jsonc  SPA 回退、/api/* 先走 Worker、D1 绑定、custom domain cobra.kejincai.dev
packages/cobra-core/   计算包（src/index.ts、types.ts、seed.ts）+ Vitest
```

部署地址 `https://cobra.kejincai.dev`，GitHub 公开仓库 `kekincai/cobra-estimator`，协作规则见 `CLAUDE.md`。

### 7.3 其他

- **角色**：モデル管理者（构筑、改要因、审批上传）、見積り担当（见积、风险、报告）、PMO（实绩、导入导出）。MVP 单租户 + 简单角色，API 层按角色拦截
- **审计日志**：导入 / 导出 / 构筑 / 采用版本切换写入 D1 `audit_log`
- **结果持久化**：浏览器算完后把 `Generation.results` / `ModelVersion` 结果 POST 给 API 存档，服务端不重算；需要防篡改时可在服务端用同 seed 对小样本抽查
- 日文 UI，文案直接取设计稿；预留 i18n key

---

## 8. 非功能要求（继承旧版 5.1 并更新）

- 构筑与见积执行：显示分段进度，1 万次目标 < 3 s；其他操作 < 1 s 响应
- 同一 seed、同一输入 → 完全相同的结果（可复现）
- 报告 A4 打印无裁切，浏览器「PDF として保存」与屏幕一致（Chrome / Edge / Safari 验证）
- 运行在 Cloudflare Workers 免费版内：任何 API 请求不得做蒙特卡洛等重计算（10 ms CPU 限制）
- 键盘可操作、`prefers-reduced-motion` 下无动画、对比度满足 WCAG AA（暗底上次要文字用 `#8B93A5` 及以上）
- 实绩数据属机密：导出默认不含，上传到标准数据侧永不包含；审计日志记录导入/导出/构筑/采用版本切换

---

## 9. 验收清单（按画面）

- [ ] 要因可一から定義 / 从标准选取；改三角分布数字图形即时变；间接要因只能指向一个直接要因，且一个直接要因最多一个间接
- [ ] 实绩可增删改、CSV 导入带列对应与校验；采用切换后 α 预览线移动
- [ ] 构筑产出 α、CI、MMRE、PRED、LOO 误差、不整合列表；版本保留与切换；三段进度可见
- [ ] 见积：等级变化即时重算；执行后生成世代（≤5）；可选报告用世代；与上一世代差分
- [ ] 风险：曲线、工数⇄概率、横轴切换、寄与度两种排序两种单位、打ち手 Top3
- [ ] 报告打印 A4，内容与 §2.6 一致，不含实绩明细
- [ ] JSON 导入预览 + 冲突处理；导出 8 项勾选 + 机密提示 + 下载/上传；旧 XML 可转入
- [ ] シミュレーション設定 对构筑与见积生效；固定种子可复现
- [ ] 解説页 8 节，公式与三角分布可交互；各画面「?」能跳到对应节
- [ ] 全站暗色设计 token、入场动效、reduced-motion、焦点样式

---

## 10. 实现顺序建议

1. `cobra-core` 计算包 + 单元测试（用 §6 示例数据核对 42.3 / 49.1 / 34% 等数字，允许 ±1% 抽样误差）
2. 数据模型与 seed；Factors / FactorNew / ProjectData / ProjectEdit
3. Build（含 SimSettings）→ Estimate → Risk → Report
4. Transfer（JSON 导入导出、CSV）→ Main 仪表盘 → Guide / Flow / Relations
5. 打印样式、Cloudflare Access + 角色、审计、上传审批；`wrangler deploy` 上线

---

## 11. 已知假设与待确认

- 间接要因倍率 `k = 0.225` 与 L1/L2 线性内插是本设计的选择，旧要件未规定数值；若组织有既定做法请替换
- **95% CI = bootstrap 百分位法**（§2.4）。n ≈ 10 时 α_j 分布偏斜，t 分布的对称区间不合适；bootstrap 与构筑用同一 runs/seed，可复现。Guide「モデル構築と精度」需写明
- **α 取均值**（mean(α_j)），不取中位数：§2.4 的定义，LOO 的 α₋ⱼ 有闭式解；n ≈ 10 时中位数的 bootstrap 区间呈阶梯状。异常值靠不整合检测（|gap| > 25%）提示人工除外，而不是靠稳健统计量自动吸收
- **推定值取 P50（中位数），不取平均**：工数分布右偏（ε 为对数正态），平均值会被右尾拉高；P50 即"超过概率 50%"，与风险页的读法一致。`SimulationResult.mean` 仍然输出供参考
- **模型误差 ε 的依据**（§2.3）：CoBRA 法把生产性写成"名目生产性 × CO 引起的增加"，名目生产性本身在实绩之间是有散布的（α_j 的散布正是它）。只抽样 CO 的三角分布，等于假设名目生产性完全已知、模型完全正确，P5–P95 只有 ±7% 左右，比 LOO 实测的预测误差（MMRE 12.8%）还窄，作为风险评估是过度自信的。考虑过的方案：
  - (a) 从 α 的估计误差（bootstrap）抽 α：只反映"平均值"的不确定性（约 ±7%），不含个别项目相对平均的偏离，仍然过窄 → 不采用
  - (b) 从 α_j 的经验分布重抽：n = 11 时分布呈阶梯，P5/P95 由个别点决定 → 不采用
  - (c) **采用**：对数正态模型误差，σ = LOO 残差的对数 RMS。LOO 残差是"新项目用这个模型预测时实际偏离多少"的直接测量，已经包含 α 的估计误差和名目生产性的散布；对数尺度对称、中位数为 1，所以不改变 P50
  - 已知的近似：α_j 用 ΣCO 期望值算出，LOO 残差里也含有实绩自身 CO 抽样的方差，与见积时的三角分布抽样有重复计入。seed 实绩的 ln(1+ΣCO) 方差平均只有 σ² 的约 1%，可忽略，因此不做扣除
- **§6 数值的校准（2026-11）**：§6 的规模/工数是固定的，等级只能改 ΣCO，而 α_j ≤ effort_j / size_j（ΣCO ≥ 0）。由此：
  - **α = 0.0210 与 MMRE 18.4% / PRED 75% 不能同时成立**。11 件的平均原始生产性只有 0.0228，α = 0.0210 意味着实绩的平均 ΣCO 只有约 +9%。要 3 件落到 ±25% 带外，只能靠高 ΣCO 让 α_j 变小（过大见积），这会把 α 拉到 0.0208 以下（在每件至少 1 个要因 ≥ L1 的前提下逐一搜索确认）。反过来固定 MMRE 18.4% / PRED 8/11，α 约为 0.0194。优先保留了全站显示的 α = 0.0210，结果 MMRE 12.8%、PRED 9/11——与设计稿 `errs` 本身隐含的 MMRE（13.6%）、带外 2 件（9/11）是一致的
  - **PJ-005 −41% 不可能**：负误差（过小见积）要求 α_j > α，但 PJ-005 即使 ΣCO = 0 也只有 α_j = 0.0239，LOO 误差下限约 −13%。所有项目的负误差下限都在 −20% 左右。因此第二个带外项目是 PJ-003（+25%，过大见积）
  - **PJ-007 只能以"ΣCO 高、工数少"的方向成为不整合**：其 effort/size = 0.0245，gap > +25% 需要 ΣCO < 0，不可能。改为 ΣCO +58%（gap −26%），note 同步修改。设计稿 Build 卡片的「要因レベルが低いのに工数が多い」文案应按 gap 的符号切换
  - **G3 的 ΣCO 是 0.743，不是 0.68**：按 §2.2 的规则（平均三角分布的期望值 × L/3，F01 × 1.15）逐项计算，F06 / F05 / F03 与设计稿一致，F01 是 7.7（设计稿 6.5，像是漏了间接倍率之外的某种折算）、F04 1.9（1.7）、F07 0.5（0.4）、F08 0.4（0.3）。没有为了凑 0.68 去改 k 或三角分布
  - G3 幅度：σ = 0.145 时 P5 34.3 / P95 56.2，与设计稿 31.4 / 56.9 同量级（设计稿的 P5–P95 隐含对数 σ ≈ 0.18）。只有 CO 时为 41.1 / 46.9
- 规模单位换算系数（KLOC→FP、画面→FP）需按组织实际调整
- 报告页的作成/確認/承認栏目前只是版式，是否接入审批流待定
