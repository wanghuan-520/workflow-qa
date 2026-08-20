# PQL Testing 跨仓实施 Roadmap

> 状态：Proposed Implementation Roadmap
>
> 日期：2026-08-18
>
> Target：[PQL Testing 简化时序图](design-proposals/diagrams/pql-testing-simple-flow.mmd) 与 [Talos Testing Tool 最小 MVP 设计](design-proposals/talos-testing-tool-mvp-design.zh-CN.md)
>
> Gap 索引：[repo-gaps/README.zh-CN.md](repo-gaps/README.zh-CN.md)

## 1. Roadmap 目标

本 Roadmap 用于把当前分散在 Product Quality Loop、Testing Packages、Talos 和 Local QA Runtime 的能力接成第一条可信的 Browser-only Testing 垂直链路：

```text
用户 / Agent
-> Product Quality Loop
-> Testing Packages compile StructuredPlan
-> NyxID
-> Talos Testing Tool / QARun
-> Talos Scheduler / worker
-> Local QA Runtime
-> Testing Packages runner + temporary Chromium
-> CaseResultSet + EvidenceManifest + CleanupReceipt
-> Talos Snapshot / Events
-> PQL TestingRunRecord
```

首个 MVP 的目标不是覆盖所有测试类型，而是证明：

- immutable 测试输入可追踪。
- 请求可以幂等接受和查询。
- task 可以调度到正确机器。
- Runtime 在本机真实执行 Browser 测试。
- CaseResult 来自 assertion 事实，而不是 task/browser 状态猜测。
- Evidence 有界、可验证、可追踪。
- success、failure、cancel、timeout 和 crash 都能精确 Cleanup。
- 不确定副作用不会自动跨机器重跑。

## 2. 范围和不变量

### 2.1 MVP 范围

首个版本固定为：

- Browser-only。
- Chromium。
- macOS arm64 canary pool。
- 每台 machine 最多一个 execution-bearing Testing Run。
- 无 Secret refs。
- Evidence 只允许 PNG screenshot 和 bounded sanitized JSON。
- 不连接用户已经打开的普通 Chrome。
- 不使用 persistent login profile。
- 不开放 arbitrary shell、argv、cwd、env、CDP endpoint 或动态 plugin。

### 2.2 全阶段不变量

1. PQL 决定为什么测、测什么，不选择机器。
2. Testing Packages 定义测试语义，不拥有本机资源。
3. Talos 决定在哪里、何时执行，不计算 assertion。
4. Local QA Runtime 拥有本机 effect 和 Cleanup，不决定 Final Quality。
5. task `completed` 不等于 Case passed、Evidence complete 或 Final Quality passed。
6. local acceptance 前允许重新 placement；acceptance 后不自动跨机器重跑。
7. stale generation/fence 不能继续执行 Browser action、上传或提交 terminal result。
8. Artifact/report/publication repair 不得触发测试重跑。
9. Cleanup 只能处理当前 Run 已记录的 OwnedHandle，不得模糊扫描或猜测删除。
10. Artifact bytes 不进入 NyxID Tool response、heartbeat、findings 或 error message。

## 3. 固定起始基线

