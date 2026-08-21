# Repo Gap 文档索引

> 最后审计：2026-08-20
>
> Target：[PQL Testing 简化时序图](../design-proposals/diagrams/pql-testing-simple-flow.mmd) 与 [Talos Testing Tool 最小 MVP 设计](../design-proposals/talos-testing-tool-mvp-design.zh-CN.md)
>
> 实施路线：[PQL Testing 跨仓实施 Roadmap](../ROADMAP.zh-CN.md)
>
> 架构决策状态：Hosted Authorization Authority 和最小 ArtifactStore 的 owner/MVP 必需性为 **Proposed / Decision pending**，详见 [边界决策提案](../design-proposals/hosted-authorization-artifact-boundary-decision.zh-CN.md)。Roadmap 已将该候选依赖拆为 `MVP-H` workstream，并把 Post-MVP Quality/Report 保留在 R6；在提案被 maintainer 接受前，本文不得把 `fkst-hosted` 描述为已冻结 owner。

## 0. 本轮结论：Testing 可以成为 Talos Tool

结论是 **可以**，但准确形态是 Talos 服务的一组第一方有界 Testing operations，而不是把现有 `browse` task、interactive Session 或自由文本 `goal` 直接包装成测试。

```text
PQL / Agent
  -> NyxID talos service
  -> Talos Testing Tool / QARun
  -> TestingTask / TestingAttempt
  -> talos-worker TestingExecutor
  -> LocalQARuntimeAdapter
  -> Local QA Runtime
  -> Testing Packages + isolated system Chrome
  -> CaseResultSet + EvidenceManifest + CleanupReceipt
```

推荐公开 Tool family：

```text
talos.testing.get_capabilities
talos.testing.submit
talos.testing.get
talos.testing.events
talos.testing.cancel
```

本轮补充实证：

