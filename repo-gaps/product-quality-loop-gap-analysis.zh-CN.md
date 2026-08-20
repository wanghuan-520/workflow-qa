# product-quality-loop 详细缺口清单

> Repo：[YueZh127/product-quality-loop](https://github.com/YueZh127/product-quality-loop)
>
> 审计日期：2026-08-20
>
> Baseline：[`main@5096cde5349c66fa9725b39e4008951887b17cd0`](https://github.com/YueZh127/product-quality-loop/commit/5096cde5349c66fa9725b39e4008951887b17cd0)
>
> Target：[PQL Testing 简化时序图](../design-proposals/diagrams/pql-testing-simple-flow.mmd) 与 [Talos Testing Tool 最小 MVP 设计](../design-proposals/talos-testing-tool-mvp-design.zh-CN.md)

## 0. 2026-08-20 Talos Tool 方向增量审计

### 0.1 结论

PQL 应作为 Testing 的产品语义和质量决策层，通过 NyxID 调用 Talos 的 bounded Testing Tool；PQL 不应变成 Talos 服务，也不应拥有 worker、browser、Sandbox、lease 或本机执行状态。

```text
需求/变更
  -> ProjectPack / TestSelection / approved asset
  -> Testing Packages StructuredPlan
  -> PQL TestingToolClient
  -> NyxID talos service
  -> Talos QARun
  -> terminal CaseResult/Evidence/Cleanup refs
  -> PQL TestingRunRecord / quality projection
```

### 0.2 当前事实与校正

- 当前 Baseline 仍为 `main@5096cde5349c66fa9725b39e4008951887b17cd0`；没有 Talos 引用、Talos task schema、TestingToolClient 或 worker/browser dispatch contract。
- 最近合入的 Project Pack update 能力是真实的审批绑定、digest/ref lineage 和 no-clobber candidate staging；应视为已实现的资产治理能力，不再标为旧 issue 的“缺失”。但它不是 Case 激活、生产执行或 Talos orchestration。
- `pql_heartbeat.py` 是单轮 heartbeat，PQL 不是 daemon；长期 loop、QA Run lifecycle、Sandbox、Secret Broker、Cleanup 和 publication 仍应由外部 Host/Talos/Hosted owning modules 持有。
- 当前 `fkst.lock` 仍 pin `fkst-packages-testing@58783c61...`，早于 Testing Packages `dev@ac953ff0...`；在升级并通过联合 conformance 前，不能声称 PQL 与当前 Testing Packages 已兼容。
- 当前 CI workflow 只监听 `dev`，默认分支是 `main`；这属于发布治理 P0，而不是 Talos Tool 实现。Issue 状态也不能代替代码事实。

### 0.3 PQL 为 Talos Tool 还需要什么

**P0：** `pql.testing-design-input-set.v1`、approved Snapshot/Selection/Asset ref+digest 闭合、provider-neutral `TestingToolClient`（`get_capabilities/submit/get/events/cancel`）、`TestingRunRecord` 和 lost-ack/idempotency/error fixtures。

**P1：** Talos terminal snapshot/event reconcile、opaque cursor resync、execution/evidence/upload/cleanup 正交展示、Hosted feedback ingestion/checkpoint，以及禁止 Tool 不可用时 silent fallback 到 direct executor。

**不应做：** PQL 不选择 pool/machine，不读取或转发 NyxID bearer，不直连 Local Runtime，不解释 lease/fence，不把 Talos `completed` 转成 Case passed 或 Final Quality passed。

## 1. 执行摘要

PQL 当前已经具备完整的产品测试入口、测试计划/用例、Project Pack 选择、直接执行、质量评估、发布门禁和反馈闭环。仓库也已有 `pql-qa-run-intent`、reference QA Host、FKST adapter 和相关 schema。

但是 Target 所需的生产路径尚未形成：

```text
ProjectPackSnapshot / TestSelection
-> Testing Packages StructuredPlan
-> NyxID
-> Talos Testing Tool submit/get/events/cancel
-> TestingRunRecord
-> 用户结果展示
```

当前仍是 direct execution、heartbeat、reference Host 和目标 Host 架构并存的迁移期。reference slice 能验证 contract shape，不能当作生产 intake、durable QARun authority 或 Talos 集成已经交付。

## 2. Target 职责与非职责

PQL 应负责：

- 接收产品级测试目标。
- 冻结 exact source revision、`ProjectPackSnapshot`、approved `TestCaseAsset` 和 `TestSelection`。
- 生成 pointer-only、digest-bound 的 Testing Packages 输入。
- 调用 Testing Packages 编译 `StructuredPlan`。
- 通过 provider-neutral `TestingToolClient` 经 NyxID 调用 Talos。
- 保存产品侧 `TestingRunRecord`，关联 input provenance、Talos run ID、terminal snapshot 和结果引用。
- 向用户展示执行结果，并在后续 Hosted 领域存在时消费 Final Quality/Report。

PQL 不应负责：

- 选择 pool 或 machine。
- 管理 task、attempt、lease、generation 或 fence。
- 直连 Local QA Runtime loopback API。
- 执行 Browser action 或拥有本机资源。
- 计算 `AssertionResult`、`CaseResult` 或根据 Talos task 状态推断 Case Pass/Fail。
- 在 Testing MVP 中自行推断 Final Quality。

## 3. Baseline 已实现能力

### 3.1 产品测试入口和运行模式

已实现 `baseline`、`pr`、`post-merge`、`nightly`、`heartbeat`、`watch-merged`、`selftest` 和 bootstrap/onboarding 等入口。

证据：

- [`pql.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/pql.py)
- [`run_pql_skill.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/run_pql_skill.py)
- [`pql_heartbeat.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/pql_heartbeat.py)
- [`pql_pr_watcher.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/pql_pr_watcher.py)

### 3.2 计划、用例和直接执行

Baseline 已有：

- 测试计划与用例生成、编译。
- deterministic command、HTTP、pytest 等执行路径。
- `shell=False` 的受控 argv Process Case。
- Playwright、API、workflow 和 regression 测试资产。
- 超时进程组终止和失败重试基础。

证据：

- [`test_planner.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/test_planner.py)
- [`test_case_generator.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/test_case_generator.py)
- [`case_compiler.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/case_compiler.py)
- [`test_executor.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/test_executor.py)
- [`process_case.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/process_case.py)
- [`real_case.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/real_case.py)

### 3.3 产品质量闭环

已实现：

- 变更分类和 deterministic Project Pack selection。
- coverage review、test expansion 和资产提案。
- product quality assessment、release gate 和 product gate。
- feedback、asset proposal、project pack update。
- JSON/Markdown 报告与 FKST handoff。
- planned/all-skipped/missing evidence 不误报为 passed。

主要证据：

- [`project_pack_selection.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/project_pack_selection.py)
- [`product_quality_assessment.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/product_quality_assessment.py)
- [`release_gate.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/release_gate.py)
- [`feedback_builder.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/feedback_builder.py)
- [`report_writer.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/report_writer.py)

### 3.4 Reference QA Host 集成基础

已有：

- `pql-qa-run-intent.v1` 与 Host intake/binding schemas。
- pointer-only intent 编译，不把 URL、argv、grant、profile 等执行字段交给 PQL。
- reference-only Host intake、terminal/aggregate 消费和 product assessment。
- FKST `workflow_qa_host_adapter` wrapper。
- `host-flow.v1.json` 责任边界描述。

证据：

- [`generic_host_intent.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/generic_host_intent.py)
- [`reference_qa_host.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/reference_qa_host.py)
- [`generic_host_reference.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/generic_host_reference.py)
- [`pql_workflow_qa_host_adapter.lua`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/fkst/testing-host/pql_workflow_qa_host_adapter.lua)
- [`host-flow.v1.json`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/fkst/testing-host/host-flow.v1.json)

这些能力是可复用的 Baseline，但其实现明确是 reference slice，不证明生产 Host、NyxID、Talos 或 durable external authority 已接通。

## 4. 当前状态矩阵

| Target 能力 | 状态 | 当前事实 | 主要缺口 |
| --- | --- | --- | --- |
| 冻结 Project Pack / TestSelection | 部分实现 | selection、schema 和大量测试资产已存在 | 需要形成 Target 版本的 immutable snapshot/selection/input-set provenance |
| 调用 Testing Packages 编译计划 | 部分实现 | PQL 有自己的计划；FKST reference adapter 存在 | 生产 package manifest、runner invocation 和联合版本协商缺失 |
| `TestingToolClient` | 缺失 | 未发现 Talos Testing Tool client | 五个 operation、NyxID transport、bounded errors |
| `TestingRunRecord` | 部分实现 | 当前有 heartbeat/nightly/Host reference 状态 | 缺少 Talos run/cursor/snapshot/result refs 的单一产品投影 |
| `get/events` reconcile | 缺失 | 当前使用 queue、terminal artifact、heartbeat 文件 | cursor、dedupe、snapshot resync、terminal closure |
| cancel | 部分实现 | 本地 executor/heartbeat 有超时和终止 | 不等于跨系统 QARun cancel/cleanup 语义 |
| 结果展示 | 部分实现 | JSON/Markdown 和 case table 已有 | 缺真实 Talos terminal consumer 和 opaque refs 展示 |
| Final Quality | 已实现于 legacy/direct 路径 | 已有 product assessment/gate | Testing MVP 不得从 task status 或不完整 result 自行推断 |

## 5. P0：生产 Testing Tool 接入

### 5.1 缺少 provider-neutral `TestingToolClient`

PQL 需要固定接口：

```text
get_capabilities()
submit(run_id, request, idempotency_key)
get(run_id)
events(run_id, cursor, limit)
cancel(run_id, reason, idempotency_key)
```

要求：

- Tool path 和 NyxID transport 细节封装在 adapter 中。
- 请求只包含 immutable refs、digests、policy 和 execution requirements。
- 不接受 pool、machine、lease、fence、host path、argv、env、CDP endpoint 或 credentials。
- `accepted=true` 只表示 Talos 接受 QARun。
- transport error、Tool rejection、run conflict 和 terminal failure 必须使用不同错误类型。

### 5.2 缺少 NyxID transport integration

Target 中 NyxID 负责 caller identity、org scope、approval、服务路由和 transport audit。PQL 需要：

- 明确 service/operation audience。
- 传递 caller identity 和 trace correlation。
- bounded timeout/retry。
- 对未知 acceptance 使用同一 `run_id` 查询或幂等重放，不能创建第二次运行。
- 不通过 NyxID response 搬运 Artifact bytes。

NyxID 不拥有 QARun 状态、机器选择、CaseResult 或 Final Quality。

### 5.3 缺少 Target 运行请求编译

应从以下冻结输入编译 `talos.testing-tool-request/v1`：

```text
ProjectPackSnapshot ref/digest
TestSelection ref/digest
pql.testing-design-input-set.v1 ref/digest
exact Source ref/digest
StructuredPlan ref/digest
Environment Profile ref/digest
Testing Package identity/version/digest
policy/budgets
```

PQL 应验证 lineage 完整，但不解析或执行 StructuredPlan。

## 6. P0：`TestingRunRecord` 和状态收敛

建议产品侧记录至少包含：

```text
record_id
project/repository/exact revision
snapshot/selection/input-set refs + digests
structured-plan ref + digest
talos run_id
request digest
last snapshot version/ref/digest
resume cursor
control_status
execution/evidence/upload/cleanup outcomes
result/evidence/cleanup refs + digests
created/updated/terminal timestamps
bounded display summary
```

规则：

- 同一 PQL request identity 只能关联一个稳定 Talos `run_id`。
- event ingestion 至少一次，按 sequence/digest 去重。
- 同 sequence 不同 digest 必须作为完整性错误处理。
- cursor expiry 后通过 bounded Snapshot 恢复，再从 `resume_cursor` 继续。
- cancel acknowledgement、execution terminal、cleanup terminal 分开表示。
- `task completed` 不得被转换成 `Case passed` 或 `Final Quality passed`。

## 7. P0：Testing Packages 版本漂移

PQL Baseline 仍在以下位置固定 Testing Packages revision：

```text
58783c61ff628f11cc802a3137e20dcb0f4ef28a
```

证据：

- [`fkst.workspace.toml`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/fkst.workspace.toml)
- [`fkst.lock`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/fkst.lock)
- [`generic_host_intent.py`](https://github.com/YueZh127/product-quality-loop/blob/5096cde5349c66fa9725b39e4008951887b17cd0/skills/product-quality-loop/scripts/generic_host_intent.py)

该 revision 早于本轮 Testing Packages Baseline `ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1`。因此：

- 不能声称两个默认分支已经联合验证。
- 不能只更新 lock；需要同时验证 input schema、Host adapter、terminal projection 和 reference tests。
- Talos MVP 应通过显式 package manifest/version/digest 消除隐式仓库状态依赖。

退出标准：PQL 在固定新 revision 上通过 contract/reference tests，并输出包含 package identity/version/digest 的运行请求 fixture。

## 8. P1：结果消费和用户展示

需要补齐：

- terminal Snapshot 与 `CaseResultSet`、`EvidenceManifest`、`CleanupReceipt` refs 的消费。
- bounded event timeline 和 terminal summary。
- Evidence unavailable、upload expired、cleanup residual 等非测试失败状态的独立展示。
- result/evidence delivery repair，不触发测试重跑。
- 用户取消后的“已接受”“正在停止”“Cleanup 完成”分阶段状态。
- Hosted Final Quality/Report 接入前，对“执行事实”和“最终质量”使用不同 UI/输出字段。

## 9. P1：旧执行路径迁移

当前 direct executor、real-case、heartbeat state 和 reference Host 仍有使用价值，不应在生产 Tool 链路未闭合时删除。

迁移顺序：

1. 冻结 PQL input/output contracts。
2. 加入 Testing Tool client test double 和 conformance fixture。
3. 接入 NyxID/Talos canary。
4. 让一种 Browser-only profile 使用 Talos 路径。
5. 对比 direct 与 Talos 路径的 selection、case identity 和 terminal projection。
6. 生产链路稳定后，再决定哪些 legacy execution/recovery owner 可以冻结或退役。

## 10. 跨 Repo 验收

必须证明：

```text
fixed ProjectPackSnapshot + TestSelection
-> pql.testing-design-input-set.v1
-> Testing Packages StructuredPlan
-> Talos idempotent acceptance
-> bounded Snapshot/events
-> CaseResultSet/EvidenceManifest/CleanupReceipt refs
-> PQL TestingRunRecord terminal projection
```

必测场景：

- same run ID/same digest replay。
- same run ID/different digest conflict。
- NyxID response lost 后查询同一 run。
- event duplicate 和同 sequence/different digest。
- cursor expiry + Snapshot resync。
- cancel before placement、during execution 和 after execution terminal。
- task completed 但 Case failed。
- execution terminal 但 Evidence unavailable。
- cleanup residual blocking。
- Talos/Hosted 暂时不可用时不丢失 PQL input provenance。

## 11. 完成标准

PQL 的 Talos Testing MVP 集成完成时应满足：

- Snapshot、Selection、InputSet、StructuredPlan 和 package identity 全部以 immutable ref/digest 闭合。
- PQL 只通过 NyxID 调用稳定的 Testing Tool operations，不选择机器或直连 Runtime。
- 每次 request 形成稳定 `run_id` 和产品侧 `TestingRunRecord`。
- duplicate、lost acknowledgement、cursor expiry 和 cancel 都能收敛。
- terminal 展示区分 execution、evidence、upload 和 cleanup outcomes。
- PQL 不根据 task status 猜测 CaseResult 或 Final Quality。
- PQL 与 Testing Packages 固定 revision 通过联合 conformance tests。
