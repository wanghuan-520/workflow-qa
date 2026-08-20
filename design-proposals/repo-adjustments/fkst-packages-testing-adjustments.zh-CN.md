# fkst-packages-testing Repo 调整方案：Canonical Testing 契约与执行适配

> **状态：** 目标调整方案（Draft for Review）
>
> **固定基线：** `ChronoAIProject/fkst-packages-testing@ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1`
>
> **审计日期：** 2026-08-14
>
> **范围：** 本文定义 Testing Packages 对齐 Talos 有界 Testing Tool 所需的 Repo 调整。本文不表示本地 Issue #656 工作区增量已经发布或接入生产主路径。

关联文档：

- [Talos 有界 Testing Tool 总体设计](../talos-bounded-testing-tool-architecture.zh-CN.md)
- [fkst-hosted / Local QA Runtime 调整方案](fkst-hosted-local-qa-runtime-adjustments.zh-CN.md)
- [product-quality-loop 调整方案](product-quality-loop-adjustments.zh-CN.md)
- [本仓库 Testing Packages 缺口分析](../../repo-gaps/fkst-packages-testing-gap-analysis.zh-CN.md)

---

## 1. 文档状态、固定基线与证据边界

### 1.1 固定发布基线

本方案以远端固定提交为发布实现事实：

