# Repo Gap 文档索引

> 最后审计：2026-08-18
>
> Target：[PQL Testing 简化时序图](../design-proposals/diagrams/pql-testing-simple-flow.mmd) 与 [Talos Testing Tool 最小 MVP 设计](../design-proposals/talos-testing-tool-mvp-design.zh-CN.md)
>
> 实施路线：[PQL Testing 跨仓实施 Roadmap](../ROADMAP.zh-CN.md)

## 1. 文档用途

本目录按 owning repo 记录最新 Testing 目标架构与当前实现之间的缺口。

`pql-testing-simple-flow` 是 **Target overview**，用于说明模块关系和主消息流，不表示 `PQL -> NyxID -> Talos -> Local QA Runtime` 已经形成生产闭环。审计结论统一区分：

| 证据层 | 含义 |
| --- | --- |
| `Baseline` | 固定 commit 中能够由源码、测试或发布文档证明的能力 |
| `Candidate` | 已有候选实现，但未合入目标分支、未联合验证或仍在迁移的能力 |
| `Target` | 最新设计要求，不能描述成已交付 |

能力状态统一使用：`已实现`、`部分实现`、`缺失`、`外部依赖`、`未验证`。

优先级统一使用：

- `P0`：主链路或正确性阻断。
- `P1`：生产可靠性和可运维性。
- `P2`：首个垂直链路完成后的增强。

## 2. 固定审计基线

