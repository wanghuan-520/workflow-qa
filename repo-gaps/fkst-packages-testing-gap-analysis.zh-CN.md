# fkst-packages-testing 详细缺口清单

> Repo：[ChronoAIProject/fkst-packages-testing](https://github.com/ChronoAIProject/fkst-packages-testing)
>
> 审计日期：2026-08-21
>
> Pinned Baseline：[`dev@4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5`](https://github.com/ChronoAIProject/fkst-packages-testing/commit/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5)
>
> Historical comparison baseline：`dev@ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1`，仅用于解释本轮 canonical migration 前的状态。
>
> Live status overlay（2026-08-21）：当前远端与 Pinned Baseline 相同；`#666` 已合并，structured CLI/HTTP 已切换为 canonical ResultSet/EvidenceManifest 主写入路径；`#631`、`#662`、`#663`、`#664` 仍 open。`#677` 的 invocation walking skeleton 被拒绝，原因是当前没有可证明的 provider-neutral executor seam、trusted ref resolver 和规范化 entrypoint mapping。
>
> Target：[PQL Testing 简化时序图](../design-proposals/diagrams/pql-testing-simple-flow.mmd) 与 [Testing Packages 调整方案](../design-proposals/repo-adjustments/fkst-packages-testing-adjustments.zh-CN.md)

## 0. 2026-08-20 Talos Tool 方向增量审计

### 0.1 结论

`fkst-packages-testing` 的 Target 是 **AI 驱动的测试用例执行引擎**，不是脚本生成器、NyxID/Talos HTTP 服务、机器调度器或本地资源管理器。它直接读取 immutable structured TestCase，维护 TestingAgentLoop，调用严格的 typed tools，接收 bounded ModelObservation，并由 deterministic AssertionReducer 形成 CaseResult。

仓库发布的 data-only bundle/manifest 只是用例、schema、tool catalog、语义引擎身份和 allowlisted semantic entrypoint identity 的版本化制品，不携带用户脚本、生成代码、动态 plugin、任意 executable path 或运行时安装信息。

```text
PQL approved structured TestCase
  -> TestCaseExecutionEngine / TestingAgentLoop
  -> ModelInferencePort
  -> closed typed tool catalog
  -> Local QA Runtime capability broker
  -> sanitized ModelObservation
  -> next AI turn / evaluator
  -> CaseResultSet + EvidenceManifest + ResultAuthorityReceipt
  -> Talos bounded terminal projection
```

### 0.2 本轮核实的新增事实

- 当前 Pinned Baseline 为 `dev@4ccb3c3a...`；`ac953ff0` 只作为历史对照。当前仓库有 14 个 `packages/*`、13 份 Markdown contract、371 个 Lua 和 42 个 JavaScript 文件，不能按脚手架描述。
- `testing-runner` 被声明为 `stateless_adapter`，可复用 `StructuredPlan`、single-use grant、argv/HTTP capability containment、replay guard、agentic-browser typed-action loop、CaseResultSet/EvidenceManifest validator。
- 当前 tree 仍没有 repository-level JSON Schema 或等价的跨语言发布 schema；外部 Talos/Runtime 不能依赖 Lua validator 细节完成 admission。`#663` 仍 open。
- `testing-package-manifest.v1` 的 Markdown contract、Lua validator 和 focused tests 已存在，但这不等于已有可 fetch/cache/install 的 signed release bundle。release authority、bundle artifact、admission 和 update/rollback 语义仍缺失；`#674` session 仍在推进。
- `#666` 已使 structured CLI/HTTP production path 原生写 canonical CaseResultSet/EvidenceManifest，并保留 v1 compatibility projection；当前剩余问题是 Browser route、publication、schema 和跨 route conformance 收敛，而不是 CLI/HTTP canonical writer 尚未存在。
- HEAD 有成功的 host/package/generic-host/AI pipeline CI，但没有当前 SHA 对应的 live-CDP 成功 gate；因此 Browser 语义代码存在，不等于 Talos 真实机器 Browser E2E 已验证。
- `#677` 的 walking skeleton 暴露了更早的 authority 缺口：当前没有可证明的 provider-neutral `TestingPackageExecutor` seam，opaque ref 没有 trusted resolver，manifest entrypoint 也没有规范化选择规则。`#664` 仍 open，不能把 proposed interface 写成现有能力。
- `fkst_native.lua` 仍把普通 UI exploration 返回 `browser-exploration-deferred`，`module_cdp_execution.lua` 明确阻止 mutation action；这些应写成 P2/非 MVP，而不是暗示通用 computer-use 已完成。

### 0.3 对 Talos 接入的直接缺口

**P0：** structured TestCase/Step/Assertion schema、data-only bundle manifest、`testing-runner-invocation.v1`、TestingAgentLoop、ModelInferencePort、closed typed tool catalog、AgentTurnLedger、AssertionReducer、ResultAuthorityReceipt，以及共享 canonical contract/validator、Browser production writer 和 runner-side conformance fixture。

**P1：** effective capability intersection、point-of-use cancel/deadline/fence、pre-model ModelObservation sanitization、monotonic AI/tool budgets、effect 后 assertion 前的 `lost/inconclusive`、CaseResultSet/EvidenceManifest binding、CLI/HTTP writer convergence、Artifact pointer/receipt conformance、publication 与 delivery repair 分离。Artifact grant 和 bytes 仍由 decision-accepted Artifact owner/Runtime 拥有。

**P2：** live provider canary、多 Browser Case、API/CLI/Mobile tool adapters、普通 UI exploration 和 mutation executor。它们不能阻塞 Browser infrastructure gate，也不得通过 `browse` fallback 实现。

### 0.4 执行模型约束

- AI 直接解释结构化 TestCase，不解释自由文本 `goal`。
- AI 只能从固定 tool catalog 选择工具；tool schema 是 strict closed union，禁止运行时动态注册。
- 工具执行只返回 bounded sanitized ModelObservation 和 effect receipt。
- 不生成、保存或执行中间测试脚本、generated code、interpreter eval、runtime package install、dynamic plugin 或 arbitrary shell/argv。
- 模型文本、hidden reasoning、HTTP 200、process exit 0 或 Browser action success 都不能直接建立 passed；最终结果由 AssertionReducer 和 canonical binding 确定。

## 1. 执行摘要

Testing Packages Baseline 已有较完整的测试设计、StructuredPlan、CLI/HTTP execution、agentic Browser typed action、assertion/case result、environment factory、artifact/publication 和 durable replay/recovery 基础。

旧版 Gap 文档把统一 Observation、AssertionResult、CaseResult 和 EvidenceManifest 描述为整体缺失，已经不准确。更准确的判断是：

- Baseline 已存在 canonical results/evidence contract 基础和 Browser route 输出；`#666` 又把 structured CLI/HTTP 主路径切换为 canonical pair，legacy `testing-structured-case-results.v1` 现在是兼容投影。
- publication 已开始消费共享 canonical validator，但跨 route、Browser production writer、schema 发布和 consumer inventory 仍未形成完整 conformance gate。
- 本地 Issue #656 增量不能作为当前状态依据；相关 canonical migration 已通过后继 `#666` 进入 live dev，但 `#631` 作为父 Issue 仍 open，需继续核对 downstream/route 收敛。
- package release/distribution/admission、provider-neutral executor seam、trusted ref resolver、runtime invocation、PQL/Talos/Runtime 接线和资源 ownership 收缩仍然缺失。

因此本 Repo 的核心任务不是重写测试系统，也不是成为 NyxID/Talos 网络服务，更不是增加用户可见的脚本生成流程；而是把已有能力收敛为可发布、可版本化、可由 Local QA Runtime 调用的 AI 测试用例执行引擎和唯一测试语义实现。

## 2. Target 职责与非职责

本 Repo 应负责：

- 结构化 TestCase/Step/Assertion 输入验证、repository/requirement/traceability 分析。
- `TestCaseExecutionEngine` 和 `TestingAgentLoop` 的测试语义、turn 状态、tool selection 和终态协调。
- prompt/system policy/tool catalog 语义及 immutable identity/digest。
- provider-neutral `ModelInferencePort` 请求/响应 contract，不保存 provider secret。
- typed action、bounded ModelObservation、effect receipt 和 Assertion evaluation。
- deterministic evaluator、model-judged evaluator 和 deterministic `AssertionReducer`。
- `AssertionResult`、`CaseResult`、`CaseResultSet`、`EvidenceManifest`、`ResultAuthorityReceipt`。
- AgentTurnLedger、execution replay、point-of-use policy enforcement 和 conformance fixtures。
- PQL input adapter、Runtime tool-broker interface 和 pointer-only Hosted projection adapter。

本 Repo 不应负责：

- 创建 Talos `QARun` 或管理 Tool API。
- 选择 pool/machine 或保存 task lease、generation、fence。
- 实现 Talos worker-side `TestingExecutor` 或 `LocalQARuntimeAdapter`。
- 启动/删除 workspace、process、listener、port、Chrome/profile/downloads。
- 直接拥有 raw Evidence quarantine、Artifact upload grant 或长期存储。
- 接收或生成任意 shell/argv、脚本、generated code、interpreter eval、dynamic plugin 或 runtime entrypoint。
- 决定 Final Quality、Report 或 Settlement。
- 暴露 NyxID/OpenAPI service。
- 在副作用结果不确定时自动重跑 Case。

## 3. Baseline 已实现能力

### 3.1 Testing design 和 reviewed plan

已实现：

- immutable repository URL/revision/input pointers。
- requirements/design/API schema/existing tests 输入。
- approval subject 和 digest 验证。
- repository analysis、requirements index、traceability seed。
- deterministic 与 reviewed AI case 合并。
- coverage matrix、dedup identity 和 reviewed closure。

证据：

- [`contracts/testing-design.v1.md`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/contracts/testing-design.v1.md)
- [`testing_design.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/libraries/contract/testing_design.lua)
- [`module_planning.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/packages/testing-runner/module_planning.lua)

### 3.2 StructuredPlan

已实现 `testing-structured-plan.v2`。Baseline 的 StructuredPlan 是声明式执行计划，不是用户需要编写或维护的测试脚本；Target 将由 TestCaseExecutionEngine 直接消费结构化 TestCase，并把 StructuredPlan 作为内部可重建的 plan identity：

- 绑定 module plan、case catalog、Environment receipt 和 Browser readiness。
- 只选择经过 review 且经 Host catalog 授权的 Case。
- 通过 ref/digest 加载 immutable inputs。
- 区分 `structured-api-cli` 与 `agentic-browser`。
- 生成 immutable plan ref/digest 和 residual risk。

证据：

- [`contracts/structured-execution.v2.md`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/contracts/structured-execution.v2.md)
- [`structured_planning.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/packages/testing-runner/structured_planning.lua)

### 3.2.1 TestCase 与 StructuredPlan 的权威关系

当前文档同时使用 `structured TestCase` 和 `StructuredPlan`，但这两个对象不能成为两个可独立修改的测试定义。MVP 必须冻结以下关系：

- PQL approved TestCase/TestCaseAsset 是测试语义、Assertion、Asset lineage 和 Requirement lineage 的唯一权威。
- `StructuredPlan` 是由 approved input、execution profile、package manifest 和 capability policy 确定性编译出的派生执行投影，不是用户脚本，也不是另一套可以独立编辑的 Case catalog。
- 如果 Runtime invocation 同时携带 TestCaseSet 与 StructuredPlan ref/digest，admission 必须校验 case identity、asset/version/digest、source revision、plan digest 和 package manifest binding 的闭合关系。
- stale、未批准、未 promotion 或与 TestCase digest 不匹配的 StructuredPlan 必须在任何 Browser/HTTP/CLI effect 前拒绝。
- Runtime 可以缓存或传递 StructuredPlan，但不能通过它重新定义 TestCase 语义；CaseResult 必须同时保留 TestCase lineage 和 Plan identity。
- `runner_entry_ref` 若出现在 Runtime fixture 中，只能表示 Runtime/environment 的受控入口引用，不能被解释成 TestCase、Assertion 或 StructuredPlan 的语义入口。

因此，Testing Packages standalone MVP 的执行顺序应明确为：

```text
approved TestCaseSet
  -> deterministic StructuredPlan projection
  -> TestCaseExecutionEngine / TestingAgentLoop
  -> typed capability effect
  -> CaseResult / Evidence / authority receipt
```

在这条关系和 digest binding 冻结前，不能把“能够读取 StructuredPlan”描述成 AI TestCase execution engine 已完成。

### 3.3 CLI/HTTP execution

Baseline 已实现；这些是现有受控 capability 和执行语义，不代表 Target 要求用户生成或维护脚本：

- direct argv、禁止 shell fallback。
- bounded timeout 和 approved working directory。
- CLI argv-prefix 与 HTTP origin/method/path-prefix capability。
- Host-owned execution grant。
- single-use effect authorization receipt。
- replay claim/completion；completed replay 不重复 target effect。
- case-results、execution metadata 和 per-case evidence artifact。

证据：

- [`structured_execution.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/packages/testing-runner/structured_execution.lua)
- [`testing_runtime/structured_execution.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/libraries/testing_runtime/structured_execution.lua)

### 3.4 Agentic Browser

Baseline 已实现部分 agentic Browser/tool loop；这只能证明当前组件和参考流程存在，不等于 Target 的 TestCaseExecutionEngine、ModelInferencePort、AgentTurnLedger 和 AI conformance 已完成：

- exact repository/environment/plan/grant binding。
- bounded step/time budget。
- sanitized Observation validation。
- selector-free typed actions。
- replay claim、step receipt 和 terminal execution receipt。
- Host-authoritative completion。
- canonical result/evidence contract 基础和 Browser route 写入路径。

证据：

- [`contracts/agentic-browser-execution.v1.md`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/contracts/agentic-browser-execution.v1.md)
- [`ai_browser_control.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/packages/testing-runner/ai_browser_control.lua)
- [`testing_results.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/libraries/contract/testing_results.lua)
- [`testing_evidence_manifest.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/libraries/contract/testing_evidence_manifest.lua)

存在 canonical contract 和 Browser writer，不等于所有 execution route、publication 和生产 consumer 已统一。

### 3.5 Workflow、Environment、Artifact 和 Publication

Baseline 已有：

```text
intake
-> environment
-> analysis
-> browser readiness
-> module/design
-> structured plan
-> grant
-> execution
-> artifacts/defects
-> cleanup
-> publication
-> terminal
```

并具备 durable load/save、optimistic CAS、pending action redrive、duplicate callback convergence、timeout/interrupt cleanup、checkpoint ledger 和 publication replay。

证据：

- [`workflow-qa/core.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/packages/workflow-qa/core.lua)
- [`environment-factory/core.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/packages/environment-factory/core.lua)
- [`environment-factory/runtime.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/packages/environment-factory/runtime.lua)
- [`qa_publication.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5/packages/test-publication/qa_publication.lua)

这些模块的 README 成熟度仍包含 `experimental`、`migrating` 和 `skeleton`。组件/参考 E2E 存在，不应被描述成生产 Talos/Runtime 链路已经交付。

## 4. Baseline / Candidate / Target 状态矩阵

| 能力 | Baseline | Candidate | Target 剩余缺口 |
| --- | --- | --- | --- |
| canonical results contracts | 已存在 | `#666` 已完成 CLI/HTTP canonical pair | 唯一 writer/reader registry、Browser/CLI/HTTP conformance 与跨仓 schema digest |
| EvidenceManifest | contract、Browser writer、CLI/HTTP writer 已存在 | `#666` 已补 canonical pair | publication、Runtime、Artifact pointer/receipt 的完整 binding |
| CLI/HTTP execution | canonical-first 主路径，保留 v1 compatibility projection | `#631` 父 Issue 仍 open | downstream consumer inventory、route equivalence 和 legacy telemetry 清零 |
| Browser execution | typed action、bounded observation、canonical output 基础 | Browser hardening 未闭环 | provider-neutral invocation、point-of-use cancel/deadline/fence、lost/inconclusive、真实 Runtime E2E |
| publication | CAS/replay/GitHub/filesystem adapter、共享 canonical validator 基础 | legacy `product-defect`/compat projection 仍存在 | 降为 adapter，不拥有私有 result schema 或 Final Quality |
| TestCaseExecutionEngine / TestingAgentLoop | Baseline partial，已有 agentic Browser 片段 | proposed interface 未形成可调用 seam，`#677` walking skeleton 被拒绝 | 直接读取 TestCase，多轮 ModelInference/tool loop、终止和结果归并 |
| ModelInferencePort | 无 Target contract | 无 | provider-neutral inference request/response、refusal/timeout/truncation/usage |
| tool catalog/schema | typed action 和 capability 基础 | 无 immutable catalog | closed union、strict schema、allowlist、quota、point-of-use policy |
| AgentTurnLedger | replay/step receipt 片段 | 无 | append-only model/tool/observation/evaluator ledger |
| evaluator/reducer | 部分 assertion/result writer | 无统一 AI-aware reducer | deterministic/model-judged evaluator + deterministic AssertionReducer |
| package/data-bundle identity | manifest contract、Lua validator 和 tests 已存在 | 无已验证 release bundle/admission | signed/data-only release、exact bundle、resolver、install/cache/rollback policy |
| Runtime/AI session invocation | event/runner 与 generic-host composition 基础 | `#662` open；opaque refs 无 trusted resolver | 唯一 production envelope、schema、resolver、model/tool/harness identity + budgets |
| resolver/entrypoint/executor seam | 低层 ports 和 package validator 片段 | `#664` open；entrypoint mapping 不规范 | package/current-claim/executor resolver、唯一 symbolic entrypoint、fake/Runtime conformance |
| PQL input | generic approved pointers | adjustment draft | `pql.testing-design-input-set.v1` adapter |
| Talos integration | 无 | 无 | 由 Talos/Runtime adapter 实现；本 Repo 不提供 Talos transport |
| local resources | Environment Factory/Generic Host 当前直接拥有 | 迁移设计 | ownership 移交 Local QA Runtime |
| no-script execution | 仅有部分禁止项 | 无 Target gate | TestCase 直接解释；禁止生成/运行脚本和动态代码 |

Issue #656 已于 2026-08-18 closed/not planned。其历史 helper/compat/hardening 不能作为当前 active delivery track；structured CLI/HTTP canonical 主路径已由后继 `#666` 合并到 live dev。当前 live baseline 应以 `4ccb3c3a71dbd1005ff1a88d71dda6aa8133cbd5` 为准。

### 4.1 MVP layers 与证据等级

以下层级不能互相替代：

| 层级 | 当前状态 | 能证明什么 | 不能推出什么 |
| --- | --- | --- | --- |
| Testing Packages semantic/canonical foundation | shipped foundation | testing-design、StructuredPlan、canonical result/evidence、CLI/HTTP canonical writer 和部分 Browser writer 存在 | 不证明 AI TestCase engine、Runtime invocation 或真实机器 E2E 已完成 |
| Package release/admission | contract baseline，implementation open | manifest contract、Lua validator、focused tests 存在 | 不证明 signed release bundle、install/cache、trusted resolver 或 production admission 已完成 |
| Resolver + entrypoint + executor seam | blocked | 低层 ports、Browser loop 和 adapter fragments 可复用 | 不证明 `TestingPackageExecutor` 已存在；`#664` open，`#677` premise-refuted |
| Runtime invocation | open `#662` | invocation 字段和禁止字段已有 proposal | 不证明 opaque refs 可解析、digest 已校验或 effect 可安全授权 |
| Browser-only Local MVP | reference/infrastructure-only | Browser component、Runtime/Worker/Evidence 组件可作为 assembly gate | 不证明 Testing Packages AI loop、CaseResult authority 或 whole-flow Host E2E |
| PQL/Talos Browser canary | external target | 需要 PQL/Talos/Runtime/Artifact 跨仓 vertical slice | 不属于 Testing Packages 单 Repo 的完成条件 |
| Hardened/Post-MVP | explicit non-MVP | 可作为后续 profile 设计输入 | 不得通过 entrypoint/plugin/runtime install 字段间接启用 |

`P0/P1/P2` 是工作优先级；`MVP-A0`、`MVP-H` 或其他 fixture gate 是完成/决策门槛，不是同一维度。`status: draft`、`normative: false` 的 fixture 只能作为候选行为和负向测试来源，不能反向证明 production contract 已冻结。

## 5. P0：共享 canonical contract 和 Browser production path

### 5.1 目标 canonical family

已有 contract 应作为唯一收敛方向，而不是再创建 route-specific shape：

```text
testing-observation.v1
testing-assertion-result.v1
testing-case-result.v2
testing-case-result-set.v2
testing-evidence-manifest.v1
```

需要补齐：

- run/source/plan/package identity。
- Case/Asset/Requirement lineage。
- started/completed/duration 一致性。
- bounded errors/collections。
- duplicate/orphan/cross-run Evidence rejection。
- CaseResultSet 与 EvidenceManifest 的唯一 ref/digest binding。
- unsupported major fail closed。
- canonicalization profile 和 digest encoding 显式登记。

### 5.2 AI-aware Browser MVP 生产写入顺序

```text
immutable structured TestCase
-> TestCaseExecutionEngine
-> pre-model sanitized ModelObservation
-> TestingAgentLoop / ModelInferencePort
-> closed typed tool call
-> Runtime effect receipt
-> next sanitized observation / evaluator
-> deterministic AssertionReducer
-> CaseResultSet proposal + EvidenceManifest proposal
-> ResultAuthorityReceipt validation
-> atomically write canonical artifacts
-> publication consumes canonical output
```

模型可以提出工具调用和结构化 verdict，但不能直接写入最终 CaseResult。

规则：

- canonical helper 必须由 production run path 调用。
- canonical write 成功后才允许生成 compatibility artifact。
- replay 不重复 target effect，也不改写已冻结 canonical artifact。
- malformed canonical output 不得 fallback 到 legacy passed。
- publication 不重新解释 raw executor result。

### 5.2.1 Canonical writer 与 immutable facts ownership

`testing-*` semantic contract、validator、canonical writer 和 ResultAuthorityReceipt 的 authoring authority 必须唯一归属 `fkst-packages-testing`。`packages/qa-contracts`、Runtime、Talos、Hosted 和 publication 可以保存 registry entry、消费 bytes/ref/digest、生成各自 receipt，但不得复制或改写 Testing major 的 canonical writer。

统一规则：

- CLI、HTTP、Browser 是 producer adapter，不是三套独立 result authority；相同 assertion 必须产生等价 canonical facts。
- `#666` 已提供 CLI/HTTP canonical CaseResultSet/EvidenceManifest 主写入基础；legacy v1 只能由单一 compatibility adapter 单向派生。
- Runtime/Artifact 只拥有 raw quarantine、sanitized staging、bytes、object ref 和 delivery receipt；不能通过 delivery 状态改写已冻结的 CaseResultSet。
- publication 只读取 canonical refs/digests，不能重新解释 raw executor result、拥有私有 CaseResult schema 或生成 Final Quality。
- `execution_outcome`、`evidence_outcome`、`cleanup_outcome`、Case/Plan/Source/Package identity 和 effect lineage 属于 Testing/Runtime execution facts；`upload_outcome`、publication receipt 和 delivery repair 可以在不重跑测试的情况下单调推进。
- ResultAuthorityReceipt 必须绑定 TestCase identity、StructuredPlan identity、Run/Attempt、package/engine、AgentTurnLedger terminal digest、CaseResultSet 和 EvidenceManifest；任何一个 binding 不一致都不得提交 terminal result。

在 writer owner、bytes owner 和 receipt owner 没有分开冻结前，不得让 Runtime adapter 通过“临时 canonical helper”形成第二 authority。

### 5.3 P1（本跨仓 Browser MVP）：CLI/HTTP writer 和跨 route 等价

首个 Talos MVP 是 Browser-only。只要共享 schema、validator、digest profile 和 Browser writer 已冻结，现有 CLI/HTTP legacy writer 的全量迁移不得阻塞 Browser canary；但它们最终必须迁入同一 canonical family，不能永久形成 route-specific 语义。

这里的 `P1` 只表示 **workflow-qa 当前 Browser-only 跨仓垂直链路的阶段优先级**，不是要求修改 `fkst-packages-testing` owning repo 的产品 backlog。两者必须分别解释：

- Browser canary 的 P0 Gate 是共享 canonical contract/validator/digest profile、Browser production writer 和 Runtime-facing invocation；不要求先完成所有 CLI/HTTP producer 迁移。
- `fkst-packages-testing` 可以继续把完整 route convergence、schema、provider-neutral executor 和 runtime contract 作为自身 P0，因为这些工作还服务于该 Repo 的发布完整性和后续 backend。
- upstream P0 Issue 完成或关闭，不会自动证明 Browser canary Gate 已通过；反过来，Browser canary 不被全量迁移阻塞，也不表示 upstream P0 被降级或取消。

截至 2026-08-21 的 backlog 对照：

- [`#660`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/660) 已关闭，后继合并 PR [`#666`](https://github.com/ChronoAIProject/fkst-packages-testing/pull/666) 已在 `dev@4ccb3c3a...` 提供 canonical CLI/HTTP ResultSet/EvidenceManifest 与 separate digest domains。
- [`#631`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/631) 仍 open，剩余范围是 publication/private validator、compatibility/equivalence fixture、consumer inventory 和跨 route conformance，不应再把 canonical CLI/HTTP writer 本身当成未实现。
- [`#662`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/662)、[`#663`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/663) 和 [`#664`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/664) 仍 open，分别跟踪 invocation envelope/schema 和 provider-neutral executor seam。
- [`#677`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/677) 仍 open，但 consensus decision 为 `decline / premise-refuted`；它不是当前可引用的 MVP implementation evidence。其 blocker 已转化为 trusted resolver、唯一 entrypoint mapping 和真实 executor port 的前置要求。
- [`#665`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/665) 继续作为 Talos Testing Tool 准备工作的 tracking Issue；本 Gap 不改写其优先级或依赖。

三个 route 必须使用相同语义：

- status/classification。
- observations/assertion results。
- evidence refs。
- non-execution reason。
- plan/package/source identity。
- lost/inconclusive。

允许 producer metadata 不同，不允许相同逻辑 assertion 在不同 route 改变合同含义。

## 6. P0：Package release identity

新增 `testing-package-manifest.v1`，它是 **data-only 测试执行引擎/测试用例 bundle manifest**；可以声明经过 allowlist、contract-major 和 capability binding 的 semantic entrypoint identity，但不是用户脚本、任意 executable path 或动态 plugin 清单，至少包含：

```text
bundle_id
exact_version
source_commit
content_digest
case_schema_majors
step/assertion/tool contract majors
tool_catalog_ref/digest
engine_id/version
semantic_capabilities
runtime_requirements
producer/toolchain
created_at
```

Manifest 不得包含用户脚本、generated code、hooks、dynamic plugin、runtime import 或未 allowlist 的 executable entrypoint。

要求：

- release pipeline 对最终 package 内容计算 digest。
- manifest 自身 digest 不进入被 hash projection。
- Local QA Runtime 负责 fetch/cache/install/admission。
- package mismatch、unsupported contract major/capability/entrypoint fail closed。
- production admission 不接受 `workspace`、floating branch 或未固定 package identity。

### 6.1 Release、安装与 admission 的操作性缺口

当前已经有 `testing-package-manifest.v1` 的 Markdown contract、Lua validator 和 focused tests，但仍没有可证明的 release-to-admission 闭环。manifest contract 存在不等于 package bundle 已发布、可安装、可执行或被 Runtime 信任。

要达到 package MVP，release pipeline 至少必须生成并绑定：

- exact package bundle bytes 及 `content_digest`；
- manifest canonical bytes 及独立 `manifest_digest`；
- exact source commit 和 locked dependency commits；
- machine-readable contract schemas 及其 digest；
- semantic capability inventory 和 supported contract-major matrix；
- allowlisted symbolic executor/entrypoint identity；
- producer/toolchain、platform/runtime compatibility 和 release provenance；
- trusted release key/signature 或等价的已接受 release authority receipt。

Runtime admission 的顺序必须固定为：

```text
resolve exact release
  -> verify source/bundle/manifest/schema digest
  -> verify signature, contract major, capability and runtime compatibility
  -> resolve unique symbolic executor/entrypoint
  -> verify idempotency/nonce/current claim/policy
  -> atomically commit admission
  -> then install, materialize or use local resources
```

Admission 规则：

- 同一 admission key + 同一 digest 必须 replay 原 acceptance，不能重复 install、materialize 或 execute。
- 同一 key + 不同 digest 必须在修改 Journal、nonce、workspace、process 或 Browser 前返回稳定 conflict。
- unknown field、unsupported major/profile/capability/entrypoint、floating ref、workspace identity、签名/依赖/manifest mismatch 必须 fail closed。
- Runtime 负责 fetch/cache/verify/admit；Testing Packages 不在运行时 hydrate branch、安装 dependency、动态 import 或加载 plugin。
- manifest 可以声明已知 semantic entrypoint（例如 `testing-runner.run`）作为 identity；禁止声明任意 executable path、shell、script、plugin 或 caller-selected process。
- release authority、Runtime admission authority、Talos current-claim authority 是不同边界；任何一个不可验证时都不得产生本地 effect。

因此，当前状态应写成“manifest contract/validator 已有，release bundle、可信发布、安装和 admission 仍缺失”，不能把 manifest validator 当成 package 已可发布的证据。

## 7. P0：AI testing session input contract

新增 `testing-runner-invocation.v1`，作为 Local QA Runtime 把结构化 TestCase 交给 AI 测试执行引擎的唯一 production envelope。`ai-testing-session-input.v1` 只能作为早期 draft/显式 decode-only compatibility alias，不能继续接收新的 production effect：

```text
session_input_id
qa_run_ref
opaque_attempt_ref
structured_case_set_ref/digest
source_ref/digest
environment_profile_ref/digest
bundle_manifest_ref/digest
engine_id/version
executor_id/version/capability_digest
model_provider/model_id/model_revision
prompt_bundle_ref/digest
tool_catalog_ref/digest
harness_ref/version/digest
evaluator/reducer_ref/version/digest
approval_policy_ref/digest
inference_egress_policy_ref/digest
budgets
deadline
producer/version
request_digest
```

这些字段用于 provenance、admission、replay 和结果审计，不允许携带 provider secret、token、cookie、raw prompt payload、host path 或脚本内容。

不得包含：

- Talos lease/worker token 或 NyxID bearer。
- caller-selected pool/machine。
- 未验证宿主绝对路径。
- 任意 port/process handle/CDP endpoint。
- raw Secret、cookie、browser storage 或 env dump。
- 任意 shell、argv、script、generated code、interpreter eval、dynamic plugin/import、runtime package install 或未声明 entrypoint。

本 Repo 定义 provider-neutral `ModelInferencePort` 和 `TestCaseExecutionEngine / TestingAgentLoop` 语义；Runtime 实现独立的 local tool broker、ModelInference adapter 和 capability ports。TestingAgentLoop 在每个 typed tool call 前验证 tool catalog、approval scope、cancel/deadline/fence、budget 和 case binding，但不保存或解释 Talos lease/generation。

### 7.1 Resolver、Entrypoint 与 Executor seam

`testing-runner-invocation.v1` 只携带 opaque ref/digest 时，不能把 ref 字符串本身当作已验证的 authority。当前 `#677` 已暴露这一缺口：invocation 没有规定谁解析 package、capability、plan 和 entrypoint，也没有一个已经存在的 provider-neutral executor seam。

MVP 必须明确三类 resolver 和调用顺序：

1. **Package/release resolver（Local QA Runtime owner）**：根据 exact package ID/version/content digest、manifest digest、签名/可信 release key、contract major、semantic capability 和 runtime compatibility 解析已经发布或已安装的 bundle。Testing Packages 不 fetch、install、hydrate floating branch 或动态加载 package。
2. **Current-claim resolver（Talos/Runtime boundary owner）**：解析并验证 signed lease claim 的 currentness、attempt、generation、fence 和 deadline。resolver 不可用、claim 已 superseded 或 digest 不一致时，在 Journal admission 和任何 effect 前 fail closed；Testing Packages 只消费抽象 freshness/cancel capability，不保存 raw Talos token。
3. **Executor/entrypoint resolver（Runtime admission + package manifest）**：根据 execution profile、package manifest 和 capability policy 解析唯一的 symbolic executor identity。caller 不得提交任意 host path、argv、动态 import、plugin 或 executable entrypoint。

必须严格区分以下接口：

```text
Talos worker TestingExecutor
  -> LocalQARuntimeAdapter
  -> Local Runtime TestingPackageInvocationAdapter
  -> versioned invocation envelope
  -> Testing Packages TestingPackageExecutor
```

其中：

- `TestingExecutor` 负责 Talos task/attempt/heartbeat/cancel 投影，不解释 TestCase 或 Assertion。
- `LocalQARuntimeAdapter` 负责 Talos worker 与本地 Runtime 的 transport mapping，不复制 Testing Packages 的 canonical writer。
- `TestingPackageInvocationAdapter` 负责 Runtime admission、trusted resolver 和 capability-port 组装，不拥有测试语义。
- `TestingPackageExecutor` 负责 TestCase/StructuredPlan 解释、typed action progression、Assertion evaluation 和 canonical testing facts。

如果 package manifest 保留 `entrypoints`，它们只能是 digest-bound、allowlisted 的逻辑入口声明；不能变成 caller 可选的任意可执行文件清单。invocation 不应携带自由 `entrypoint` 字段，而应绑定 Runtime 已解析的 `executor_id/version/capability_digest`。

退出标准：同一个 canonical invocation 经过 fake Runtime、MVP Runtime 和后续 Runtime adapter 时，产生相同的 Case/Assertion 语义；不同 adapter 只能改变 producer/capability metadata，不能改变 contract 含义。

## 8. P0：Provider-neutral capability ports

Runtime 应提供受限 capability ports，例如：

```text
get_model_capabilities
infer(request, bounded_context)
return bounded ModelResponse / model receipt
perform typed Browser/API/CLI tool effect
return sanitized ModelObservation / effect receipt
check cancel/deadline/fence/budget
persist canonical artifact bytes/refs through the owner-approved writer
record terminal refs
```

有效能力必须按交集计算：

```text
TestCase requested
∩ data-bundle/tool catalog
∩ Runtime advertised ports
∩ Executor capability digest
∩ execution policy
∩ human approval scope
```

边界：

- Testing Packages 定义 TestCase、AI loop、tool semantics、evaluator 和 CaseResult 语义。
- Runtime 提供具体 ModelInference adapter、provider egress/privacy policy、本机 effect broker、资源 ownership 和 Cleanup。
- Talos 只负责 dispatch、attempt、lease/fence 和 bounded projection。
- effect receipt 证明动作发生，不自动表示 assertion passed。
- stale fence、cancel、deadline、budget 或 tool catalog mismatch 必须在 point of use 被拒绝。
- adapter/provider 变化不能改变 Case/Assertion 语义。

## 9. P0：AI Engine、Evaluator、Ledger 和 Result Authority

### 9.1 `TestCaseExecutionEngine / TestingAgentLoop`

Target 语义入口直接接收 immutable structured TestCase：

```text
load TestCase
-> build bounded model context
-> request ModelInferencePort
-> validate closed typed tool call
-> request human approval when policy requires
-> Runtime tool broker executes effect
-> receive sanitized ModelObservation + effect receipt
-> append AgentTurnLedger
-> continue or terminate
```

不生成中间脚本、代码、动态 import、plugin 或任意 command。tool catalog 不允许运行中动态注册。

### 9.2 Model identity and inference policy

每次 session/Case 必须绑定：

```text
model_provider/model_id/model_revision
prompt_bundle_ref/digest
system_policy_ref/digest
tool_catalog_ref/digest
harness/engine_id/version
evaluator/reducer_ref/version
inference_egress_policy_ref/digest
```

provider SDK、provider secret、raw prompt 和 raw observation 不进入跨仓业务合同、Evidence 或日志。Runtime 负责具体 provider egress、credential isolation、privacy/region policy 和 adapter identity；Testing Packages 只依赖 provider-neutral `ModelInferencePort`。

### 9.3 Evaluator and result authority

Assertion 必须声明 `evaluator_kind`：

- `deterministic`：由版本化 predicate 对 Observation/effect receipt 计算。
- `model_judged`：AI 只能返回 strict structured verdict、reason code、confidence 和 Evidence refs。

`AssertionReducer` 负责固定优先级归并，确定性失败、inconclusive、infrastructure error 和 approval denial 不能被模型静默覆盖。Testing Packages 生成 `ResultAuthorityReceipt`，至少绑定 Run/Attempt/TestCase/Plan/bundle/engine/model/prompt/tool/harness identity、AgentTurnLedger terminal digest、CaseResultSet 和 EvidenceManifest。

### 9.4 AgentTurnLedger, replay and budgets

`AgentTurnLedger` 至少记录：

```text
turn sequence
request/context digest
model response digest
model/tool identity
tool intent + canonical args digest
tool/effect receipt
sanitized ModelObservation digest
evaluator/reducer transition
budget before/after
terminal authority receipt
```

ledger append-only、sequence 单调。已提交 turn replay 读取原 receipt，不重复 inference 或 effect；effect 后 assertion 前的未知状态为 `lost/inconclusive`，禁止自动 rerun。model turns、token/input-output、tool calls、effects、Observation/Evidence bytes 和 wall time budgets 必须持久化且单调消耗，restart/replay/repair 不能重置预算。

## 10. P0：资源 Ownership 收缩

当前 Environment Factory/Generic Host 的 exact checkout、process supervision、readiness、cleanup 和 restart patterns 可以作为参考，但生产 ownership 应迁到 Local QA Runtime。

| 资源 / 事实 | Target owner |
| --- | --- |
| source cache/workspace | Local QA Runtime |
| app process/process group | Local QA Runtime |
| listener/port/readiness | Local QA Runtime |
| Chromium/profile/downloads | Local QA Runtime |
| raw quarantine/sanitized staging | Local QA Runtime |
| structured TestCase/Step/Assertion/tool semantics | Testing Packages |
| AI bounded interpretation / TestingAgentLoop | Testing Packages semantic engine；Runtime 仅提供 inference/effect ports |
| model/provider credential、egress、local resource | Local QA Runtime adapter/policy |
| Artifact long-term storage | decision-accepted Artifact domain |

迁移期间不得让 Testing Packages 和 Runtime 同时拥有同一个 process、port 或 cleanup attempt。

## 11. P1：PQL 和 Talos/Hosted 投影

### 11.1 PQL input adapter

通过 adapter 消费：

- `ProjectPackSnapshot` ref/digest。
- selected approved TestCaseAsset identity/version/digest。
- Requirement refs。
- review/promotion refs。
- exact source revision。

adapter 只投影到现有 approved-input seam，不把 PQL promotion 业务逻辑写入 analyzer 核心。

### 11.2 Runtime/Talos output projection

Testing Packages 输出 pointer-only canonical refs：

- StructuredPlan ref/digest。
- CaseResultSet ref/digest。
- EvidenceManifest ref/digest。
- bounded producer/package metadata。

它不实现 Talos submit/claim/heartbeat/result API，也不保存 task attempt/lease/fence。

### 11.3 Publication 降为 adapter

GitHub/filesystem publication 应：

- 只消费 canonical result/evidence projection。
- 返回统一 PublicationReceipt。
- 与 Artifact/Hosted delivery 独立 repair。
- 不拥有 Final Quality。
- publication 失败不触发 test rerun。

## 12. P1：恢复和不确定性

必须冻结：

- effect 前 crash：按明确 policy 决定是否可 retry。
- effect 后、assertion 前 crash：`lost/inconclusive`，不得自动重跑。
- assertion 已冻结、artifact 未写：repair artifact，不重跑 effect。
- result frozen、delivery/publication 未 ack：repair delivery，不重跑 test。
- completed replay：零重复 effect、零 canonical rewrite、零 duplicate publication。

`browser.after_action_before_assertion` 不得映射为普通 assertion failure。

## 13. P2：后续增强

在 TestCase/AI engine contract、tool catalog、ModelInferencePort 和 Runtime integration 完成后再考虑：

- live provider canary 和多模型策略。
- 多 Browser TestCase。
- richer Evidence media。
- API/CLI/Mobile tool adapter。
- 普通 UI exploration 和 mutation executor。

所有增强必须直接消费结构化 TestCase，复用同一 canonical result/evidence family，不引入脚本生成路径。

## 14. 建议实施顺序

### T1：TestCase、Plan authority 和 release identity

1. 冻结 structured TestCase/Step/Assertion/Evidence/Cleanup schemas，并规定 TestCase 是语义 authority。
2. 冻结 StructuredPlan 的确定性派生关系、case/asset/source/plan digest binding 和 mismatch fail-closed 规则。
3. 发布 data-only bundle manifest、locked dependency identity、machine-readable schemas 和 engine/tool catalog identity。
4. 定义 release authority、signed exact bundle、manifest/content/schema digest、compatibility matrix、symbolic entrypoint 和 Runtime admission 顺序。
5. 冻结 `testing-runner-invocation.v1` 为唯一 production invocation envelope；`ai-testing-session-input.v1` 只允许 decode-only compatibility，并定义 trusted package/current-claim/executor resolvers。
6. 发布 `ModelInferencePort`、strict tool schemas、effective capability intersection 和 durable budget contract。
7. 定义 AgentTurnLedger、ResultAuthorityReceipt、AssertionReducer 和 CaseResult/Evidence binding。

### T2：AI execution and Browser infrastructure gates

1. TestingAgentLoop 直接读取 TestCase，使用 deterministic/fake inference 运行多轮 tool loop。
2. pre-model ModelObservation sanitization、inference egress policy 和 strict tool schema。
3. Browser fixed smoke 作为 infrastructure gate；Browser production route 原生写 canonical pair 并完成 hardening。
4. Runtime adapter、AI engine 和 Browser writer 共用公共 validator/digest fixtures。
5. 未知工具、malformed args、prompt injection、refusal/truncation、budget exhaustion 和 no-script negative tests。
6. canonical CaseResult/Evidence/ResultAuthorityReceipt 原子写入；publication 只消费公共 canonical validator。
7. 消费 `#666` 已交付的 CLI/HTTP canonical-first 基础，并完成 `#631` 剩余 publication、compatibility、equivalence 和跨 route conformance；该项不阻塞 Browser-only canary，但仍是 upstream owning repo 的 open residual。
8. legacy output 只由单一 compatibility adapter 派生。

### T3：Runtime integration

1. Runtime generic tool broker、ModelInference adapter port 和 fake Executor。
2. Trusted package/current-claim/executor resolvers，以及唯一 symbolic entrypoint mapping。
3. Local QA Runtime invocation/session adapter fixture。
4. cancel/deadline/fence point-of-use tests。
5. AgentTurnLedger replay、no-rerun、monotonic budget 和 cleanup/recovery fixtures。
6. 资源 ownership 从 Generic Host/Environment Factory production path 迁出。

### T4：Cross-repo conformance

1. PQL approved input fixture。
2. Talos testing request/task/result fixture。
3. Runtime happy/failure/cancel/crash fixture。
4. package/version mismatch 和 unsupported major negative tests。

## 15. 完成标准

本 Repo 对 Talos Testing MVP 的职责完成时应满足：

- production path 直接读取 immutable structured TestCase，不生成、保存或执行测试脚本/代码/plugin。
- TestCaseExecutionEngine/TestingAgentLoop 只调用 closed strict typed tools，并消费 bounded sanitized ModelObservation。
- Browser MVP production route 原生写唯一 CaseResultSet/EvidenceManifest pair；共享 schema/validator/digest profile 不依赖 route。
- ModelInferencePort 是 provider-neutral contract；provider secret、SDK object 和 raw observation 不进入业务 wire/Evidence/log。
- model/provider/prompt/tool catalog/harness/evaluator identity 以 immutable refs/digests 绑定 session、AgentTurnLedger 和 ResultAuthorityReceipt。
- deterministic/model-judged assertions 由 deterministic AssertionReducer 生成最终 AssertionResult/CaseResult；模型文本不能直接建立 passed。
- CaseResultSet、EvidenceManifest 和 ResultAuthorityReceipt 形成同 Run/Attempt/Plan/bundle 的闭合 digest binding。
- AgentTurnLedger replay 不重复 inference 或 effect；budget 在 restart/replay/repair 中单调消耗。
- Runtime 只通过版本化 `testing-runner-invocation.v1` 与 capability ports 支持执行，不解释测试语义；早期 `ai-testing-session-input.v1` 不能作为新的 production effect envelope。
- Testing Packages 不拥有 machine、lease、workspace、process、port、Chrome、provider credential 或 cleanup。
- CLI/HTTP 的 compatibility/publication/conformance 收口不得改变已冻结的 Browser Case/Assertion 语义；完整 convergence 后所有 route 输出等价 canonical facts。
- PQL asset lineage 能保留到 CaseResult。
- stale/cancel/deadline/tool mismatch/approval denial 在 point of use fail closed。
- interrupted side effect 为 `lost/inconclusive`，不自动重跑或开启替代 model turn。
- publication/Artifact delivery repair 不重复执行测试。
- TestCase 与 StructuredPlan 的 identity、lineage、source、asset 和 plan digest mismatch 会在 effect 前 fail closed。
- package manifest、package bytes、schema、symbolic entrypoint、capability 和 dependency digest 全部经过 Runtime admission 验证；manifest validator 单独存在不算 release/admission 完成。
- 一个 invocation 只能解析到唯一 semantic executor/entrypoint；缺少 trusted resolver、mapping 不唯一或 resolver 不可用时零 effect。
- fake executor、MVP Runtime adapter 和后续 Runtime adapter 使用同一 provider-neutral seam，并产生等价 Case/Assertion 语义。
- resolver/admission receipt 可被 ResultAuthorityReceipt、AgentTurnLedger 和 replay ledger 追溯；same-key/same-digest replay 不重复 install、inference、effect 或 canonical write。
- CLI/HTTP canonical-first 基础来自 `#666`，只有 publication、compatibility、equivalence、consumer inventory 和跨 route conformance 完成后，才算完整 convergence。
- Baseline、Candidate、Live status 和 Target 不再互相冒充。
