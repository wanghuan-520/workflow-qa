# fkst-packages-testing 详细缺口清单

> Repo：[ChronoAIProject/fkst-packages-testing](https://github.com/ChronoAIProject/fkst-packages-testing)
>
> 审计日期：2026-08-20
>
> Pinned Baseline：[`dev@ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1`](https://github.com/ChronoAIProject/fkst-packages-testing/commit/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1)
>
> Live status overlay（2026-08-21）：`dev@3d228f79db8786e3755aed3d53ff70e14ca90993`；`#656` closed/not planned。以下 `ac953ff0` 和 #656 内容只作为 pinned historical/Candidate evidence，不描述为当前默认分支已交付能力。
>
> Target：[PQL Testing 简化时序图](../design-proposals/diagrams/pql-testing-simple-flow.mmd) 与 [Testing Packages 调整方案](../design-proposals/repo-adjustments/fkst-packages-testing-adjustments.zh-CN.md)

## 0. 2026-08-20 Talos Tool 方向增量审计

### 0.1 结论

`fkst-packages-testing` 的 Target 是 **AI 驱动的测试用例执行引擎**，不是脚本生成器、NyxID/Talos HTTP 服务、机器调度器或本地资源管理器。它直接读取 immutable structured TestCase，维护 TestingAgentLoop，调用严格的 typed tools，接收 bounded ModelObservation，并由 deterministic AssertionReducer 形成 CaseResult。

仓库发布的 data-only bundle/manifest 只是用例、schema、tool catalog 和语义引擎身份的版本化制品，不携带用户脚本、生成代码、动态 plugin 或运行时 entrypoint。

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

- Pinned Baseline 为 `dev@ac953ff0`；live `dev@3d228f79...` 已前进，必须单独重新审计。Pinned Baseline 仓库有 14 个 `packages/*`、13 份 Markdown contract、371 个 Lua 和 42 个 JavaScript 文件，不能按脚手架描述。
- `testing-runner` 被声明为 `stateless_adapter`，可复用 `StructuredPlan`、single-use grant、argv/HTTP capability containment、replay guard、agentic-browser typed-action loop、CaseResultSet/EvidenceManifest validator。
- 当前 tree 没有 JSON Schema 文件，外部 Talos/Runtime 不能依赖 Lua validator 细节完成 admission；需要发布 machine-readable schema 或等价生成物。
- 仓库没有 tag/release/根级安装制品定义；`fkst.workspace.toml` 还固定依赖 `fkst-packages@d4146d7...`，`.fkst/substrate-ref` 固定 `fkst-substrate@e3355b4...`。这些构建期依赖必须进入 package manifest/SBOM，不能由 worker 运行时 hydrate floating branch。
- HEAD 有成功的 host/package/generic-host/AI pipeline CI，但没有当前 SHA 对应的 live-CDP 成功 gate；因此 Browser 语义代码存在，不等于 Talos 真实机器 Browser E2E 已验证。
- `fkst_native.lua` 仍把普通 UI exploration 返回 `browser-exploration-deferred`，`module_cdp_execution.lua` 明确阻止 mutation action；这些应写成 P2/非 MVP，而不是暗示通用 computer-use 已完成。

### 0.3 对 Talos 接入的直接缺口

**P0：** structured TestCase/Step/Assertion schema、data-only bundle manifest、`ai-testing-session-input.v1`、TestingAgentLoop、ModelInferencePort、closed typed tool catalog、AgentTurnLedger、AssertionReducer、ResultAuthorityReceipt，以及共享 canonical contract/validator、Browser production writer 和 runner-side conformance fixture。

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

- Baseline 已存在 canonical results/evidence contract 基础和 Browser route 输出。
- CLI/HTTP production path 仍主要使用 legacy `testing-structured-case-results.v1`。
- publication 和部分 consumer 仍维护私有 shape/validator。
- 本地 Issue #656 增量只能作为 `Candidate`，尚未成为默认分支 production run path。
- package release identity、provider-neutral runner invocation、PQL/Talos/Runtime 接线和资源 ownership 收缩仍然缺失。

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

- [`contracts/testing-design.v1.md`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/contracts/testing-design.v1.md)
- [`testing_design.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/libraries/contract/testing_design.lua)
- [`module_planning.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/testing-runner/module_planning.lua)

### 3.2 StructuredPlan

已实现 `testing-structured-plan.v2`。Baseline 的 StructuredPlan 是声明式执行计划，不是用户需要编写或维护的测试脚本；Target 将由 TestCaseExecutionEngine 直接消费结构化 TestCase，并把 StructuredPlan 作为内部可重建的 plan identity：

- 绑定 module plan、case catalog、Environment receipt 和 Browser readiness。
- 只选择经过 review 且经 Host catalog 授权的 Case。
- 通过 ref/digest 加载 immutable inputs。
- 区分 `structured-api-cli` 与 `agentic-browser`。
- 生成 immutable plan ref/digest 和 residual risk。

证据：

- [`contracts/structured-execution.v2.md`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/contracts/structured-execution.v2.md)
- [`structured_planning.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/testing-runner/structured_planning.lua)

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

- [`structured_execution.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/testing-runner/structured_execution.lua)
- [`testing_runtime/structured_execution.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/libraries/testing_runtime/structured_execution.lua)

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

- [`contracts/agentic-browser-execution.v1.md`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/contracts/agentic-browser-execution.v1.md)
- [`ai_browser_control.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/testing-runner/ai_browser_control.lua)
- [`testing_results.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/libraries/contract/testing_results.lua)
- [`testing_evidence_manifest.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/libraries/contract/testing_evidence_manifest.lua)

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

- [`workflow-qa/core.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/workflow-qa/core.lua)
- [`environment-factory/core.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/environment-factory/core.lua)
- [`environment-factory/runtime.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/environment-factory/runtime.lua)
- [`qa_publication.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/test-publication/qa_publication.lua)

这些模块的 README 成熟度仍包含 `experimental`、`migrating` 和 `skeleton`。组件/参考 E2E 存在，不应被描述成生产 Talos/Runtime 链路已经交付。

## 4. Baseline / Candidate / Target 状态矩阵

| 能力 | Baseline | Candidate | Target 剩余缺口 |
| --- | --- | --- | --- |
| canonical results contracts | 已存在 | #656 有 helper/compat hardening | 冻结唯一 writer/reader 和跨 route conformance |
| EvidenceManifest | contract 与 Browser writer 已存在 | #656 有 canonical pair helper | CLI/HTTP/Publication 统一消费与完整绑定 |
| CLI/HTTP execution | 主链成熟、仍有 legacy output | canonical helper 候选 | production path 原生写 canonical pair |
| Browser execution | typed action、bounded observation、canonical output 基础 | hardening 候选 | fence/cancel/lost 语义与 Runtime invocation 对齐 |
| publication | CAS/replay/GitHub/filesystem adapter | compatibility 思路 | 降为 adapter，不拥有私有 result schema 或 Final Quality |
| TestCaseExecutionEngine / TestingAgentLoop | Baseline partial，已有 agentic Browser 片段 | 未闭环 | 直接读取 TestCase，多轮 ModelInference/tool loop、终止和结果归并 |
| ModelInferencePort | 无 Target contract | 无 | provider-neutral inference request/response、refusal/timeout/truncation/usage |
| tool catalog/schema | typed action 和 capability 基础 | 无 immutable catalog | closed union、strict schema、allowlist、quota、point-of-use policy |
| AgentTurnLedger | replay/step receipt 片段 | 无 | append-only model/tool/observation/evaluator ledger |
| evaluator/reducer | 部分 assertion/result writer | 无统一 AI-aware reducer | deterministic/model-judged evaluator + deterministic AssertionReducer |
| package/data-bundle identity | `fkst.toml` 等仓库级 metadata | 无已发布 manifest | data-only manifest：TestCase/schema/tool identity，不含脚本/entrypoint |
| Runtime/AI session invocation | event/runner 与 generic-host composition 基础 | 无稳定 production envelope | `ai-testing-session-input.v1` + model/tool/harness identity + budgets |
| PQL input | generic approved pointers | adjustment draft | `pql.testing-design-input-set.v1` adapter |
| Talos integration | 无 | 无 | 由 Talos/Runtime adapter 实现；本 Repo 不提供 Talos transport |
| local resources | Environment Factory/Generic Host 当前直接拥有 | 迁移设计 | ownership 移交 Local QA Runtime |
| no-script execution | 仅有部分禁止项 | 无 Target gate | TestCase 直接解释；禁止生成/运行脚本和动态代码 |

Issue #656 已于 2026-08-18 closed/not planned。其历史 helper/compat/hardening 只能作为 Candidate 设计证据；不得描述为 active delivery track，也不得据此升级当前 `dev@3d228f79...` 的 Baseline 能力。

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

### 5.3 P1（本跨仓 Browser MVP）：CLI/HTTP writer 和跨 route 等价

首个 Talos MVP 是 Browser-only。只要共享 schema、validator、digest profile 和 Browser writer 已冻结，现有 CLI/HTTP legacy writer 的全量迁移不得阻塞 Browser canary；但它们最终必须迁入同一 canonical family，不能永久形成 route-specific 语义。

这里的 `P1` 只表示 **workflow-qa 当前 Browser-only 跨仓垂直链路的阶段优先级**，不是要求修改 `fkst-packages-testing` owning repo 的产品 backlog。两者必须分别解释：

- Browser canary 的 P0 Gate 是共享 canonical contract/validator/digest profile、Browser production writer 和 Runtime-facing invocation；不要求先完成所有 CLI/HTTP producer 迁移。
- `fkst-packages-testing` 可以继续把完整 route convergence、schema、provider-neutral executor 和 runtime contract 作为自身 P0，因为这些工作还服务于该 Repo 的发布完整性和后续 backend。
- upstream P0 Issue 完成或关闭，不会自动证明 Browser canary Gate 已通过；反过来，Browser canary 不被全量迁移阻塞，也不表示 upstream P0 被降级或取消。

截至 2026-08-20 的 backlog 对照：

- [`#660`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/660) 已关闭，并由 `#666` 完成 canonical CLI/HTTP ResultSet/EvidenceManifest 与 separate digest domains。
- [`#631`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/631)、[`#662`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/662)、[`#663`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/663) 和 [`#664`](https://github.com/ChronoAIProject/fkst-packages-testing/issues/664) 仍按 owning repo 的 P0 语义跟踪 route migration、runtime invocation、machine-readable schema 和 provider-neutral executor。
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

新增 `testing-package-manifest.v1`，它是 **data-only 测试执行引擎/测试用例 bundle manifest**，不是脚本或可执行 entrypoint 清单，至少包含：

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

## 7. P0：AI testing session input contract

新增 `ai-testing-session-input.v1`（旧 `testing-runner-invocation.v1` 可作为兼容名称），作为 Local QA Runtime 把结构化 TestCase 交给 AI 测试执行引擎的唯一 production envelope：

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

## 8. P0：Provider-neutral capability ports

Runtime 应提供受限 capability ports，例如：

```text
get_model_capabilities
infer(request, bounded_context)
return bounded ModelResponse / model receipt
perform typed Browser/API/CLI tool effect
return sanitized ModelObservation / effect receipt
check cancel/deadline/fence/budget
write canonical result/evidence refs
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

### T1：TestCase、AI engine 和 identity contracts

1. 冻结 structured TestCase/Step/Assertion/Evidence/Cleanup schemas。
2. 发布 data-only bundle manifest 和 engine/tool catalog identity。
3. 发布 `ai-testing-session-input.v1`。
4. 发布 `ModelInferencePort`、strict tool schemas、effective capability intersection 和 durable budget contract。
5. 定义 AgentTurnLedger、ResultAuthorityReceipt、AssertionReducer 和 CaseResult/Evidence binding。

### T2：AI execution and Browser infrastructure gates

1. TestingAgentLoop 直接读取 TestCase，使用 deterministic/fake inference 运行多轮 tool loop。
2. pre-model ModelObservation sanitization、inference egress policy 和 strict tool schema。
3. Browser fixed smoke 作为 infrastructure gate；Browser production route 原生写 canonical pair 并完成 hardening。
4. Runtime adapter、AI engine 和 Browser writer 共用公共 validator/digest fixtures。
5. 未知工具、malformed args、prompt injection、refusal/truncation、budget exhaustion 和 no-script negative tests。
6. canonical CaseResult/Evidence/ResultAuthorityReceipt 原子写入；publication 只消费公共 canonical validator。
7. CLI/HTTP writer 迁移为 canonical-first；该项在跨仓 Browser MVP 中不阻塞 canary，也不修改 upstream owning repo 的 P0/backlog 优先级。
8. legacy output 只由单一 compatibility adapter 派生。

### T3：Runtime integration

1. Runtime generic tool broker、ModelInference adapter port 和 fake Executor。
2. Local QA Runtime invocation/session adapter fixture。
3. cancel/deadline/fence point-of-use tests。
4. AgentTurnLedger replay、no-rerun、monotonic budget 和 cleanup/recovery fixtures。
5. 资源 ownership 从 Generic Host/Environment Factory production path 迁出。

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
- Runtime 只通过版本化 session input 与 capability ports 支持执行，不解释测试语义。
- Testing Packages 不拥有 machine、lease、workspace、process、port、Chrome、provider credential 或 cleanup。
- CLI/HTTP writer 的后续迁移不得改变已冻结的 Browser Case/Assertion 语义；完整 convergence 后所有 route 输出等价 canonical facts。
- PQL asset lineage 能保留到 CaseResult。
- stale/cancel/deadline/tool mismatch/approval denial 在 point of use fail closed。
- interrupted side effect 为 `lost/inconclusive`，不自动重跑或开启替代 model turn。
- publication/Artifact delivery repair 不重复执行测试。
- Baseline、Candidate、Live status 和 Target 不再互相冒充。
