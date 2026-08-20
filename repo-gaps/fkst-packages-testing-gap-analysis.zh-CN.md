# fkst-packages-testing 详细缺口清单

> Repo：[ChronoAIProject/fkst-packages-testing](https://github.com/ChronoAIProject/fkst-packages-testing)
>
> 审计日期：2026-08-20
>
> Baseline：[`dev@ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1`](https://github.com/ChronoAIProject/fkst-packages-testing/commit/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1)
>
> Target：[PQL Testing 简化时序图](../design-proposals/diagrams/pql-testing-simple-flow.mmd) 与 [Testing Packages 调整方案](../design-proposals/repo-adjustments/fkst-packages-testing-adjustments.zh-CN.md)

## 0. 2026-08-20 Talos Tool 方向增量审计

### 0.1 结论

`fkst-packages-testing` 适合作为 Talos Testing Tool 的 **测试语义和 runner package**，不应成为 NyxID/Talos HTTP 服务，也不应接管机器、worker、Sandbox、Chrome 或 Artifact 长期存储。它已经具备足够的语义内核，但尚未具备可由 Talos 安装、校验和调用的发布合同。

```text
PQL approved input
  -> Testing Packages StructuredPlan / typed action / assertion
  -> Local QA Runtime capability ports
  -> CaseResultSet + EvidenceManifest
  -> Talos bounded terminal projection
```

### 0.2 本轮核实的新增事实

- 当前 `dev@ac953ff0` 仍为有效 Baseline；仓库有 14 个 `packages/*`、13 份 Markdown contract、371 个 Lua 和 42 个 JavaScript 文件，不能按脚手架描述。
- `testing-runner` 被声明为 `stateless_adapter`，可复用 `StructuredPlan`、single-use grant、argv/HTTP capability containment、replay guard、agentic-browser typed-action loop、CaseResultSet/EvidenceManifest validator。
- 当前 tree 没有 JSON Schema 文件，外部 Talos/Runtime 不能依赖 Lua validator 细节完成 admission；需要发布 machine-readable schema 或等价生成物。
- 仓库没有 tag/release/根级安装制品定义；`fkst.workspace.toml` 还固定依赖 `fkst-packages@d4146d7...`，`.fkst/substrate-ref` 固定 `fkst-substrate@e3355b4...`。这些构建期依赖必须进入 package manifest/SBOM，不能由 worker 运行时 hydrate floating branch。
- HEAD 有成功的 host/package/generic-host/AI pipeline CI，但没有当前 SHA 对应的 live-CDP 成功 gate；因此 Browser 语义代码存在，不等于 Talos 真实机器 Browser E2E 已验证。
- `fkst_native.lua` 仍把普通 UI exploration 返回 `browser-exploration-deferred`，`module_cdp_execution.lua` 明确阻止 mutation action；这些应写成 P2/非 MVP，而不是暗示通用 computer-use 已完成。

### 0.3 对 Talos 接入的直接缺口

**P0：** `testing-package-manifest.v1`、`testing-runner-invocation.v1`、provider-neutral capability ports、共享 canonical contract/validator、Browser production writer，以及供 Talos fixed `TestingExecutor`/Runtime adapter 消费的 runner-side conformance fixture。

**P1：** 现有 CLI/HTTP writer 迁移到同一 canonical family、跨 route conformance、point-of-use cancel/deadline/fence、effect 后 assertion 前的 `lost/inconclusive`、Artifact pointer/ref/digest/receipt conformance、publication 与 delivery repair 分离。Artifact grant 和 bytes 仍由 Hosted/Runtime 拥有。

**P2：** live-CDP gate、多 Browser Case、API/CLI Talos profile、普通 UI exploration 和 mutation executor。它们不能阻塞 Browser-only MVP，也不得通过 `browse` fallback 实现。

## 1. 执行摘要

Testing Packages Baseline 已有较完整的测试设计、StructuredPlan、CLI/HTTP execution、agentic Browser typed action、assertion/case result、environment factory、artifact/publication 和 durable replay/recovery 基础。

旧版 Gap 文档把统一 Observation、AssertionResult、CaseResult 和 EvidenceManifest 描述为整体缺失，已经不准确。更准确的判断是：

- Baseline 已存在 canonical results/evidence contract 基础和 Browser route 输出。
- CLI/HTTP production path 仍主要使用 legacy `testing-structured-case-results.v1`。
- publication 和部分 consumer 仍维护私有 shape/validator。
- 本地 Issue #656 增量只能作为 `Candidate`，尚未成为默认分支 production run path。
- package release identity、provider-neutral runner invocation、PQL/Talos/Runtime 接线和资源 ownership 收缩仍然缺失。

因此本 Repo 的核心任务不是重写测试系统，也不是成为 NyxID/Talos 网络服务，而是把已有能力收敛为可发布、可版本化、可由 Local QA Runtime 调用的唯一测试语义实现。

## 2. Target 职责与非职责

本 Repo 应负责：

- testing-design 输入验证、repository/requirement/traceability 分析。
- reviewed module plan 和 immutable `StructuredPlan` 编译。
- CLI/HTTP/Browser 测试语义。
- typed action 和 bounded Observation。
- `AssertionResult`、`CaseResult`、`CaseResultSet`。
- `EvidenceManifest` schema 和 result/evidence 引用关系。
- execution replay、point-of-use policy enforcement 和 conformance fixtures。
- PQL input adapter、Runtime runner interface 和 pointer-only Hosted projection adapter。

本 Repo 不应负责：

- 创建 Talos `QARun` 或管理 Tool API。
- 选择 pool/machine 或保存 task lease、generation、fence。
- 启动/删除 workspace、process、listener、port、Chrome/profile/downloads。
- 直接拥有 raw Evidence quarantine、Artifact upload grant 或长期存储。
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

已实现 `testing-structured-plan.v2`：

- 绑定 module plan、case catalog、Environment receipt 和 Browser readiness。
- 只选择经过 review 且经 Host catalog 授权的 Case。
- 通过 ref/digest 加载 immutable inputs。
- 区分 `structured-api-cli` 与 `agentic-browser`。
- 生成 immutable plan ref/digest 和 residual risk。

证据：

- [`contracts/structured-execution.v2.md`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/contracts/structured-execution.v2.md)
- [`structured_planning.lua`](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/testing-runner/structured_planning.lua)

### 3.3 CLI/HTTP execution

Baseline 已实现：

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

Baseline 已实现：

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
| package identity | `fkst.toml` 等仓库级 metadata | 无已发布 manifest | `testing-package-manifest.v1` |
| Runtime invocation | event/runner 与 generic-host composition 基础 | 无稳定 production envelope | `testing-runner-invocation.v1` + capability ports |
| PQL input | generic approved pointers | adjustment draft | `pql.testing-design-input-set.v1` adapter |
| Talos integration | 无 | 无 | 由 Talos/Runtime adapter 实现；本 Repo 只提供 runner ABI |
| local resources | Environment Factory/Generic Host 当前直接拥有 | 迁移设计 | ownership 移交 Local QA Runtime |

Issue #656 的本地工作区增量没有远端 feature ref，未接 production run path，也未通过完整 Gate，必须保持 `Candidate` 标记。

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

### 5.2 Browser MVP 生产写入顺序

```text
execute cases
-> create CaseResultSet
-> create EvidenceManifest
-> validate canonical pair
-> atomically write canonical artifacts
-> derive legacy compatibility projection
-> publication consumes canonical output
```

规则：

- canonical helper 必须由 production run path 调用。
- canonical write 成功后才允许生成 compatibility artifact。
- replay 不重复 target effect，也不改写已冻结 canonical artifact。
- malformed canonical output 不得 fallback 到 legacy passed。
- publication 不重新解释 raw executor result。

### 5.3 P1：CLI/HTTP writer 和跨 route 等价

首个 Talos MVP 是 Browser-only。只要共享 schema、validator、digest profile 和 Browser writer 已冻结，现有 CLI/HTTP legacy writer 的全量迁移不得阻塞 Browser canary；但它们最终必须迁入同一 canonical family，不能永久形成 route-specific 语义。

三个 route 必须使用相同语义：

- status/classification。
- observations/assertion results。
- evidence refs。
- non-execution reason。
- plan/package/source identity。
- lost/inconclusive。

允许 producer metadata 不同，不允许相同逻辑 assertion 在不同 route 改变合同含义。

## 6. P0：Package release identity

新增 `testing-package-manifest.v1`，至少包含：

```text
package_id
exact_version
source_commit
content_digest
contract_majors
entrypoints
semantic_capabilities
runtime_requirements
producer/toolchain
created_at
```

要求：

- release pipeline 对最终 package 内容计算 digest。
- manifest 自身 digest 不进入被 hash projection。
- Local QA Runtime 负责 fetch/cache/install/admission。
- package mismatch、unsupported contract major/capability/entrypoint fail closed。
- production admission 不接受 `workspace`、floating branch 或未固定 package identity。

## 7. P0：Runtime-facing invocation contract

新增 `testing-runner-invocation.v1`，作为 Local QA Runtime 调用 Testing Packages 的唯一 production envelope：

```text
invocation_id
qa_run_ref
opaque_attempt_ref
source_ref/digest
pql_input_set_ref/digest
structured_plan_ref/digest
package_manifest_ref/digest
execution_profile
requested semantic capabilities
capability_port_set_ref/digest
policy_ref/digest
budgets
deadline
producer/version
request_digest
```

不得包含：

- Talos lease/worker token 或 NyxID bearer。
- caller-selected pool/machine。
- 未验证宿主绝对路径。
- 任意 port/process handle/CDP endpoint。
- raw Secret、cookie、browser storage 或 env dump。
- arbitrary shell、任意 argv 或 package manifest 外 entrypoint。

本 Repo 定义 `TestingPackageExecutor` 逻辑接口；Runtime 实现 `TestingPackageInvocationAdapter` 和 capability ports。Testing Packages 在每个 typed effect 前调用 port 完成 authorization/cancel/deadline/fence 检查，但不保存或解释 Talos lease/generation。

## 8. P0：Provider-neutral capability ports

Runtime 应提供受限 port，例如：

```text
load immutable artifact
perform typed process/http/browser effect
return bounded Observation/effect receipt
check cancel/deadline/fence
write canonical artifact
record terminal refs
```

边界：

- Testing Packages 决定测试语义。
- Runtime 决定本机 effect 是否可执行，并拥有 workspace/process/port/Chrome/cleanup。
- effect receipt 证明动作发生，不自动表示 assertion passed。
- stale fence、cancel 或 deadline 必须在 point of use 被拒绝。
- adapter 变化不能改变 Case/Assertion 语义。

## 9. P0：资源 Ownership 收缩

当前 Environment Factory/Generic Host 的 exact checkout、process supervision、readiness、cleanup 和 restart patterns 可以作为参考，但生产 ownership 应迁到 Local QA Runtime。

| 资源 / 事实 | Target owner |
| --- | --- |
| source cache/workspace | Local QA Runtime |
| app process/process group | Local QA Runtime |
| listener/port/readiness | Local QA Runtime |
| Chromium/profile/downloads | Local QA Runtime |
| raw quarantine/sanitized staging | Local QA Runtime |
| typed plan/action/assertion/case semantics | Testing Packages |
| Artifact long-term storage | Hosted Artifact domain |

迁移期间不得让 Testing Packages 和 Runtime 同时拥有同一个 process、port 或 cleanup attempt。

## 10. P1：PQL 和 Talos/Hosted 投影

### 10.1 PQL input adapter

通过 adapter 消费：

- `ProjectPackSnapshot` ref/digest。
- selected approved TestCaseAsset identity/version/digest。
- Requirement refs。
- review/promotion refs。
- exact source revision。

adapter 只投影到现有 approved-input seam，不把 PQL promotion 业务逻辑写入 analyzer 核心。

### 10.2 Runtime/Talos output projection

Testing Packages 输出 pointer-only canonical refs：

- StructuredPlan ref/digest。
- CaseResultSet ref/digest。
- EvidenceManifest ref/digest。
- bounded producer/package metadata。

它不实现 Talos submit/claim/heartbeat/result API，也不保存 task attempt/lease/fence。

### 10.3 Publication 降为 adapter

GitHub/filesystem publication 应：

- 只消费 canonical result/evidence projection。
- 返回统一 PublicationReceipt。
- 与 Artifact/Hosted delivery 独立 repair。
- 不拥有 Final Quality。
- publication 失败不触发 test rerun。

## 11. P1：恢复和不确定性

必须冻结：

- effect 前 crash：按明确 policy 决定是否可 retry。
- effect 后、assertion 前 crash：`lost/inconclusive`，不得自动重跑。
- assertion 已冻结、artifact 未写：repair artifact，不重跑 effect。
- result frozen、delivery/publication 未 ack：repair delivery，不重跑 test。
- completed replay：零重复 effect、零 canonical rewrite、零 duplicate publication。

`browser.after_action_before_assertion` 不得映射为普通 assertion failure。

## 12. P2：后续增强

在 contract、packaging 和 Runtime integration 完成后再考虑：

- richer HTTP assertions。
- 多 Browser Case。
- richer Evidence media。
- API/CLI backend 的 Talos profile。
- 更多 package capability。

所有增强必须复用同一 canonical result/evidence family。

## 13. 建议实施顺序

### T1：Contract 和 release identity

1. 加固 canonical results/evidence contracts。
2. 冻结 canonicalization/digest profile。
3. 发布 `testing-package-manifest.v1`。
4. 发布 `testing-runner-invocation.v1`。

### T2：Production route convergence

1. Browser route 原生写 canonical pair 并完成 hardening。
2. Runtime adapter 和 Browser writer 共用公共 validator/digest fixtures。
3. CLI/HTTP writer 迁移为 canonical-first；该项是 P1，不阻塞 Browser-only canary。
4. publication 消费公共 validator。
5. legacy output 只由单一 compatibility adapter 派生。

### T3：Runtime integration

1. capability port interface 和 fake。
2. Local QA Runtime invocation adapter fixture。
3. cancel/deadline/fence point-of-use tests。
4. 资源 ownership 从 Generic Host/Environment Factory production path 迁出。

### T4：Cross-repo conformance

1. PQL approved input fixture。
2. Talos testing request/task/result fixture。
3. Runtime happy/failure/cancel/crash fixture。
4. package/version mismatch 和 unsupported major negative tests。

## 14. 完成标准

本 Repo 对 Talos Testing MVP 的职责完成时应满足：

- Browser MVP production route 原生写唯一 CaseResultSet/EvidenceManifest pair。
- 共享 schema/validator/digest profile 不依赖 route；CLI/HTTP writer 的后续迁移不得改变已冻结的 Browser Case/Assertion 语义。
- 完整 route convergence 完成后，CLI、HTTP、Browser 相同测试语义输出等价 canonical facts。
- package 有 exact version、commit、content digest、entrypoints 和 capabilities。
- Runtime 只通过版本化 invocation 与 capability ports 调用 runner。
- Testing Packages 不拥有 machine、lease、workspace、process、port、Chrome 或 cleanup。
- PQL asset lineage 能保留到 CaseResult。
- stale/cancel/deadline 在 point of use fail closed。
- interrupted side effect 不被猜测为 pass/fail，也不自动重跑。
- publication/Artifact delivery repair 不重复执行测试。
- Candidate 与 Target 不再被误写成默认分支已交付能力。