| Repo | 起始基线 | Roadmap 主要职责 |
| --- | --- | --- |
| `ChronoAIProject/fkst-packages-testing` | [`dev@ac953ff0`](https://github.com/ChronoAIProject/fkst-packages-testing/commit/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1) | StructuredPlan、runner、Assertion/CaseResult、Evidence contract |
| `YueZh127/product-quality-loop` | [`main@5096cde5`](https://github.com/YueZh127/product-quality-loop/commit/5096cde5349c66fa9725b39e4008951887b17cd0) | Snapshot/Selection、Testing Tool client、TestingRunRecord |
| `ChronoAIProject/talos` | [`main@a32e537f`](https://github.com/ChronoAIProject/talos/commit/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb) | Testing Tool/QARun、调度、attempt/lease/fence、worker |
| `ChronoAIProject/fkst-hosted` | [`feat/local-qa-runtime@4b173897`](https://github.com/ChronoAIProject/fkst-hosted/commit/4b17389711fc420bfef56765d7d6af34e1702eb0) | Runtime admission、Journal、本机环境、Browser、Evidence、Cleanup |

`feat/local-qa-runtime` 相对 `develop` 已明显分叉。本 Roadmap 中的 Runtime 实施和验证必须固定到明确 commit/branch，不能直接推断主线已包含对应能力。

## 4. 阶段和 Gate 总览

| 阶段 | 名称 | 初始状态 | 主要产出 | 下一阶段 Gate |
| --- | --- | --- | --- | --- |
| R0 | 正确性修复与跨仓契约冻结 | Ready | 可 reopen Journal、共享 contract/fixtures | 合法/非法 fixture 在各语言和仓库得到一致结果 |
| R1 | Local Runtime 诚实执行主链 | Blocked by R0 | Host -> Worker -> Browser -> Result -> Evidence -> Cleanup | 本地 whole-flow gate 通过且不再 synthetic passed |
| R2 | Testing Packages 产品化 | 可与 R1 后半段并行 | package manifest、runner invocation、canonical outputs | fake/Runtime adapter 产生相同 Case/Assertion 语义 |
| R3 | Talos Testing Tool 和调度接入 | Blocked by R1/R2 contracts | QARun API、kind=testing、TestingExecutor、fence | Talos canary 可运行真实 Runtime attempt |
| R4 | PQL Testing Tool 集成 | Blocked by R3 API | TestingToolClient、TestingRunRecord、结果展示 | PQL 能提交、追踪、取消并展示 terminal refs |
| R5 | 跨仓 Canary 和生产加固 | Blocked by R1-R4 | 失败矩阵、conformance CI、canary rollout | 浏览器 MVP 全局退出标准通过 |
| R6 | Hosted Artifact/Quality/Report | Post-MVP | ingestion、QualityEvaluation、Report/Settlement | delivery/report repair 不改变执行事实 |
| Future | 多 backend 与 Hardened Runtime | Post-R5 | API/CLI、多浏览器、Secret、VM/EffectGate | 各自独立规范和安全 Gate |

## 5. R0：正确性修复与跨仓契约冻结

### 5.1 目标

建立可继续开发的正确性基础，避免四个仓库在实现期间各自发明 request、attempt、result 和 digest 语义。

R0 包含两条可以立即并行的工作线：

```text
R0-A Local Runtime Journal correctness
R0-B Cross-repo contract and fixture freeze
```

### 5.2 R0-A：修复 Local Runtime Journal

负责 Repo：`fkst-hosted/feat/local-qa-runtime`。

实现内容：

- 修复 SQLite `user_version=4` 无法正常 reopen 的问题。
- 增加 fresh database、历史 migration、v4 reopen 和 migration failure tests。
- migration 使用事务，并在成功前保持 admission 关闭。
- 启动流程固定为 migrate -> discover -> reconcile -> cleanup -> open admission。
- 为 claimed attempt 增加 restart disposition：resume-safe、lost、cancelled、timed_out 或 cleanup-required。
- 将 execution、evidence、upload、cleanup outcomes 与 control status 分开持久化。

退出标准：

- 同一个 Journal 可在正常关闭和异常退出后重复 reopen。
- migration failure 不产生新的执行副作用。
- claimed attempt 不会在 restart 后永久 stranded。
- 没有执行测试时不能产生 synthetic `passed`。

### 5.3 R0-B：冻结首个跨仓合同集合

负责 Repo：四仓 contract owners；合同分别落在 owning repo。

必须冻结：

- `pql.testing-design-input-set.v1`。
- `testing-package-manifest.v1`。
- `testing-runner-invocation.v1`。
- `talos.testing-tool-request/v1`。
- `talos.testing-task/v1`。
- `qa.local-run-admission/v2`。
- `CaseResultSet`、`EvidenceManifest`、`CleanupReceipt` ref/digest binding。
- `run_id`、`task_id`、`attempt_id`、`generation`、`fence_token`。
- canonicalization profile、digest algorithm/encoding 和 bounded SafeError。

共享 fixture 至少覆盖：

- valid request。
- same key/same digest replay。
- same key/different digest conflict。
- unsupported major。
- wrong run/task/attempt binding。
- expired deadline。
- stale generation/fence。
- malformed/bounds exceeded。
- missing/tampered/cross-run Evidence ref。

退出标准：

- Rust、TypeScript、Lua/Python consumer 对相同 fixture 给出一致 acceptance/rejection。
- 合同中没有 caller-supplied machine、host path、argv、env、CDP endpoint 或 Secret material。
- 每个字段只有一个 authority 和 owning repo。

### 5.4 R0 非目标

- 不实现完整 Talos Tool API。
- 不接 PQL production client。
- 不实现 Hosted Final Quality/Report。
- 不扩展 API/CLI backend。

## 6. R1：Local Runtime 诚实执行主链

### 6.1 目标

删除 production synthetic success，建立第一条真实、可观测、可清理的本地 Browser execution spine。

```text
Host submit
-> SQLite admission
-> real Executor
-> Worker process
-> Browser adapter
-> Testing Packages assertion
-> Evidence stager
-> Cleanup
-> Journal terminal
```

### 6.2 实现内容

负责 Repo：`fkst-hosted/feat/local-qa-runtime`，Testing Packages 提供 test fake/contract 支持。

- 用真实 executor composition 替换 production `PassingExecutor`。
- Host 启动并监管固定 Worker executable。
- 限制 Worker version/digest、stdin/stdout frame、stderr、deadline 和 process group。
- 实现 Worker capability peer，不允许 Worker 直接访问任意 filesystem/network/Chrome。
- Host 调用现有 Browser adapter，返回 bounded Observation 和 screenshot ref。
- Browser adapter 不再根据观察文本决定 Case Pass/Fail。
- 通过 Testing Packages test runner/fake 生成 AssertionResult 和 CaseResult。
- Evidence stager 写入 screenshot、bounded sanitized JSON 和 local diagnostics。
- Journal 持久化 invocation、attempt、result refs、Evidence refs 和 CleanupReceipt。
- effect-sensitive state transition：没有 Evidence/upload effect 时不能写对应进行中状态。
- executor error、cancel、timeout 和 crash 都进入 mandatory Cleanup。

### 6.3 Cancel、恢复和 ownership

- cancel intent 先持久化，再阻止新 action。
- 向 Worker 发送 cancel/abort；超时后终止 Worker/Chrome process group。
- 每个 workspace、process、port、profile、downloads 和 staging object 都有 OwnedHandle。
- resource create 前写 intent；create 后写 exact provider identity。
- identity write 前 crash 只能按 stable provider key/label reconcile。
- unknown ownership 形成 blocking residual，不猜测删除。
- action 后、assertion 前 crash 冻结为 `lost/inconclusive`，不重跑。

### 6.4 Whole-flow Gate

必须新增一个稳定入口，例如：

```bash
bash apps/local-qa-runtime/tests/local-qa-host-mvp-e2e.sh --all
```

该命令在实现前不存在，完成后必须覆盖：

- happy path。
- assertion failure。
- Worker crash。
- Chrome crash/timeout。
- cancel before claim 和 during execution。
- Host kill/restart。
- action 后、assertion 前 crash。
- ownership mismatch 和 cleanup residual。

退出标准：

- Worker 和 Chrome 在 happy path 各执行一次。
- assertion failure 是测试结果，不被归类为 Browser infrastructure error。
- restart 不重复执行旧 Case。
- 每条路径都有 CleanupReceipt 或明确 residual。
- production path 不再出现 synthetic `passed`。

## 7. R2：Testing Packages 产品化

### 7.1 目标

将已有 Testing Packages 能力收敛为唯一、可发布、可由 Local Runtime 调用的测试语义实现。

### 7.2 Package release 和 invocation

负责 Repo：`fkst-packages-testing`。

实现：

- 发布 `testing-package-manifest.v1`。
- manifest 固定 package ID、exact version、source commit、content digest、entrypoints、contracts 和 semantic capabilities。
- 发布 `testing-runner-invocation.v1`。
- 实现 provider-neutral `TestingPackageExecutor`。
- 提供 fake capability ports 和 Local Runtime adapter conformance fixtures。
- package mismatch、unsupported major/capability/entrypoint fail closed。

### 7.3 Canonical result convergence

- CLI、HTTP、Browser 原生输出同一 canonical result/evidence family。
- 将 Issue #656 Candidate 中有效 helper/hardening 接入 production run path。
- canonical artifacts 写成功后才生成 legacy compatibility projection。
- publication 只消费公共 validator。
- malformed canonical output 不得 fallback 为 legacy passed。
- Browser action success 与 Case passed 分离。
- effect 后 assertion 前 crash 映射为 lost/inconclusive。

### 7.4 资源 ownership 迁移

从 Testing Packages production path 迁出：

- source workspace/cache。
- process/process group。
- listener/port/readiness。
- Chrome/profile/downloads。
- raw quarantine/staging。
- Run-wide Cleanup。

保留在 Testing Packages：

- Plan interpretation。
- typed action progression。
- Observation validation。
- assertion evaluation。
- CaseResult/EvidenceManifest semantics。

退出标准：

- 同一 invocation 通过 fake adapter 和 Local Runtime adapter 时产生相同 Case/Assertion 语义。
- CLI/HTTP/Browser 使用同一公共 validator 和 result family。
- Testing Packages 不保存 Talos lease/fence，也不直接拥有本机资源。
- replay、delivery repair 和 publication repair不重复 target effect。

## 8. R3：Talos Testing Tool 和调度接入

### 8.1 目标

在 Talos 中新增第一方 Testing Tool family，而不是把 Browser goal 或 computer-use task 包装成测试运行。

### 8.2 Testing Tool API

负责 Repo：`talos`。

实现五个稳定 operation：

```text
talos.testing.get_capabilities
talos.testing.submit
talos.testing.get
talos.testing.events
talos.testing.cancel
```

要求：

- OpenAPI 有稳定 operationId，供 NyxID catalog 投影。
- client-provided `run_id` 是幂等资源身份。
- acceptance 只表示控制面接受 QARun。
- Snapshot/Event bounded，并有 ref/digest/cursor。
- cancel acknowledgement 与实际停止/Cleanup completion 分离。

### 8.3 QARun、Task 和 Attempt

实现：

- `QARun`：对外 stable run、Snapshot、Events、Cancel 和结果 refs。
- `TestingTask`：strict `kind=testing` union，不使用自由文本 goal 决定执行。
- `TestingAttempt`：machine、lease、generation、fence、deadline 和 local acceptance。
- atomic reservation/claim 或 durable CAS。
- single-active execution-bearing attempt。
- stale heartbeat/completion/upload rejection。

### 8.4 Worker 和 Runtime adapter

- talos-worker 固定注册 `TestingExecutor`。
- executor 验证 task kind/schema/version。
- 实现 `LocalQARuntimeAdapter` 的 submit/get/events/cancel/reconcile。
- worker 只负责 claim、heartbeat、cancel/deadline 和 bounded result projection。
- worker 不 checkout、不启动 Chrome、不计算 assertion。

### 8.5 Retry 和 fencing

- local acceptance 前，明确未接受的 attempt 可以重新 placement。
- local acceptance 后只做 same-machine reconcile、停止和 Cleanup。
- stale fence 不能产生新 effect、上传或提交 terminal result。
- control-plane outage 不能自动跨机器重跑已经开始的 Case。
- cleanup residual blocking 时 machine slot 不得重新投入使用。

退出标准：

- PQL/test client 可以幂等创建和查询 QARun。
- canary machine 能领取 `kind=testing` 并调用真实 Runtime。
- duplicate、cancel、deadline、lease loss 和 stale completion 有确定结果。
- Talos Snapshot 能独立表达 execution/evidence/upload/cleanup outcomes。

## 9. R4：Product Quality Loop 集成

### 9.1 目标

让 PQL 从批准的产品测试资产生成冻结输入，并通过 NyxID/Talos 管理一次真实 Testing Run。

### 9.2 输入和版本对齐

负责 Repo：`product-quality-loop`，依赖 Testing Packages 固定 release。

- 冻结 `ProjectPackSnapshot`。
- 只选择 approved、published、executable/regression TestCaseAsset。
- 生成 `TestSelection` 和 `pql.testing-design-input-set.v1`。
- 调用 Testing Packages 编译 StructuredPlan。
- 将 PQL 当前固定的旧 Testing Packages revision 升级到经过联合验证的 release。
- request 中携带 package ID/version/digest，不依赖隐式 workspace 状态。

### 9.3 TestingToolClient

实现 provider-neutral client：

- get capabilities。
- submit stable run ID。
- get bounded Snapshot。
- consume events/cursor。
- cancel。
- 区分 NyxID transport error、Talos rejection、run conflict 和 execution terminal failure。

PQL 不选择 pool/machine，不直连 Runtime，不搬运 Artifact bytes。

### 9.4 TestingRunRecord

至少保存：

- Snapshot/Selection/InputSet refs + digests。
- StructuredPlan/package refs + digests。
- Talos run ID/request digest。
- last Snapshot version/ref/digest。
- resume cursor。
- execution/evidence/upload/cleanup outcomes。
- result/evidence/cleanup refs + digests。
- bounded user-facing summary。

必须处理：

- duplicate events。
- same sequence/different digest。
- cursor expiry + Snapshot resync。
- lost submit acknowledgement。
- cancel accepted/stopping/cleanup complete 分阶段状态。

退出标准：

- 用户可以从 PQL 提交、查询、取消并查看一次 Browser Testing Run。
- PQL 的 input provenance 在 Talos/Runtime 暂时不可用时不丢失。
- task completed 不被转换为 Case passed 或 Final Quality passed。
- PQL 和 Testing Packages 固定版本通过联合 conformance tests。

## 10. R5：跨仓 Canary 和生产加固

### 10.1 目标

用真实 macOS arm64 canary machine 验证四仓契约、状态和恢复语义，而不只是单仓 component tests。

### 10.2 Cross-repo conformance CI

建立固定 fixture bundle，覆盖：

```text
PQL Snapshot / Selection / InputSet
-> Testing Packages StructuredPlan
-> Talos request/task/attempt
-> Runtime admission/invocation
-> CaseResultSet/EvidenceManifest/CleanupReceipt
-> Talos Snapshot/Events
-> PQL TestingRunRecord
```

每个 Repo CI 至少验证自己消费和输出的 contract major、canonical digest 和 negative fixtures。

### 10.3 Canary 场景

必须覆盖：

- happy path。
- assertion failure。
- duplicate submit/conflicting digest。
- cancel before placement、during execution、after execution terminal。
- worker/runtime/browser crash。
- control-plane restart/outage。
- action 后 assertion 前 crash。
- stale lease/generation/fence。
- Evidence schema/media/size/digest failure。
- Artifact outage 和 upload acknowledgement 丢失。
- cleanup residual blocking。
- event duplicate/cursor expiry/Snapshot resync。

### 10.4 观测和发布 Gate

需要：

- run/task/attempt/machine correlation。
- bounded redacted logs。
- queue、placement、event lag、execution duration、cleanup residual、upload lag metrics。
- feature flag 和 canary allowlist。
- rollback 不破坏已有 QARun/Event/Artifact refs。
- contract major 不兼容时明确拒绝，不降级为 browse/computer-use。

### 10.5 MVP 全局退出标准

- provenance 从 PQL Snapshot 一直闭合到 CaseResultSet。
- 真实 Browser action 和 assertion 在 canary machine 执行。
- duplicate/lost acknowledgement 不产生第二次执行。
- uncertain side effect 不自动重跑。
- stale worker 无法继续 effect、upload 或 completion。
- raw Evidence 不离开设备。
- 只有 validated PNG/bounded JSON 进入 uploadable set。
- success/failure/cancel/timeout/crash 均有 CleanupReceipt 或明确 residual。
- Talos 和 PQL 都不把 task completed 推断为 Final Quality。

## 11. R6：Hosted Artifact、Final Quality 和 Report

R6 不阻塞第一个 Talos Testing MVP，但在需要长期结果、质量判断和正式报告时实施。

负责领域：Hosted Artifact/Quality/Report owners。

实现：

- per-object upload grant。
- digest/media/size/run/case/assertion validation。
- ArtifactUploadReceipt 和 ArtifactIngestReceipt。
- bytes stored/ack lost reconcile。
- immutable `ReportInputSet`。
- `QualityEvaluation`。
- deterministic JSON ReportRecord 和 Markdown/HTML renderer。
- PublicationPlan/Receipt。
- RunSettlement 和独立 repair ledger。
- optional PQL quality feedback。

约束：

- Hosted 不重复拥有 Talos operational QARun。
- report repair 不修改 execution facts。
- Artifact/report/publication repair 不创建新 TestingAttempt。
- `report_impossible` 由 Hosted 根据 ReportInputSet 和 policy 决定，不由 Runtime 推断。

退出标准：

- Artifact 重试不重复创建 logical object。
- Quality/Report 可从相同 ReportInputSet 重放。
- execution、evidence、upload、cleanup、quality、report、publication 可独立解释。

## 12. Future：多 Backend 和 Hardened Runtime

以下工作不进入 Browser-only MVP：

- API/CLI testing backend。
- 多浏览器和移动端。
- persistent authenticated profile。
- Secret refs 和 credential materialization。
- raw DOM、trace、network/download content。
- VM/VZ、EffectGate、Secret Broker、Grant authority ledger。
- arbitrary untrusted code。

Future 工作必须建立独立规范和 Gate，不能通过扩大 Browser MVP contract 隐式接入。

现有 Hardened backlog 继续由 [TODOS.md](TODOS.md) 跟踪；不得把 Hardened shell/scaffold 描述成当前 MVP 的安全保证。

## 13. 建议 Issue 分解

| 顺序 | Repo | 建议 Issue | 所属阶段 |
| ---: | --- | --- | --- |
| 1 | `fkst-hosted` | Fix Local QA Journal v4 reopen and startup migration | R0 |
| 2 | 四仓 | Freeze Testing MVP cross-repo contracts and golden fixtures | R0 |
| 3 | `fkst-hosted` | Replace production PassingExecutor with real Worker/Browser/Evidence execution | R1 |
| 4 | `fkst-hosted` | Add cancel, timeout, restart reconcile and orthogonal outcomes | R1 |
| 5 | `fkst-packages-testing` | Publish testing package manifest and runner invocation contracts | R2 |
| 6 | `fkst-packages-testing` | Converge CLI/HTTP/Browser canonical result and Evidence paths | R2 |
| 7 | `talos` | Add Testing Tool API, QARun and strict testing task model | R3 |
| 8 | `talos` | Add TestingExecutor, Runtime adapter and attempt generation/fence | R3 |
| 9 | `product-quality-loop` | Add TestingToolClient and TestingRunRecord | R4 |
| 10 | 四仓 | Add Browser-only cross-repo canary conformance gate | R5 |
| 11 | Hosted domain | Add digest-bound Artifact ingestion and immutable ReportInputSet | R6 |

## 14. 阶段依赖图

```text
R0-A Journal correctness ─────────────┐
                                      ├─> R1 Local execution spine ──┐
R0-B Contract freeze ─────────────────┘                              │
                                                                     ├─> R3 Talos Testing Tool
R0-B Contract freeze ──> R2 Testing Packages productization ────────┘
                                                                          │
                                                                          v
                                                                    R4 PQL integration
                                                                          │
                                                                          v
                                                                    R5 Cross-repo canary
                                                                          │
                                                        ┌─────────────────┴───────────────┐
                                                        v                                 v
                                               R6 Hosted reports                 Future backends/hardening
```

允许并行：

- R0-A 与 R0-B。
- R1 execution spine 与 R2 canonical/package 工作在合同冻结后并行。
- R6 的 Artifact schema 设计可提前，但 production 接入不能阻塞 R1-R5，也不能重定义 Talos QARun。

禁止提前：

- R0 未完成时开始四仓各自定义 wire contract。
- R1 未证明真实本地执行时直接声明 Talos canary 可用。
- R3 API 未稳定时在 PQL 固化 provider-specific transport shape。
- R5 未通过时扩展 Secret、API/CLI 或 Hardened execution。

## 15. Roadmap 更新规则

每个阶段状态只允许使用：`Planned`、`Ready`、`In Progress`、`Blocked`、`Done`。

阶段进入 `Done` 必须同时满足：

- owning repo 的实现已合入明确分支/commit。
- 阶段退出标准已由自动化 Gate 证明。
- 跨 repo contract fixture 已更新并通过。
- 对应 [Gap 文档索引](repo-gaps/README.zh-CN.md) 已刷新固定 Baseline。
- Candidate 和 Target 没有被误写成已交付能力。

Roadmap 不使用模糊百分比。部分完成时列出已通过和仍阻塞的 Gate，不把 component test 通过等同于阶段完成。