- Commit：[`ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1`](https://github.com/ChronoAIProject/fkst-packages-testing/commit/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1)
- 默认分支：`dev`
- 同 SHA ref：`fkst-hosted-default`
- 固定 tree：`1b9116041921ce715eafa3fa73882574940bae5b`

本地 checkout：

- HEAD：`121fe09e12af3158fab85856bf8ef928d5121d6f`
- branch：`fix/issue-656-canonical-structured-results`
- 本地 HEAD tree 与固定远端 SHA tree 相同；merge history 不同；
- 工作区存在 tracked/untracked 的 Issue #656 候选增量；
- 远端没有同名 feature ref。

因此：

- 固定 SHA 中存在的代码可描述为 baseline；
- 本地 #656 helper、compat adapter 和 hardening 只能描述为 candidate；
- candidate 未接主路径、未提交、未通过完整 Gate，不能写成已发布能力。

### 1.2 证据等级

| 标记 | 含义 |
| --- | --- |
| Baseline | 固定 SHA 中存在 |
| Candidate | 本地未提交 Issue #656 增量，只作设计证据 |
| Proposed | 本方案建议新增或修改 |
| Deprecated target | consumer 迁移完成后才删除 |

### 1.3 核心判断

本 Repo 已经有较成熟的 testing-design、StructuredPlan、CLI/HTTP、Browser controller、Local PEP、replay 和 canonical contract 基础。

真正需要解决的是“生产路径收敛和 ownership 收缩”：

- Browser route 已能写 canonical result/manifest；
- CLI/HTTP production path 仍主要输出 legacy `testing-structured-case-results.v1`；
- CLI/HTTP canonical helper 尚未成为唯一 run path；
- HTTP effect 没有 CLI 等价的 point-of-use PEP；
- publication 仍有私有 validator 和 Final Quality/GitHub aggregate 语义；
- Environment Factory/Generic Host 仍直接拥有 workspace/process/listener/port/cleanup；
- 缺 package release identity、PQL adapter 和 Hosted projection/receipt；
- 缺一个由 Local QA Runtime 消费的、版本化且 provider-neutral 的 runner invocation contract；
- `.testing/runs/...`、loopback CDP 和本地 workspace pointer 仍是当前实现假设，不能直接成为 Talos worker 或 Hosted Artifact wire contract；
- 当前没有 Talos task/lease/cancel/status adapter，但这些 transport/runtime 语义也不应由本 Repo 自行实现。

调整目标不是重写 Testing Packages，也不是把它改造成 NyxID HTTP 服务，而是让其成为 **纯测试语义和版本化 runner 的唯一 source of truth**，同时把本地资源、Artifact、Final Quality、Tool API 和机器调度交还 owning modules。

---

## 2. 目标角色、唯一权威与非目标

### 2.1 调整后角色

`fkst-packages-testing` 负责：

- testing-design 输入验证和 repository/requirement/traceability 分析；
- reviewed module plan；
- StructuredPlan 编译；
- CLI/HTTP/Browser 测试语义；
- typed actions；
- Observation；
- AssertionResult；
- CaseResult / CaseResultSet；
- EvidenceManifest schema 和引用关系；
- execution replay/PEP 语义；
- PQL input adapter；
- Hosted pointer-only projection adapter；
- contract validator、golden fixture 和 conformance test。

### 2.2 唯一权威

| 事实 | 本 Repo 是否权威 |
| --- | --- |
| testing-design analysis / StructuredPlan | 是 |
| Observation / AssertionResult / CaseResultSet | 是 |
| EvidenceManifest schema/ref relation | 是 |
| PQL asset review/promotion | 否，仅 adapter |
| machine/device/pool/placement | 否，Talos |
| workspace/process/port/Chrome/profile | 否，Local QA Runtime |
| Artifact bytes/grant/long-term storage | 否，Runtime + Hosted Artifact |
| Final Quality/Report/Settlement | 否，Hosted |
| transport identity/route | 否，NyxID |

### 2.3 非目标

本 Repo 不应：

- 注册或选择 Talos machine；
- 拥有 worker lease/generation/fence；
- 创建/删除宿主 workspace、process group、listener、port 或 Chrome；
- 使用个人 Chrome/CDP credential；
- 上传 raw Evidence 或拥有 Artifact grant；
- 计算 Final Quality 或发布最终 Report；
- 把 PQL 业务模型嵌入 analyzer 核心；
- 维护一套 Hosted server；
- 暴露 NyxID/OpenAPI service、实现 `talos.testing.*` facade 或注册 Talos worker；
- 直接调用 Talos submit/claim/heartbeat/result API，或保存 task lease/worker token；
- 因旧 route 需要而继续扩展第三套 result shape；
- 在 effect 不确定时自动重跑；
- 接受 floating `workspace` package identity 进入 Runtime production admission。

---

## 3. 当前实现地图

| 范围 | 固定基线已有 | 关键缺口 |
| --- | --- | --- |
| testing-design | immutable repository、approved input、requirements、traceability | 不识别 PQL Snapshot/Asset identity |
| StructuredPlan | module plan、structured plan v2、capability binding | Hosted/Talos input projection 未冻结 |
| canonical results | Observation、AssertionResult、CaseResult v2、CaseResultSet v2 | CLI/HTTP production 未统一写 canonical |
| EvidenceManifest | v1 contract 和 Browser route 输出 | CLI/HTTP 与 publication 未统一消费 |
| Browser controller | typed actions、grant、bounded observation、canonical output | PEP/fence/cancel 与 lost 语义需要统一 |
| CLI | direct argv、single-use grant、Local PEP、replay | legacy result/Quality output |
| HTTP | HTTP execution | effect point 没有 CLI 等价 Local PEP |
| Environment Factory | environment/readiness/cleanup contract 和物理 runtime | 物理资源 ownership 应迁给 Local Runtime |
| test-artifacts | artifact summary/pointer 基础 | summary 不是 canonical manifest；无 Hosted receipt |
| publication | CAS/replay、filesystem/GitHub publication | 私有 validator；GitHub aggregate 被当业务终态 |
| package metadata | `fkst.toml` name/deps/conformance | 无 exact release version/digest/capability manifest |
| Runtime invocation | runner/event contract 和 external-host composition 基础 | 无 strict `testing-runner-invocation.v1`；当前接口仍泄漏本地 path/CDP/runtime 假设 |
| Talos/Hosted projection | pointer/event adapter 基础 | 无 task-attempt/cancel/deadline/fence 的 bounded Runtime projection；本 Repo 也不应实现 Talos transport |
| Generic Host | durable acceptance/replay E2E 基础 | 自己拥有 process/listener/workspace，目标边界不符 |

### 3.1 关键 baseline 路径

```text
libraries/contract/testing_results.lua
libraries/contract/testing_evidence_manifest.lua
libraries/contract/testing.lua
libraries/testing_runtime/structured_execution.lua
libraries/testing_runtime/qa_publication.lua
packages/testing-design/core.lua
packages/testing-runner/structured_execution.lua
packages/testing-runner/ai_browser_control.lua
packages/environment-factory/runtime.lua
packages/test-artifacts/core.lua
packages/test-publication/core.lua
packages/test-publication/qa_publication.lua
packages/test-publication/defect_publication.lua
examples/generic-host/bin/generic-host-runtime.js
```

### 3.2 Issue #656 candidate

本地 candidate 已出现：

- canonical compatibility adapter；
- contract hardening；
- helper 生成 canonical result/evidence；
- legacy projection 思路。

但 helper 尚未在 production `run` 路径中成为唯一入口，因此必须把“helper 存在”和“主路径已迁移”分开。

---

## 4. 保留与复用

### 4.1 testing-design

保留：

- `testing-design.v1`；
- immutable repository identity；
- exact Git object validation；
- approved input pointers；
- requirements index；
- repository analysis；
- traceability seed；
- provider-neutral analyzer core。

PQL 支持应通过 adapter 接入 approved-input seam，而不是把 ProjectPackSnapshot/TestCaseAsset 业务规则写进 analyzer。

### 4.2 Plan 与 execution

保留：

- `testing-runner.module-test-plan.v1`；
- `testing-structured-plan.v2`；
- direct argv execution contract；
- Local PEP；
- single-use grant；
- replay claim/completion；
- typed HTTP/Browser execution；
- bounded observation；
- Host-authoritative completion；
- environment/readiness/cleanup receipts。

### 4.3 Canonical contract

保留并作为唯一方向：

```text
testing-observation.v1
testing-assertion-result.v1
testing-case-result.v2
testing-case-result-set.v2
testing-evidence-manifest.v1
```

需要加固，而不是再建新 shape。

### 4.4 Publication 基础

保留：

- CAS save；
- acknowledgement replay；
- filesystem/GitHub adapter；
- checkpoint ledger；
- duplicate publication suppression；
- environment/cleanup/plan/result digest reconciliation。

但 publication 只作为 adapter，不再拥有 canonical result validator 或最终业务状态。

---

## 5. P0：合同和生产主链路

### 5.1 Canonical contract hardening

修改：

```text
libraries/contract/testing_results.lua
libraries/contract/testing_evidence_manifest.lua
libraries/contract/strings.lua
contracts/*result*.md
contracts/*evidence*.md
tests/fixtures/*
```

补齐：

- `set_id == run_id`；
- `manifest_id == run_id` 或固定关联规则；
- repository/source exact identity；
- Plan ref/digest；
- Case/Asset/Requirement identity；
- started/completed/duration 一致性；
- orphan/duplicate/cross-run Evidence rejection；
- artifact-root containment；
- bounded collections/errors；
- canonical digest projection；
- unknown contract major fail closed。

R0 必须决定：

- baseline 的裸 64 hex；
- 总体设计的 lowercase `sha256:<64 hex>`；
- 当前 FKST canonical JSON；
- RFC 8785/JCS。

不能在同一 major 中无标记混用。固定规则：

- 已发布的 `testing-observation.v1`、`testing-assertion-result.v1`、`testing-case-result.v2`、`testing-case-result-set.v2`、`testing-evidence-manifest.v1` 保留 baseline canonical bytes 和裸 64-hex digest，禁止新 writer 在原 major 下改成 JCS/prefix；
- 若 R0 选择 RFC 8785/JCS 和 `sha256:<64 hex>`，必须发布新 major（建议依次为 Observation/Assertion v2、Case/CaseResultSet v3、EvidenceManifest v2），并提供 explicit old-major reader、one-way writer migration 和 golden vectors；
- 所有跨 Repo ref 必须携带 `contract_id`、major、`canonicalization_profile`、digest algorithm/encoding 和 content digest，consumer 按 registry profile 验证，不能先重写旧 payload 再 hash；
- 新建的 PQL、Hosted 和 `qa.local-*` contract 可以从 v1/v2 起选择 JCS/prefix，但不得把该规则追溯套用到已发布 Testing major。

### 5.2 完成 Issue #656 主路径接线

目标顺序：

```text
execute cases
→ create testing-case-result-set.v2
→ create testing-evidence-manifest.v1
→ validate canonical pair
→ atomically write canonical artifacts
→ derive legacy case-results through one compatibility adapter
→ publication consumes canonical output
```

修改：

```text
packages/testing-runner/structured_execution.lua
libraries/testing_runtime/structured_execution.lua
libraries/testing_runtime/bin/fkst-structured-execution-runtime.js
libraries/contract/testing.lua
packages/test-artifacts/core.lua
packages/test-publication/core.lua
packages/test-publication/qa_publication.lua
packages/test-publication/defect_publication.lua
libraries/testing_runtime/qa_publication.lua
examples/generic-host/bin/generic-host-runtime.js
```

要求：

- canonical helper 必须由 production run path 调用；
- canonical write 成功后才允许生成 compatibility artifact；
- replay 不重写 canonical artifact；
- malformed canonical output 不能 fallback 到 legacy passed；
- publication 不再自己重新解释 raw executor result；
- 一个 CaseResultSet 只能绑定一个 matching EvidenceManifest。

### 5.3 CLI/HTTP/Browser route 等价

三个 route 必须输出同一字段集合：

- run/case/asset/requirement identity；
- execution mode；
- status/classification；
- observations；
- assertion results；
- evidence refs；
- started/completed/duration；
- non-execution reason；
- bounded error；
- Plan ref/digest。

Gate：同一逻辑 assertion 在三 route 的 canonical JSON 中完全等价，允许 producer-specific metadata，但不允许字段语义分叉。

### 5.4 Point-of-use PEP

CLI 已有 Local PEP 基础。HTTP 和 Browser 必须补齐：

- strict action envelope；
- effect point 重新验证 grant/capability；
- atomic single-use consumption；
- cancel/deadline/fence；
- URL/origin/action/media budget；
- effect receipt；
- stale attempt rejection。

禁止只在 plan compile 或 route entry 做一次静态 capability check，然后直接执行 `http_request` 或 Browser action。

### 5.5 Replay 与不确定性

定义：

- effect 前 crash：可由明确 policy 判定 retry；
- effect 后、assertion 前 crash：`lost`/inconclusive；
- assertion 已冻结、artifact 未写：repair artifact，不重跑 effect；
- result frozen、publication 未 ack：repair publication，不重跑 test；
- completed replay：零 target effect、零 canonical rewrite、零 duplicate publication。

`browser.after_action_before_assertion` 不得变成普通 failed assertion。

### 5.6 移除 Final Quality ownership

Canonical CaseResult 只表达执行事实：

```text
deterministic
assertion_failure
execution_error
blocked
skipped
cancelled
lost
inconclusive
```

`product-defect` 等最终质量分类由 Hosted QualityEvaluation 决定。

迁移期间：

- legacy GitHub adapter 可以保留 `product-defect` compatibility projection；
- canonical contract 不得包含 Final Quality authority；
- publication 不得覆盖 Hosted Quality/Report。

### 5.7 Package release manifest

新增 **proposed**：

```text
contracts/testing-package-manifest.v1.md
libraries/contract/testing_package_manifest.lua
fixtures/testing-package-manifest-v1.json
```

至少包含：

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

规则：

- digest 由 release pipeline 对最终 package 内容计算；
- manifest 不把自己的 digest 放进被 hash projection；
- Runtime 负责安装/cache/signature/admission；
- package mismatch、unsupported capability/major/entrypoint fail closed；
- production 不接受 `workspace` 作为 package identity。

### 5.8 Runtime-facing invocation contract

新增 **proposed**：

```text
contracts/testing-runner-invocation.v1.md
libraries/contract/testing_runner_invocation.lua
libraries/testing_runtime/testing_package_executor.lua
fixtures/testing-runner-invocation-v1.json
```

`testing-runner-invocation.v1` 是 Local QA Runtime → Testing Packages 的唯一 production invocation envelope。它至少绑定：

```text
schema_version
invocation_id
qa_run_ref
opaque_attempt_ref
source_ref/digest
pql_input_set_ref/digest
structured_plan_ref/digest
package_manifest_ref/digest
execution_profile
requested_semantic_capabilities
capability_port_set_ref/digest
policy_ref/digest
budgets
deadline
producer/version
request_digest
```

输入不得包含：

- Talos lease token、worker token 或 NyxID bearer；
- 自由 machine/pool/profile selection；
- 未验证的宿主 absolute path；
- 任意 port/process handle/CDP endpoint；
- raw Secret、cookie、browser storage 或 env dump；
- arbitrary shell、任意 argv 或未在 StructuredPlan/package manifest 中声明的 entrypoint。

本 Repo author 并实现的逻辑接口冻结为 `TestingPackageExecutor`；Local QA Runtime 只能实现单独命名的 `TestingPackageInvocationAdapter`，不能复制该接口或 canonical writer：

```text
get_capabilities(package_ref)
compile_plan(approved_input_refs)
execute(invocation, capability_ports)
validate_result(case_result_set_ref, evidence_manifest_ref)
project_hosted(run_refs)
```

边界规则：

- Runtime 负责把 Talos task/attempt/generation/fence/cancel/deadline 投影为 opaque invocation context 和 capability ports；
- Testing Packages 只在每个 typed effect 前调用 capability port 完成 point-of-use authorization/cancel/deadline/fence check；
- Testing Packages 不保存或解释 Talos lease/generation，也不自行重试 transport task；
- capability port 返回的 effect receipt 只用于证明动作是否执行，不把 Runtime/Talos 状态写进 canonical CaseResult；
- Runtime 负责 workspace/process/port/Chrome/network/cleanup；Testing Packages 只解释 StructuredPlan 和产生 canonical testing facts；
- 同一 invocation replay 必须由 Runtime admission 和 Testing replay claim 共同保证零重复 effect。

Gate：同一 canonical invocation 通过 test fake、MVP Runtime 和后续 Hardened Runtime adapter 时，Testing Packages 产生相同的 Case/Assertion 语义；不同 Runtime 只能改变 capability/producer metadata，不能改变合同含义。

---

## 6. P1：跨 Repo 集成和交付闭环

### 6.1 PQL input adapter

新增 **proposed**：

```text
contracts/pql.testing-design-input-set.v1.md
packages/testing-design/pql_input_adapter.lua
```

输入：

```text
ProjectPackSnapshot
TestCaseAsset set
RequirementRef
ReviewDecision
PromotionReceipt
exact repository commit
approval subject
```

输出映射到现有 approved-input seam。

约束：

- pointer-only；
- snapshot/asset ref + digest；
- asset version/digest mismatch 拒绝；
- stale/rejected/unpromoted asset 不能进入 StructuredPlan；
- analyzer core 保持 provider-neutral；
- PQL business model 不进入核心模块。

### 6.2 Talos/Runtime terminal handoff input

新增 **proposed**：

```text
packages/testing-runner/terminal_projection.lua
```

Testing Packages 只输出 canonical CaseResultSet/EvidenceManifest 及其 pointer-only refs，供 Runtime/Talos 组装 terminal result 和 Hosted downstream handoff。它不 author Hosted 或 Talos 的 QARun projection/receipt contract。

Terminal projection fragment 只含：

- QARun/trace/dedup/idempotency；
- repository/exact commit；
- ProjectPackSnapshot；
- StructuredPlan；
- CaseResultSet；
- EvidenceManifest；
- Environment/Readiness/Cleanup receipts；
- execution counts/modes；
- residual risks；
- Artifact refs/digests。

不含：

- raw Evidence；
- local path；
- Secret；
- host resource handle；
- Quality/Report implementation。

Receipt：

- accepted/replayed/rejected；
- Hosted run ID；
- projection digest；
- validation error；
- ingestion time；
- same-key/same-digest replay；
- same-key/different-digest conflict。

### 6.3 资源 ownership 迁出

当前需要迁出的 production ownership：

```text
packages/environment-factory/runtime.lua
packages/environment-factory/bin/**
examples/generic-host/**
```

迁给 Local QA Runtime：

- workspace；
- process group；
- listener/port；
- app/backend lifecycle；
- Chrome process/profile/download；
- cleanup execution resources。

本 Repo 最终只保留：

- EnvironmentProfile contract；
- Runtime-owned ReadinessReceipt 的 adapter binding 和 conformance fixture；
- Runtime-owned CleanupReceipt 的 adapter binding 和 conformance fixture；
- typed request/response adapter；
- isolated test fake/harness。

### 6.4 Browser controller 调整

保留 `packages/testing-runner/ai_browser_control.lua`：

- typed action；
- bounded observation；
- Host-authoritative completion；
- canonical result/manifest。

迁出：

- Chrome launch；
- personal profile/CDP endpoint；
- downloads ownership；
- process cleanup；
- network enforcement；
- local Artifact bytes。

Browser controller 只消费 Runtime 提供的 capability/opaque session 和 typed action adapter。

### 6.5 Publication 降级为 adapter

- GitHub/filesystem publication 只消费 canonical refs；
- Hosted ingestion、GitHub publication、Artifact delivery 各自独立；
- 每个 adapter 返回统一 PublicationReceipt；
- publication repair 不触发 test rerun；
- aggregate GitHub report 不作为 Hosted ReportRecord；
- defect publication 只表示外部 effect，不是 canonical Quality。

---

## 7. P2：清理、加固和运维

### 7.1 Legacy 删除

consumer 迁移和 telemetry 清零后删除：

- `contract.testing_execution`；
- old route-specific result shape；
- publication private CaseResult validator；
- duplicate result translation；
- old CDP/browser receipt shape；
- legacy `test-artifacts.summary.v1` canonical role；
- compatibility-only helper 未被使用的重复实现。

### 7.2 Physical runtime 删除

资源 ownership 完成迁出后：

- 删除 production Environment Factory process/workspace/listener runtime；
- Generic Host 降为 example/test adapter；
- 不再从本 Repo 启动个人 Chrome；
- 不再本地决定端口和 cleanup。

### 7.3 Contract evolution

P0/P1 收敛后再增加：

- HTTP header assertion；
- JSONPath/value assertion；
- JSON Schema assertion；
- latency budget；
- body digest；
- multi Browser Case；
- 更多 Evidence media；
- API/performance/mobile/security runner adapters。

所有扩展必须复用同一 canonical result/evidence contract，不再新增 route-specific shape。

### 7.4 Release 和 conformance

增加：

- package release pipeline；
- fixed source commit/digest；
- semantic capability inventory；
- supported contract matrix；
- compatibility test corpus；
- deprecation telemetry；
- consumer inventory；
- release notes 中的 contract migration。

---

## 8. Proposed contracts and interfaces

### 8.1 PQL input

```text
pql.testing-design-input-set.v1
```

Owner 边界：

- PQL 生成；
- Testing Packages adapter 验证和映射；
- analyzer core 不解释 PQL lifecycle。

### 8.2 Canonical result

```text
testing-observation.v1
testing-assertion-result.v1
testing-case-result.v2
testing-case-result-set.v2
testing-evidence-manifest.v1
```

字段共同绑定：

- QARun；
- repository/source；
- Plan；
- Case/Asset/Requirement；
- execution mode；
- producer/package identity；
- timestamps/duration；
- observations/assertions/evidence；
- bounded errors/non-execution reason。

### 8.3 Runtime adapter

版本化 envelope：

```text
testing-runner-invocation.v1
```

Testing Packages-owned provider-neutral 逻辑接口（Runtime 使用独立 `TestingPackageInvocationAdapter` 调用）：

```text
TestingPackageExecutor
  get_capabilities(package_ref)
  compile_plan(approved_input_refs)
  execute(invocation, capability_ports)
  validate_result(case_result_set_ref, evidence_manifest_ref)
  project_hosted(run_refs)
```

该接口不能接受 host path/port/process handle、Talos lease/worker token、NyxID bearer 或 raw credential 作为自由参数。Talos/Runtime identity 只以 opaque ref/digest 和 effect capability port 进入；Testing Packages 不实现 `TestingExecutor`、`LocalQARuntimeAdapter`、HTTP service 或 Talos transport。

### 8.4 Package manifest

```text
testing-package-manifest.v1
```

Runtime admission 使用：

- package ID/version/digest；
- entrypoint/capability；
- contract major；
- runtime compatibility；
- source provenance。

### 8.5 Terminal projection boundary

```text
testing-case-result-set.v2
testing-evidence-manifest.v1
```

仅输出 ref/digest，不实现 Talos QARun、Hosted downstream domain 或网络 ingestion API。Talos/Runtime adapter 负责把这些 refs 绑定到 run/task/attempt/generation/fence，并由 Hosted 返回 `hosted.talos-terminal-handoff-receipt/v1`。

### 8.6 Canonicalization

跨 Repo 对齐：

- strict schema、bounded payload、digest-sensitive replay 和 unsupported-major fail closed；
- canonicalization/digest encoding 由 contract major 的 registry entry 决定；
- 已发布 Testing majors 保持 baseline profile 和裸 64-hex；
- 新 major/new domain contract 才可以声明 RFC 8785/JCS + lowercase `sha256:<64 hex>`；
- ref 必须携带 `canonicalization_profile` 与 digest encoding，禁止 consumer 静默改写；
- old→new 只通过 explicit compatibility reader 和新-major writer 迁移。

---

## 9. 删除、降级与废弃计划

### 9.1 立即降级

- `product-defect`：仅 legacy/publication compatibility；
- GitHub aggregate：publication adapter output；
- `test-artifacts.summary.v1`：diagnostic summary；
- Environment Factory physical runtime：迁移候选；
- Generic Host：example/conformance harness；
- local #656 helper：candidate，直到 production wiring 和 tests 完成。

### 9.2 Canonical migration 后删除

```text
contract.testing_execution
publication private result validator
route-specific result schemas
third translation layer
old CDP/result receipt shapes
legacy canonical writers
```

### 9.3 删除 Gate

只有满足以下条件才删除：

- 所有 known consumer 使用 canonical v2；
- compatibility telemetry 为零；
- rollback 演练完成；
- old/new equivalence fixture 通过；
- Hosted/Runtime/PQL canary 稳定；
- 发布至少一个明确 deprecation window。

### 9.4 不得删除

- reviewed Plan contracts；
- Local PEP/replay semantics；
- canonical result/evidence validators；
- package manifest/conformance；
- provider-neutral testing-design analyzer；
- Browser typed action semantics。

---

## 10. 跨 Repo 依赖与实施顺序

### 10.1 外部依赖

| 依赖 | Owner | 本 Repo 需要什么 |
| --- | --- | --- |
| ProjectPackSnapshot/TestCaseAsset | PQL | fixed schema/ref/digest/lifecycle receipts |
| Talos Testing Tool facade | Talos/Hosted | public QARun/source/plan/package/policy identity；不把 generic task body 传给本 Repo |
| Talos internal testing task | Talos | task/attempt/generation/fence/cancel/deadline 由 Runtime adapter 投影，不暴露 token |
| Local Runtime interface | fkst-hosted | `testing-runner-invocation.v1`、capability ports、effect receipts、resource ownership |
| Artifact grant/receipt | Hosted | sanitized Evidence delivery contract |
| Final Quality/Report | Hosted | canonical result consumer contract |
| package release authority | FKST release | exact version/digest/capabilities |

Talos owning repo 的外部 blocker：

- strict `testing` task envelope 和 worker dispatcher/TestingExecutor registration；
- atomic task claim + machine capacity reservation；
- generation/fence 防止过期 worker 继续 effect/result/upload；
- running deadline 和 active cancellation acknowledgement；
- cancel 后在 worker 确认停止前不提前释放 capacity；
- scoped Artifact upload、digest/provenance/byte ownership；
- critical capability attestation，而不是只信 machine tag 声明；
- QA executor/version negotiation、ordinary PR CI 和真实机器 E2E。

这些工作不应通过在 Testing Packages 内新增 HTTP daemon、Talos client 或 worker token handling 来规避。

### 10.2 实施顺序

```text
1. contract/digest/authority freeze
2. `testing-runner-invocation.v1` / `TestingPackageExecutor` freeze
3. canonical-first CLI/HTTP production wiring
4. Browser PEP/replay/lost alignment
5. package release manifest
6. cross-route conformance
7. PQL input adapter
8. Hosted projection/receipt
9. Runtime ownership extraction
10. publication/delivery repair separation
11. consumer inventory and legacy removal
```

### 10.3 并行边界

可并行：

- package manifest 与 PQL input schema；
- Hosted projection schema 与 canonical result hardening；
- Runtime ownership design 与 publication adapter refactor。

不可并行发布：

- canonical writer 未接主路径前删除 legacy writer；
- Runtime interface 未冻结前删除 Environment Factory physical runtime；
- Hosted receipt 未冻结前把 GitHub aggregate 当唯一 output；
- package digest 未冻结前启用 production Runtime admission。

---

## 11. 验收门槛

### G0 Baseline Gate

- PR 基于固定远端 SHA 或明确后继 dev；
- 工作树干净；
- Issue #656 candidate 单独成 PR；
- 不混入其他未提交增量；
- source/tree/version 可追溯。

### G1 Contract Gate

- strict unknown field/major；
- RFC 8785/JCS；
- digest vectors；
- tamper/cross-run/orphan evidence；
- timestamp/duration consistency；
- v1↔v2 migration fixture；
- same-key/different-digest fail closed。

### G2 Route Equivalence Gate

CLI、HTTP、Browser：

- 同字段；
- 同 assertion semantics；
- 同 non-execution vocabulary；
- 同 EvidenceManifest relation；
- 至少一个 terminal AssertionResult 或明确 non-execution reason；
- Chrome/HTTP success 不能单独形成 passed。

### G3 PEP/Replay Gate

- 每个 effect point 重新授权；
- denial = zero target effect；
- completed replay = zero duplicate effect；
- canonical artifact 不重写；
- publication 不重复；
- action 后 assertion 前 = lost/inconclusive。

### G4 Package Gate

以下 mismatch 全部拒绝：

- version；
- source commit；
- content digest；
- capability；
- entrypoint；
- contract major；
- runtime compatibility。

production 禁止 floating `workspace` identity。

### G5 Ownership Gate

静态/集成测试证明本 Repo：

- 不选 device；
- 不创建/删除宿主 workspace/process/port；
- 不启动个人 Chrome；
- 不拥有 Artifact grant/storage；
- 不计算 Final Quality；
- 不保存 Talos QARun 或 Hosted downstream settlement state；
- 不暴露 NyxID/OpenAPI server；
- 不调用 Talos task/worker API 或保存 lease/worker token；
- Runtime invocation 不接受自由 host resource 参数。

### G6 Integration Gate

- PQL adapter 同 asset ID/version 不同 digest 拒绝；
- Runtime invocation unknown field/package/capability/digest 拒绝；
- invocation/task/result 中无 Talos worker token、NyxID bearer 或 raw credential；
- Hosted projection same-key/same-digest replay；
- same-key/different-digest conflict；
- Talos task `completed` 不生成或覆盖 Case Pass/Fail；
- GitHub/Hosted/Artifact repair 相互独立；
- no dual execution。

### G7 External Runtime E2E

外部 Runtime 驱动：

```text
PQL input
→ testing-design
→ StructuredPlan
→ CLI/HTTP/Browser
→ CaseResultSet
→ EvidenceManifest
→ CleanupReceipt
→ Hosted projection
```

覆盖 crash、cancel、lost-ack、restart 和 cleanup residual。

---

## 12. 风险与开放决策

1. 当前 bare hex 与 `sha256:<hex>` 的 migration major。
2. FKST canonical JSON 与 RFC 8785/JCS 的最终选择。
3. canonical contract owner 是本 Repo 还是迁入 `fkst-hosted/packages/qa-contracts`。
4. Issue #656 candidate 如何拆分成 contract、runtime、publication PR。
5. package release manifest 的 signing/release authority。
6. Environment Factory physical runtime 的 consumer inventory。
7. Generic Host 是否保留为 conformance reference。
8. HTTP point-of-use PEP 的统一 capability/action vocabulary。
9. Final Quality 与 legacy `product-defect` deprecation window。
10. Browser lost/inconclusive vocabulary。
11. Hosted projection namespace 和 ingestion receipt owner。
12. v1 是否同时支持 CLI/HTTP/Browser，还是 Browser-first canary。

---

## 13. 永久证据链接

### 13.1 固定基线

- [固定提交](https://github.com/ChronoAIProject/fkst-packages-testing/commit/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1)
- [Issue #656](https://github.com/ChronoAIProject/fkst-packages-testing/issues/656)

### 13.2 Canonical contracts

- [Canonical results](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/libraries/contract/testing_results.lua)
- [EvidenceManifest](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/libraries/contract/testing_evidence_manifest.lua)
- [Testing contract facade](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/libraries/contract/testing.lua)

### 13.3 Execution

- [Structured execution](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/testing-runner/structured_execution.lua)
- [Browser controller](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/testing-runner/ai_browser_control.lua)
- [Testing design](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/testing-design/core.lua)
- [Runtime structured execution](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/libraries/testing_runtime/structured_execution.lua)

### 13.4 Ownership/publication

- [Environment Factory runtime](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/environment-factory/runtime.lua)
- [QA publication](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/test-publication/qa_publication.lua)
- [Defect publication](https://github.com/ChronoAIProject/fkst-packages-testing/blob/ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1/packages/test-publication/defect_publication.lua)

### 13.5 本仓库参考

- [总体 Talos Testing Tool 设计](../talos-bounded-testing-tool-architecture.zh-CN.md)
- [Testing Packages 缺口分析](../../repo-gaps/fkst-packages-testing-gap-analysis.zh-CN.md)

本次审计为只读，未执行仓库 test suite。本文件中的 Gate 是后续实施要求，不表示当前通过。