- `talos-worker-setup` 说明的 pool、machine、worker token、capability tags、outbound claim、NyxID public rendezvous 和 org sharing 可直接作为部署与调度基础。
- Ornn 公共页面 `https://ornn.chrono-ai.fun/skills/talos-worker-setup` 在 2026-08-20 实际返回 `Skill Not Found`；因此它不是当前可依赖的公开合同。可验证依据是本机安装的 skill 快照、Talos owning repo 和 NyxID catalog/OpenAPI。
- Talos 线上 `/openapi.json` 与 `main@a32e537f` 的 `specs/talos-openapi.yaml` 规范化 SHA-256 一致：`1b9b101e677ccb3140bdc0a70fb3f9b475f54ef06163eb1d40468a1447fc9920`。
- 当前线上合同仍只有 `browse | computer_use`，没有 `testing`、`QARun`、attempt generation/fence、Testing events 或 canonical result/evidence/cleanup projection。
- NyxID 负责 caller identity、route、approval 和 transport audit；Talos 负责 QARun/placement/lease/fence；Runtime 负责本机 effect/cleanup；Testing Packages 负责 Assertion/CaseResult。四者不能互相替代。

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
| `ChronoAIProject/fkst-hosted` | [`feat/local-qa-runtime@c79d11d`](https://github.com/ChronoAIProject/fkst-hosted/commit/c79d11d99ba854d14ce41b2849ba0bbf5c50e522) | 审计 `apps/local-qa-runtime`、相关 contracts，以及 proposed Hosted Authorization/Artifact 边界 | Runtime 组件 walking skeleton 已存在；真实执行主链未闭合，Hosted owner 决策和候选能力也未完成 |

`feat/local-qa-runtime` 已从初始审计的 `4b173897` 推进到 `c79d11d`，但仍是相对 `develop` 明显分叉的 Candidate。复核确认 `PassingExecutor`、inert admission、Journal v4 reopen 和 local-only Evidence 等关键阻断仍存在；本文档中的 Runtime 结论不得外推为 `develop` 或主线已交付能力。

## 3. 活动 Gap 文档

| 模块 | 文档 | 当前第一阻断点 |
| --- | --- | --- |
| Testing Packages | [fkst-packages-testing 详细缺口](fkst-packages-testing-gap-analysis.zh-CN.md) | 缺少可发布 runner manifest/invocation 和跨 route conformance |
| Product Quality Loop | [product-quality-loop 详细缺口](product-quality-loop-gap-analysis.zh-CN.md) | 缺少生产 `TestingToolClient`、NyxID transport 和 `TestingRunRecord` reconcile |
| Talos | [talos 详细缺口](talos-gap-analysis.zh-CN.md) | 缺少 `kind=testing`、QARun Tool API 和 attempt/generation/fence 语义 |
| Local QA Runtime | [local-qa-runtime 详细缺口](local-qa-runtime-gap-analysis.zh-CN.md) | production 仍使用 `PassingExecutor`，且 Journal schema v4 无法正常 reopen |
| Hosted MVP 候选依赖（Decision pending） | [fkst-hosted 详细缺口](fkst-hosted-gap-analysis.zh-CN.md) | 先接受 owner/认证/storage 决策，再实现 operation-specific authorization 与 Artifact `prepare/commit/lookup`、receipt 和 lost-ack reconcile |

`fkst-hosted` 文档同时包含三类内容：Authorization 和最小 ArtifactStore 是 Browser MVP 的 **候选依赖**，owner/认证/storage 边界等待架构决策；Final Quality、Report、Publication、Settlement 和 HostedQualityFeedback 是 Post-MVP；旧版 Hosted-owned scheduler/QARun 内容只保留为历史迁移对照，禁止拆成当前实现任务。

## 4. 权威对象与职责

| 对象 / 事实 | 权威模块 | 说明 |
| --- | --- | --- |
| `ProjectPackSnapshot`、`TestSelection`、产品侧 `TestingRunRecord` | PQL | 决定为什么测、测什么并保存用户侧运行关联 |
| `StructuredPlan`、typed action、`AssertionResult`、`CaseResultSet`、`EvidenceManifest` | Testing Packages | 定义测试语义；是库/runner，不是机器调度服务 |
| `QARun` snapshot/events/cancel | Talos Testing Tool | 对外 operational run authority |
| `TestingTask`、`TestingAttempt`、placement、lease、generation、fence | Talos Scheduler / worker | 决定在哪里、何时执行 |
| operation-specific `LocalQARequestAuthorization`、签名 key lifecycle | Proposed Hosted Authorization Authority（Decision pending） | 提议在 reservation 后签发绑定 run/attempt/lease claim/machine/generation/fence/request digest 的业务授权；不拥有调度 |
| workspace、process、port、Chromium、local Evidence、Cleanup | Local QA Runtime Journal | 本机 effect 和资源 ownership 权威 |
| Artifact grant、`prepare/commit/lookup`、ingest receipt、lost-ack | Proposed Hosted ArtifactStore（Decision pending） | Browser MVP 的候选 Evidence 交付依赖；提议复用已有 object-storage adapter，但不复用 session-log 领域语义；不拥有 CaseResult 或 QARun |
| Final Quality、Report、Publication、Settlement、HostedQualityFeedback | Hosted 后续领域 | Post-MVP，不阻塞首个 Browser execution，但不得与 MVP ArtifactStore 混为同一延期项 |

运行结果必须正交保存：

```text
control_status
execution_outcome
evidence_outcome
upload_outcome
cleanup_outcome
```

Talos task `completed` 只表示 attempt 已闭合，不表示 Case passed、Evidence 已摄取、Cleanup 完成或 Final Quality passed。

## 5. 时序图 19 步覆盖与强制补充链路

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
| 14 | 返回 `AssertionResult` / `CaseResult` | Testing Packages | Browser candidate 已有；Browser production writer 与 consumer 未验证，CLI/HTTP 全量迁移不阻塞首个 MVP | [Testing](fkst-packages-testing-gap-analysis.zh-CN.md) |
| 15 | 返回结果、Evidence 引用和 Cleanup | Runtime | 三类组件分别存在但未集成；Evidence 仍 local-only | [Runtime](local-qa-runtime-gap-analysis.zh-CN.md) |
| 16 | worker 回传 bounded terminal result | talos-worker | 通用 worker result API 已有；testing ABI 缺失 | [Talos](talos-gap-analysis.zh-CN.md) |
| 17 | 更新 `QARun` snapshot/events | Talos Testing Tool | 只有通用 Task 状态；无 testing event cursor/orthogonal outcomes | [Talos](talos-gap-analysis.zh-CN.md) |
| 18 | PQL `get/events` 轮询 | PQL + Talos | 两端均缺生产 Testing Tool 对接 | [PQL](product-quality-loop-gap-analysis.zh-CN.md)、[Talos](talos-gap-analysis.zh-CN.md) |
| 19 | PQL 展示测试结果 | PQL | 本地报告能力已存在；Talos terminal projection consumer 缺失 | [PQL](product-quality-loop-gap-analysis.zh-CN.md) |

`pql-testing-simple-flow` 是 overview，不是完整安全协议。详细 Target 提出以下两条不能从完整 Browser MVP 中省略的链路；其中 Hosted owner 和接口只有在 [边界决策提案](../design-proposals/hosted-authorization-artifact-boundary-decision.zh-CN.md) 被接受后才成为 Active implementation target：

```text
Talos reservation + exact attempt binding
  -> Hosted Authorization Authority issue/replay start authorization
  -> TestingExecutor 验证并投影完整 signed authorization
  -> Runtime 验证 local credential + signature + nonce + current claim

Runtime sanitized Evidence + manifest
  -> Hosted ArtifactStore prepare/upload/commit/lookup
  -> artifact ref + ingest receipt
  -> Talos terminal projection
```

缺少第一条时 Runtime 必须 fail closed；缺少第二条时 Evidence 只能保持 local-only，不能声称 MVP 已完成稳定结果交付。

## 6. 跨 Repo 关键阻塞关系

```text
PQL revision / approved input lineage
  -> Testing Packages package manifest + runner invocation
  -> Talos Testing Tool request/task/result ABI
  -> attempt_id + generation + fence_token
  -> Hosted LocalQARequestAuthorization + Talos current-claim resolver
  -> Local Runtime admission + real execution spine
  -> CaseResultSet + EvidenceManifest + CleanupReceipt
  -> Hosted ArtifactStore receipt / lost-ack reconcile
  -> Talos bounded snapshot/events
  -> PQL TestingRunRecord
```

首个 Browser-only 垂直链路完成前，至少需要共同冻结；Hosted 相关合同必须先通过 `MVP-H` decision gate：

- `pql.testing-design-input-set.v1`。
- `testing-package-manifest.v1`。
- `testing-runner-invocation.v1`。
- `talos.testing-tool-request/v1`、`talos.testing-task/v1` 和版本化 result projection。
- `qa.local-run-admission/v2`。
- `attempt_id`、`generation`、`fence_token`。
- operation-specific `LocalQARequestAuthorization`、signed lease claim ref 和 current-claim resolver contract；raw `lease_token` 不进入 Runtime。
- `CaseResultSet`、`EvidenceManifest`、`CleanupReceipt` 的 ref/digest 绑定。
- MVP Artifact `prepare/commit/lookup`、stable object key、upload/ingest receipt 和 lost-ack contract。

## 7. 刷新规则

1. 每次审计必须记录日期、branch 和完整 commit SHA。
2. “已实现”结论必须引用固定 commit permalink；branch HEAD 和本地 checkout 只能作为辅助上下文。
3. Candidate 不得写成 Baseline；Target 不得写成已交付。
4. 同一事实只能有一个 authority，不能同时由 Hosted、Talos、Runtime 或 Testing Packages 重复拥有。
5. delivery repair、Artifact repair 和 report repair 不得触发已经产生副作用的 Case 自动重跑。
6. `CancelAck` 只表示取消意图已接受，不表示执行已停止或 Cleanup 已完成。
7. 每次 Target 变更必须同时检查本索引、详细 Gap、架构决策状态和 Roadmap；`Decision pending` 不得写成 Active，MVP 候选依赖也不得继续与 Post-MVP Quality/Report 混在同一阶段。
8. 简化时序图可以省略内部交互，但必须在本索引显式列出所有会导致 admission fail closed 或 terminal refs 不可消费的强制链路。

## 8. workflow-qa 自身维护 Gap

本 Repo 不拥有 runtime capability，但拥有跨 Repo 设计和审计一致性。需要补齐：

- baseline refresh：定期核对 branch HEAD，并区分固定 Baseline、较新 Candidate 和 Target；不得继续使用“最新”“未漂移”描述已推进的分支。
- superseded isolation：历史 Hosted-owned QARun/scheduler 内容必须移入历史附录或逐节标记，不得继续出现在活动实施顺序中。
- cross-repo fixture registry：记录每个 contract/fixture 的 owner、major、canonicalization profile、固定 producer/consumer commit 和 Gate 状态。
- conformance gate index：集中显示 Rust、TypeScript、Lua/Python consumer 对 valid/invalid fixture 的一致性，以及哪些结论只经过组件测试、尚未经过 canary E2E。
- Target consistency check：至少检查 Authorization signer/verifier、ArtifactStore、lease credential 边界和 MVP/Post-MVP 分类在 overview、详细设计、Gap 和 Roadmap 中一致。