| 模块 | Branch / Commit | 审计边界 | 总体状态 |
| --- | --- | --- | --- |
| `ChronoAIProject/fkst-packages-testing` | [`dev@ac953ff0`](https://github.com/ChronoAIProject/fkst-packages-testing/commit/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1) | Testing Packages 默认开发分支 | 语义和参考生命周期较完整，生产 runner packaging 与 Runtime/Talos 接线缺失 |
| `YueZh127/product-quality-loop` | [`main@5096cde5`](https://github.com/YueZh127/product-quality-loop/commit/5096cde5349c66fa9725b39e4008951887b17cd0) | PQL 默认分支 | 产品测试闭环已存在，生产 Testing Tool client 与运行投影缺失 |
| `ChronoAIProject/talos` | [`main@a32e537f`](https://github.com/ChronoAIProject/talos/commit/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb) | Talos 默认分支 | 通用任务、机器调度和 Browser 基础已存在，Testing Tool/QARun ABI 缺失 |
| `ChronoAIProject/fkst-hosted` | [`feat/local-qa-runtime@4b173897`](https://github.com/ChronoAIProject/fkst-hosted/commit/4b17389711fc420bfef56765d7d6af34e1702eb0) | 只审计 `apps/local-qa-runtime` 与相关 contracts | 组件 walking skeleton 已存在，真实执行主链未闭合 |

`feat/local-qa-runtime` 在审计时相对 `develop` 为 `ahead 130 / behind 220`。本文档中的 Runtime 结论不得外推为 `develop` 或主线已交付能力。

## 3. 活动 Gap 文档

| 模块 | 文档 | 当前第一阻断点 |
| --- | --- | --- |
| Testing Packages | [fkst-packages-testing 详细缺口](fkst-packages-testing-gap-analysis.zh-CN.md) | 缺少可发布 runner manifest/invocation 和跨 route conformance |
| Product Quality Loop | [product-quality-loop 详细缺口](product-quality-loop-gap-analysis.zh-CN.md) | 缺少生产 `TestingToolClient`、NyxID transport 和 `TestingRunRecord` reconcile |
| Talos | [talos 详细缺口](talos-gap-analysis.zh-CN.md) | 缺少 `kind=testing`、QARun Tool API 和 attempt/generation/fence 语义 |
| Local QA Runtime | [local-qa-runtime 详细缺口](local-qa-runtime-gap-analysis.zh-CN.md) | production 仍使用 `PassingExecutor`，且 Journal schema v4 无法正常 reopen |

补充领域分析：[fkst-hosted 云端详细缺口](fkst-hosted-gap-analysis.zh-CN.md)。该文档保留 Artifact、Final Quality、Report、Publication 和 Settlement 分析，但其旧版 Hosted-owned scheduler/QARun 边界已被最新 Talos Target 取代。

## 4. 权威对象与职责

| 对象 / 事实 | 权威模块 | 说明 |
| --- | --- | --- |
| `ProjectPackSnapshot`、`TestSelection`、产品侧 `TestingRunRecord` | PQL | 决定为什么测、测什么并保存用户侧运行关联 |
| `StructuredPlan`、typed action、`AssertionResult`、`CaseResultSet`、`EvidenceManifest` | Testing Packages | 定义测试语义；是库/runner，不是机器调度服务 |
| `QARun` snapshot/events/cancel | Talos Testing Tool | 对外 operational run authority |
| `TestingTask`、`TestingAttempt`、placement、lease、generation、fence | Talos Scheduler / worker | 决定在哪里、何时执行 |
| workspace、process、port、Chromium、local Evidence、Cleanup | Local QA Runtime Journal | 本机 effect 和资源 ownership 权威 |
| Artifact ingestion、Final Quality、Report、Publication、Settlement | Hosted 后续领域 | 不属于首个 Talos Testing MVP 的运行控制面 |

运行结果必须正交保存：

```text
control_status
execution_outcome
evidence_outcome
upload_outcome
cleanup_outcome
```

Talos task `completed` 只表示 attempt 已闭合，不表示 Case passed、Evidence 已摄取、Cleanup 完成或 Final Quality passed。

## 5. 时序图 19 步覆盖

| # | Target 交互 | Target owner | Baseline 状态 | Gap 文档 |
| ---: | --- | --- | --- | --- |
| 1 | 用户/Agent 提出测试需求 | PQL | 已实现多种 CLI/PR/nightly/heartbeat 入口 | [PQL](product-quality-loop-gap-analysis.zh-CN.md) |
| 2 | PQL 请求编译测试计划 | PQL + Testing Packages | 两边各有计划模型；生产跨 repo 调用未闭合 | [PQL](product-quality-loop-gap-analysis.zh-CN.md)、[Testing](fkst-packages-testing-gap-analysis.zh-CN.md) |
| 3 | 返回 `StructuredPlan` | Testing Packages | 已有 digest-bound `testing-structured-plan.v2`；PQL 联合消费未验证 | [Testing](fkst-packages-testing-gap-analysis.zh-CN.md) |
| 4 | PQL 经 NyxID 提交 Tool 请求 | PQL | 缺失生产 client/transport | [PQL](product-quality-loop-gap-analysis.zh-CN.md) |
| 5 | NyxID 验证并转发 | NyxID + Talos | Talos 已有 NyxID JWT 基础；Testing Tool route 缺失 | [Talos](talos-gap-analysis.zh-CN.md) |
| 6 | 创建/幂等重放 `QARun` | Talos Testing Tool | 通用 Task 可复用；无 testing QARun contract | [Talos](talos-gap-analysis.zh-CN.md) |
| 7 | 分配 `TestingTask` 和机器 | Talos Scheduler | 通用 capability/pool scheduler 已实现；testing attempt/fence 缺失 | [Talos](talos-gap-analysis.zh-CN.md) |
| 8 | worker 调用 Runtime 准备环境和 Chromium | worker + Runtime | 两边各有底层组件；没有 `LocalQARuntimeAdapter` 产品接线 | [Talos](talos-gap-analysis.zh-CN.md)、[Runtime](local-qa-runtime-gap-analysis.zh-CN.md) |
| 9 | Runtime 读取下一条 typed action | Runtime + Testing Packages | Testing runner 有 agentic loop；Runtime 当前固定 smoke 未接入 | [Testing](fkst-packages-testing-gap-analysis.zh-CN.md)、[Runtime](local-qa-runtime-gap-analysis.zh-CN.md) |
| 10 | 返回 `BrowserAction` / `AssertionSpec` | Testing Packages | typed Browser action 已有；可发布 invocation ABI 缺失 | [Testing](fkst-packages-testing-gap-analysis.zh-CN.md) |
| 11 | 执行 Browser action | Runtime Browser Executor | Talos 和 Runtime 都有 Browser 基础；Runtime production Host 未调用 | [Runtime](local-qa-runtime-gap-analysis.zh-CN.md) |
| 12 | 返回 Observation / screenshot | Browser Executor | 组件级已实现；产品 result/evidence 绑定未闭合 | [Runtime](local-qa-runtime-gap-analysis.zh-CN.md) |
| 13 | 根据 Observation 计算断言 | Testing Packages | runner 中已有判定能力；Runtime fixed worker 仍重复硬编码判定 | [Testing](fkst-packages-testing-gap-analysis.zh-CN.md)、[Runtime](local-qa-runtime-gap-analysis.zh-CN.md) |
| 14 | 返回 `AssertionResult` / `CaseResult` | Testing Packages | Browser candidate 已有；跨 CLI/HTTP/Browser 等价与 production consumer 未验证 | [Testing](fkst-packages-testing-gap-analysis.zh-CN.md) |
| 15 | 返回结果、Evidence 引用和 Cleanup | Runtime | 三类组件分别存在但未集成；Evidence 仍 local-only | [Runtime](local-qa-runtime-gap-analysis.zh-CN.md) |
| 16 | worker 回传 bounded terminal result | talos-worker | 通用 worker result API 已有；testing ABI 缺失 | [Talos](talos-gap-analysis.zh-CN.md) |
| 17 | 更新 `QARun` snapshot/events | Talos Testing Tool | 只有通用 Task 状态；无 testing event cursor/orthogonal outcomes | [Talos](talos-gap-analysis.zh-CN.md) |
| 18 | PQL `get/events` 轮询 | PQL + Talos | 两端均缺生产 Testing Tool 对接 | [PQL](product-quality-loop-gap-analysis.zh-CN.md)、[Talos](talos-gap-analysis.zh-CN.md) |
| 19 | PQL 展示测试结果 | PQL | 本地报告能力已存在；Talos terminal projection consumer 缺失 | [PQL](product-quality-loop-gap-analysis.zh-CN.md) |

## 6. 跨 Repo 关键阻塞关系

```text
PQL revision / approved input lineage
  -> Testing Packages package manifest + runner invocation
  -> Talos Testing Tool request/task/result ABI
  -> attempt_id + generation + fence_token
  -> Local Runtime admission + real execution spine
  -> CaseResultSet + EvidenceManifest + CleanupReceipt
  -> Talos bounded snapshot/events
  -> PQL TestingRunRecord
```

首个 Browser-only 垂直链路完成前，至少需要共同冻结：

- `pql.testing-design-input-set.v1`。
- `testing-package-manifest.v1`。
- `testing-runner-invocation.v1`。
- `talos.testing-tool-request/v1`、`talos.testing-task/v1` 和版本化 result projection。
- `qa.local-run-admission/v2`。
- `attempt_id`、`generation`、`fence_token`。
- `CaseResultSet`、`EvidenceManifest`、`CleanupReceipt` 的 ref/digest 绑定。

## 7. 刷新规则

1. 每次审计必须记录日期、branch 和完整 commit SHA。
2. “已实现”结论必须引用固定 commit permalink；branch HEAD 和本地 checkout 只能作为辅助上下文。
3. Candidate 不得写成 Baseline；Target 不得写成已交付。
4. 同一事实只能有一个 authority，不能同时由 Hosted、Talos、Runtime 或 Testing Packages 重复拥有。
5. delivery repair、Artifact repair 和 report repair 不得触发已经产生副作用的 Case 自动重跑。
6. `CancelAck` 只表示取消意图已接受，不表示执行已停止或 Cleanup 已完成。
