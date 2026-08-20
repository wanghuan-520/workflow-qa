# fkst-hosted Repo 调整方案：Local QA Runtime 与 Hosted 下游 QA

> **状态：** 目标调整方案（Draft for Review）
>
> **固定基线：** `ChronoAIProject/fkst-hosted@7df95034557ef751172b12e1cb5300e3565e311e`
>
> **对应分支：** `feat/local-qa-runtime`
>
> **审计日期：** 2026-08-14
>
> **范围：** 本文只定义 `fkst-hosted` 中 Local QA Runtime、业务授权以及 Artifact/Quality/Report/Settlement 下游领域为接入 Talos 有界 Testing Tool 所需的调整，不表示 proposed 模块已经存在或已通过测试。Talos Testing Tool 的 operational QARun、submit/get/events/cancel 和机器调度由 `ChronoAIProject/talos` owning repo 实现，不在本 Repo 重复建设。

关联文档：

- [Talos 有界 Testing Tool 总体设计](../talos-bounded-testing-tool-architecture.zh-CN.md)
- [fkst-packages-testing 调整方案](fkst-packages-testing-adjustments.zh-CN.md)
- [product-quality-loop 调整方案](product-quality-loop-adjustments.zh-CN.md)
- [本仓库 Hosted 缺口分析](../../repo-gaps/fkst-hosted-gap-analysis.zh-CN.md)
- [本仓库 Local QA Runtime 缺口分析](../../repo-gaps/local-qa-runtime-gap-analysis.zh-CN.md)

---

## 1. 文档状态、固定基线与证据边界

### 1.1 固定源码基线

本方案以远端固定提交为实现事实：

- Commit：[`7df95034557ef751172b12e1cb5300e3565e311e`](https://github.com/ChronoAIProject/fkst-hosted/commit/7df95034557ef751172b12e1cb5300e3565e311e)
- PR：[#5992](https://github.com/ChronoAIProject/fkst-hosted/pull/5992)
- Issue：[#5988](https://github.com/ChronoAIProject/fkst-hosted/issues/5988)
- 固定 tree：[`tree/7df95034`](https://github.com/ChronoAIProject/fkst-hosted/tree/7df95034557ef751172b12e1cb5300e3565e311e)

本地 checkout HEAD `45d09613986ae3e448131f35b312ec77b7fe38c7` 比固定远端基线多两个尚未纳入该远端基线的 CI repair commit，主要涉及 rustfmt 和 missing-selector 错误分类。本方案不把这些本地增量视为发布能力。

外部 Talos 实现参考固定为：

- Repository：`ChronoAIProject/talos`
- Commit：[`a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb`](https://github.com/ChronoAIProject/talos/commit/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb)
- 当前 NyxID catalog OpenAPI：`https://nyx-api.chrono-ai.fun/public/s/talos-spec/openapi.json`
- 当前 task kind：`browse | computer_use`

Talos 固定参考只用于描述外部依赖现状；Talos 源码和 OpenAPI 不属于本 Repo 的实现基线。

### 1.2 证据等级

| 标记 | 含义 |
| --- | --- |
| 当前实现事实 | 固定 SHA 中存在可定位源码或测试 |
| Local QA walking skeleton | 组件存在，但 production execution spine 未闭合 |
| Proposed | 本方案建议新增的文件、模块或接口，当前不存在 |
| 外部依赖 | 必须由 Talos、Testing Packages、NyxID 或 PQL owning repo 完成 |

### 1.3 核心判断

`fkst-hosted` 当前不是空壳：Local QA 已有 Host API、SQLite WAL、Browser adapter、Worker protocol、Evidence stager 和 contract infrastructure。

但当前 production execution spine 仍是 synthetic：

- production 注入 `PassingExecutor`；
- request digest 使用常量或 walking-skeleton projection；
- 64-byte submit body 不能承载真实 Run identity；
- Coordinator 在没有实际 effect receipt 时推进 browser/evidence/cleanup/upload state；
- Hosted backend 没有业务授权、Artifact、Quality、Report 或 Settlement 的 durable domain，也没有消费 Talos QARun terminal refs 的稳定 handoff；
- Talos `testing` task、placement、lease/fence 和 worker executor 不属于本 repo 当前实现；
- 当前 Talos 已有 pool/machine/profile、async task、claim/lease/heartbeat/cancel、interactive session 和 NyxID identity propagation，但 OpenAPI 只接受 `browse|computer_use`；
- 当前 Talos 没有 typed QA executor ABI、structured Case/Assertion result、ordered QA event cursor、Artifact byte integrity、hostile-code Sandbox 或 production `testing` discriminator；
- Talos 当前 artifact route 只登记 `name/content_type/size/uri` metadata，不能替代 Hosted digest-bound Artifact ingestion；
- Talos 当前 task `completed` 不能被解释为 Case passed、Evidence settled 或 Hosted downstream settlement completed。

因此本 Repo 的调整目标不是“新增一个调用 Talos 的薄按钮”，而是同时完成：

1. 本地 Runtime 从 synthetic spine 变成 receipt-driven production executor；
2. Hosted backend 新增业务授权和 durable downstream QA domains；
3. 通过稳定 handoff 消费 Talos QARun、result、Artifact 和 Cleanup refs，不创建第二套 operational run store；
4. 建立 Artifact、Quality、Report、Settlement 和 PQL feedback 闭环。

---

## 2. 目标角色、唯一权威与非目标

### 2.1 调整后角色

`fkst-hosted` 承担两个清晰分离的逻辑边界：

1. **Hosted Authorization 与 Downstream QA Domain**
   - 对 Talos QARun 的 exact input tuple 签发和校验业务运行授权；
   - 消费 Talos 已冻结的 Source、Plan、Environment、Package、Policy refs/digests；
   - 不创建、查询、取消或推进 operational QARun；
   - 接收 Artifact；
   - 计算最终 Quality、生成 Report、Publication 和 Settlement；
   - 生成 HostedQualityFeedback。

2. **Local QA Runtime**
   - 本地 admission；
   - durable Journal；
   - workspace、process、port、Compose、Chrome ownership；
   - Testing Packages adapter；
   - execution、Evidence、Cleanup 和 upload attempt；
   - cancel/restart reconcile；
   - 返回执行事实和 immutable receipts。

### 2.2 唯一权威

| 事实 | 调整后权威 |
| --- | --- |
| QARun operational state、输入冻结、submit/get/events/cancel | Talos Testing Tool / QA Domain |
| 业务执行授权 | Hosted QA Authorization Authority |
| machine placement、task lease/generation/fence | Talos Control Plane |
| 本地 acceptance、effect、resource、execution、cleanup | Local QA Runtime Journal |
| Plan、Observation、AssertionResult、CaseResultSet | Testing Packages |
| Artifact ingest | Hosted Artifact module |
| Final Quality | Hosted Quality module |
| Report/Publication | Hosted Report/Publication module |
| Final settlement | Hosted Settlement module |
| transport identity/route/audit | NyxID |
| 测试资产 review/promotion | product-quality-loop |

### 2.3 非目标

本 Repo 不应：

- 重写 Talos Scheduler、worker daemon 或 machine enrollment；
- 创建第二套 operational QARun、TestingTask/Attempt store 或 testing submit/get/events/cancel API；
- 把 Pod/OpenSandbox session reconciler 直接当 QA scheduler；
- 把 NyxID OAuth token provider 扩展成 QA domain；
- 让 Local Runtime 计算 Final Quality 或决定 `report_impossible`；
- 在 Host 中复制 Testing Packages 的断言语义；
- 继续以 `PassingExecutor` 或 fixed browser fixture 表示生产成功；
- 在 MVP 已完成前声称 Hardened VM/EffectGate/Secret Broker 能力可用；
- 将 business authorization 隐式等同于 transport authentication；
- 让 Artifact bytes 经过 NyxID 长响应、task heartbeat 或 generic findings。

---

## 3. 当前实现地图

| 范围 | 固定基线已有 | 当前缺口 |
| --- | --- | --- |
| Host HTTP | loopback API、health/submit/get/events/cancel 基础 | submit payload 过窄、业务签名与完整绑定不足 |
| Journal | SQLite WAL、单写事务、acceptance/idempotency、event cursor | 缺 attempt/generation/fence/effect/resource/artifact/cleanup 正交记录 |
| Coordinator | claim attempt、九阶段 state、terminal transaction | 无真实 effect 也推进状态；无 deadline/fence/restart reconciliation |
| Executor | trait 和 production wiring | production 使用 `PassingExecutor` |
| Browser adapter | Chrome discovery、临时 profile/download、独立 process group、deadline、cleanup | 固定 fixture/selector；未接 Host；无多 action/fence/cancel |
| TypeScript worker | framed protocol、identity matching、capability ports | 仅 browser-smoke，terminal result 只能 passed |
| Evidence stager | path containment、配额、SHA-256、atomic write、residual | 无 quarantine/redaction/EvidenceManifest/upload receipt |
| qa-contracts | registry、Draft 2020-12 schema、Rust/TS strict parse、JCS fixtures | 仅 Local PoC contract，无 Talos/canonical result/Hosted domain |
| Hosted backend | API、Kubernetes/OpenSandbox session reconcile、storage client | AppState 无业务授权与 downstream QA datastore；无 Artifact/Quality/Report/Settlement |
| chrono-storage | object upload/download/delete、OAuth token cache、secret hygiene | 无 object-scoped grant、Artifact ledger、digest-bound ingest receipt |
| NyxID | storage OAuth2 service-account token provider；外部 Talos 已验证 propagated identity | 当前 backend 无 QA identity/audit adapter；不能把 storage token provider 当业务授权 |
| Talos | 外部已有 pool/machine/task/session、worker token、lease/heartbeat/cancel 和 OpenAPI facade | 仅 `browse|computer_use`；无 `testing` discriminator/QA executor/fence-safe retry/Artifact bytes/structured QA result |

### 3.1 当前关键路径

基线中的主要文件：

```text
apps/local-qa-runtime/host/src/lib.rs
apps/local-qa-runtime/host/src/main.rs
apps/local-qa-runtime/host/src/executor.rs
apps/local-qa-runtime/host/src/coordinator.rs
apps/local-qa-runtime/host/src/journal.rs
apps/local-qa-runtime/browser-adapter/src/lib.rs
packages/qa-contracts/contracts/registry.json
backend/src/router.rs
backend/src/state.rs
backend/src/openapi.rs
backend/src/config.rs
backend/src/storage/chrono_storage.rs
backend/src/storage/nyxid_token.rs
```

---

## 4. 保留与复用

### 4.1 Local QA Host / Runtime

保留：

- loopback-only 服务模式；
- SQLite WAL 和 single-writer transaction；
- same-key/same-digest replay、conflict 和 event sequence 基础；
- Host executor/coordinator 分层；
- Browser adapter 的独立 process group、temporary profile/download、deadline 和 exact cleanup；
- Evidence stager 的 containment、配额、digest 和 atomic write；
- framed Worker protocol 的 length prefix、single invocation 和 identity matching；
- Rust/TypeScript 双端 contract validation。

### 4.2 qa-contracts

保留：

- `registry.json` 作为 contract discovery 入口；
- Draft 2020-12 strict schema；
- RFC 8785/JCS fixture；
- Rust/TypeScript 同语料 conformance；
- unknown field/version fail-closed 方向；
- digest-sensitive replay 测试基础。

### 4.3 Hosted backend

可复用：

- 现有 router/state/config/OpenAPI 组织模式；
- authentication/access policy middleware 模式；
- HTTP error scrub 和 bounded error 习惯；
- generic storage client 的 object CRUD transport；
- NyxID token provider 的 OAuth2、cache、refresh 和 secret hygiene；
- session/pod 模块中的 reconciliation、CAS、outbox 和 retry 思路。

不可直接复用为 QA authority：

- Pod session 存活状态；
- in-memory claim；
- generic log bundle index；
- storage upload URL；
- transport 200；
- NyxID service-account bearer token。

### 4.4 Testing Packages pin

固定参考：

```text
ChronoAIProject/fkst-packages-testing@ac953ff0bb3f1c909728e66c3968cbb3ed5e3cf1
```

激活前必须先确定 canonical contract 的唯一 owner，并确认本地未提交 Issue #656 增量不被误当发布版本。

---

## 5. P0：合同和生产主链路

### 5.1 qa-contracts v2

修改：

```text
packages/qa-contracts/contracts/registry.json
packages/qa-contracts/src/*
packages/qa-contracts/ts/*
packages/qa-contracts/fixtures/*
```

本 Repo author 并冻结：

```text
qa.local-run-admission/v2
qa.local-lifecycle/v2
qa.local-worker-protocol/v2
qa.local-cleanup-receipt/v2

hosted.artifact-upload-grant/v1
hosted.artifact-ingest-receipt/v1
hosted.talos-terminal-handoff-receipt/v1
hosted.report-input-set/v1
hosted.quality-evaluation/v1
hosted.report-record/v1
hosted.run-settlement/v1
hosted.quality-feedback/v1
```

本 Repo 只登记和消费 Testing Packages 的 exact release，不重新 author 第二套 schema：

```text
testing-observation.v1
testing-assertion-result.v1
testing-case-result.v2
testing-case-result-set.v2
testing-evidence-manifest.v1
testing-runner-invocation.v1
testing-package-manifest.v1
```

Owner 规则：

- `fkst-packages-testing` 是 `testing-*` semantic contract、`TestingPackageExecutor` 和 canonical writer 的唯一 authoring registry；
- `packages/qa-contracts` 可以保存只读 external registry entry、生成 Rust/TypeScript binding 并运行 shared fixture conformance，但不得独立修改 Testing contract major、field 或 canonicalization；
- Local QA Runtime author `qa.local-*` admission/lifecycle/worker/cleanup contract；
- Talos owning repo author `talos.testing-*` QARun/task/snapshot/event/cancel contract；本 Repo 只能 pin exact contract/release 并保存 immutable refs/digests；
- Hosted downstream domains author `hosted.*` Artifact/Quality/Report/Publication/Settlement/Feedback contract；
- PQL author `pql.*` Snapshot/Asset/selection/governance/feedback receipt contract；
- 每个 registry entry 必须包含 owner、source repository、exact release/version、schema digest 和 canonicalization profile。

`qa.local-run-admission/v2` 必须绑定：

- Talos QARun、task、attempt refs 和 exact generation/fence correlation；
- machine、worker、installation；
- lease/generation/fence；
- exact Source/Plan/Environment/Package Set；
- source trust classification 和 `source-trust-policy` ref/digest；
- Policy/Budgets/Artifact Policy；
- business authorization ref/digest；
- idempotency key、nonce、deadline。

逻辑类型 `LocalQARunRequest` 从 v2 起唯一映射到 `qa.local-run-admission/v2#/$defs/LocalQARunRequest`。v1 只允许 decode/replay 历史记录，禁止提交新的 production effect；安全必填字段不能以 optional 字段塞回 v1。registry、Rust type 和 TypeScript type 必须同时更新该映射。

### 5.2 删除 production synthetic success

修改：

```text
apps/local-qa-runtime/host/src/lib.rs
apps/local-qa-runtime/host/src/executor.rs
apps/local-qa-runtime/host/src/coordinator.rs
apps/local-qa-runtime/host/src/journal.rs
apps/local-qa-runtime/host/src/main.rs
```

要求：

- production 不再注入 `PassingExecutor`；
- `PassingExecutor` 仅允许作为 `#[cfg(test)]` fake；
- 删除 constant request digest；
- 删除 64-byte walking-skeleton submit body；
- execution capability 未接通时返回 `blocked`，不得返回 `passed`；
- state 只能在对应 effect receipt 持久化后推进；
- Browser process READY、Chrome exit code 0 或 screenshot 成功都不能直接形成 Case passed。

### 5.3 新增真实 Runtime spine

目录 Gate：固定基线的真实代码位于 `apps/local-qa-runtime/`，本文沿用该物理路径，不在同一 executor PR 中另建 `apps/local-qa-host/`。R0 必须先冻结 app/package/profile 命名：MVP production modules 与 future Hardened launcher/supervisor/guest-agent 使用独立 crate/package、feature 和 dependency graph；若最终改名为 `apps/local-qa-host/`，必须通过独立迁移 PR 同步 CI、service installer、contract registry 和文档，不能与 production wiring 混合。

以下为 **proposed 路径**：

```text
apps/local-qa-runtime/host/src/admission.rs
apps/local-qa-runtime/host/src/runtime_executor.rs
apps/local-qa-runtime/host/src/worker_adapter.rs
apps/local-qa-runtime/host/src/workspace.rs
apps/local-qa-runtime/host/src/evidence.rs
apps/local-qa-runtime/host/src/cleanup.rs
apps/local-qa-runtime/host/src/artifact_client.rs
```

职责：

| Proposed module | 职责 |
| --- | --- |
| `admission.rs` | local credential、business signature、strict parse、digest、idempotency、active slot |
| `runtime_executor.rs` | effect-driven Prepare/Execute/Stage/Cleanup，不复制 testing semantics |
| `worker_adapter.rs` | v2 framed protocol、package capability、canonical result validation |
| `workspace.rs` | exact Source Object、per-run workspace、ownership label |
| `evidence.rs` | quarantine、redaction、validation、manifest、staging TTL |
| `cleanup.rs` | exact OwnedHandle、retryable/blocking residual、no cross-run cleanup |
| `artifact_client.rs` | grant、upload、same-key/digest reconcile、ingest receipt |

### 5.4 Journal 调整

`journal.rs` 至少增加：

```text
run_requests
runs
execution_attempts
transport_dispatches
resources
worker_invocations
browser_attempts
evidence_objects
artifact_upload_attempts
cleanup_attempts
events
recovery_actions
```

记录：

- `attempt_id`；
- `task_id`；
- machine/worker/installation；
- generation/fence；
- request/authorization/package/policy digest；
- effect intent 和 receipt；
- `execution_outcome`；
- `upload_outcome`；
- `cleanup_outcome`；
- residual；
- event sequence/digest/cursor；
- restart discovery/reconcile decision。

禁止把 execution、delivery、cleanup 和 final Quality 压成一个 status。

### 5.5 Hosted Authorization 与 downstream QA domains

以下为 **proposed 路径**：

```text
backend/src/qa/mod.rs
backend/src/qa/authorization.rs
backend/src/qa/downstream_store.rs
backend/src/qa/talos_projection.rs
backend/src/qa/settlement.rs
```

修改：

```text
backend/src/router.rs
backend/src/state.rs
backend/src/config.rs
backend/src/lib.rs
```

Hosted 负责：

- 对 exact Talos QARun/input tuple 签发、轮换和撤销业务运行授权；
- 按 immutable ref/digest 消费 Talos QARun terminal projection、Testing Packages result、Runtime CleanupReceipt 和 Artifact receipts；
- 对同一 handoff key/digest 幂等 replay，对同 key/different digest fail closed；
- 冻结 ReportInputSet；
- 计算 Quality、生成 Report/Publication 和 Settlement；
- 保存 repair/outbox 状态。

Hosted 不建立 QARun mutable state machine，不实现 submit/get/events/cancel，也不通过 client 创建或推进 Talos TestingTask。Talos owning repo 是 operational QARun、attempt、placement、lease、generation、fence 和 cancel delivery 的唯一 authority。

### 5.6 Hosted downstream datastore

当前 Hosted AppState 没有 downstream QA durable datastore。P0 必须完成 ADR，至少确定：

- database 技术；
- authorization、Talos handoff dedup、Artifact、ReportInputSet、Quality、Report、Publication、Settlement schema；
- migration；
- HA 和 transaction boundary；
- outbox/repair queue；
- retention；
- backup/restore；
- idempotency/unique constraints。

Talos QARun、Attempt 和 Event cursor 只以 immutable ref/digest/correlation 保存，不得复制成第二套可推进的 Hosted run store。默认建议 PostgreSQL，但文档不把技术选择写成已批准事实。

### 5.7 Talos Testing OpenAPI 与 NyxID Tool 投影（外部依赖）

以下 operation 由 `ChronoAIProject/talos` 实现和发布，`fkst-hosted` 不得注册同名 public facade：

| OperationId | 逻辑语义 | 唯一状态 owner |
| --- | --- | --- |
| `getTestingCapabilities` | 返回版本、profile、package、bounds 和非敏感 capability | Talos Testing Tool |
| `submitTestingRun` | 创建/幂等重放 operational QARun，返回 RunAcceptance | Talos Testing Tool |
| `getTestingRun` | 返回 bounded QARun Snapshot 和 opaque execution projections | Talos Testing Tool |
| `listTestingRunEvents` | 按 snapshot-bound opaque cursor 返回 bounded event batch | Talos Testing Tool |
| `cancelTestingRun` | 接受 cancel intent，返回 CancelAck；不承诺已停机/已 cleanup | Talos Testing Tool |

NyxID 按 Talos OpenAPI operation 投影多个 agent tools。因此“Testing 是 Talos 的一个 Tool”在 wire level 是一个有界 tool family，而不是一个同步长请求或自由文本 `goal`。

本 Repo 只实现独立的 authorization、Artifact ingestion、Quality、Report、Publication、Settlement 和 feedback endpoints/consumers。跨边界必须保持：

- public Testing request namespace 和 operational idempotency scope 由 Talos owning repo 定义；
- Hosted authorization 使用独立签名对象并绑定 Talos run/input tuple；
- public operation 不直接映射 Local Runtime loopback payload；
- Talos generic task status/findings 不进入 Final Quality 计算；
- Talos response 和 Hosted handoff 只携 refs/digests、bounded Snapshot/Event/SafeError，不携 raw Evidence、absolute path、worker token 或 credential。

NyxID/Talos 集成必须验证：

- propagated caller subject、org/group、permission、audience 和 freshness；
- production 禁止 development identity fallback；
- submit/cancel 可按 method/path 受 org approval policy gate；
- read operations 可以与 write operations 使用不同 scope/rule；
- audit correlation ID、caller 和 org attribution 可关联到 Talos QARun ref；
- NyxID HTTP 200/approval receipt 只证明 transport/policy 放行，不等于 Hosted business authorization 或 Talos RunAcceptance；
- NyxID bearer 不进入 Hosted store、Talos task、worker、Runtime request、Artifact 或 log。

### 5.8 Talos terminal projection handoff

Hosted downstream consumer 接收 pointer-only、digest-bound handoff：

```text
ingest_talos_run_projection(talos.testing-run-snapshot/v1)
ingest_case_result_set(testing-case-result-set.v2)
ingest_evidence_manifest(testing-evidence-manifest.v1)
ingest_cleanup_receipt(qa.local-cleanup-receipt/v2)
reconcile_artifact_receipt(hosted.artifact-ingest-receipt/v1)
```

Handoff 至少绑定：

```text
qa_run_ref/digest
task/attempt ref
machine/worker/installation correlation
generation/fence identity
source/plan/environment/package/policy refs+digests
authorization ref/digest
CaseResultSet/EvidenceManifest/CleanupReceipt refs+digests
artifact policy ref/digest
callback/audit correlation
```

规则：

- Hosted 不读取 Talos scheduler 内部表，也不伪造或推进 task/lease/fence；
- Talos worker token、lease token 不写入 Hosted domain object；
- task claim 不是 Runtime acceptance，task `completed` 也不是 Case passed 或 settlement passed；
- Runtime acceptance 后 lease loss 的 reconcile/lost 和禁止自动换机由 Talos QARun authority 执行；
- 每个 result/upload/settlement handoff 必须带 run/attempt/generation/fence correlation，stale projection fail closed；
- Hosted 只有在验证 CaseResultSet、Evidence/Artifact/Cleanup receipts 后才生成 Quality/Report/Settlement；
- Talos control repair、Artifact repair、Publication repair 和 PQL feedback repair 互不触发测试重跑。

---

## 6. P1：跨 Repo 集成和交付闭环

### 6.1 Testing Packages Adapter

固定调用链：

```text
Talos Worker TestingExecutor
→ LocalQARuntimeAdapter
→ qa.local-run-admission/v2
→ Local Runtime TestingPackageInvocationAdapter
→ testing-runner-invocation.v1
→ exact Testing Package version/digest
→ typed capability ports/effects
→ testing-case-result-set.v2
→ testing-evidence-manifest.v1
→ CleanupReceipt
```

`TestingExecutor` 和 `LocalQARuntimeAdapter` 属于 Talos worker-side implementation；`TestingPackageInvocationAdapter` 属于 Local Runtime，负责构造 invocation 和 capability ports；`TestingPackageExecutor`、测试断言和 canonical result writer 属于 Testing Packages。四者不得合并为一个拥有全部 authority 的通用 plugin。

要求：

- package manifest/capability mismatch fail closed；
- output strict validation；
- CLI/HTTP/Browser 使用同一 canonical result；
- action 后 assertion 前 crash → lost/inconclusive；
- replay 不重复 target effect 或 artifact write；
- worker 不管理 workspace/Chrome/port/cleanup；
- Runtime adapter 把 task/attempt/generation/fence/cancel/deadline 投影为 strict invocation context 和 capability ports；
- Testing Package 不接收 Talos lease/worker token、NyxID bearer 或自由 host path；
- Talos terminal acknowledgement 不覆盖 Testing Package 冻结的 CaseResultSet。

### 6.2 Side-effect gates

每个外部 side effect 前必须检查：

- cancel intent；
- deadline；
- current fence；
- attempt identity；
- resource budget；
- allowed action/origin/media；
- ownership state。

stale attempt 不得：

- 创建 workspace/process/Chrome；
- 执行 HTTP/Browser action；
- 写 canonical result；
- 上传 Artifact；
- 写 terminal event。

取消和 deadline 不能只在 task submit 或 heartbeat entry 检查：

- Talos cancel 先形成 cancel intent；Runtime Journal 必须独立接受并持久化；
- worker/adapter 使用 task-scoped abort 停止 polling/新 invocation；
- Runtime 在每个 process/HTTP/Browser/upload effect 前重检 cancel/deadline/fence；
- 已开始的 Browser/process action 由 Runtime 按 exact OwnedHandle 中断和 cleanup，worker 不越权 kill 未识别进程；
- cancel acknowledgement、observed stop、execution outcome 和 CleanupReceipt 是不同事实；
- running task 超过 execution/cleanup/total deadline 必须进入 timeout/reconcile，不允许无限 heartbeat 延长；
- Talos 在 worker 停止确认或 machine lost 判定前不得把 capacity 当作安全可复用；
- cancel 后已冻结的 sanitized staging 可以按原 policy 继续 upload/expire，但不能重跑测试。

### 6.3 Artifact ingestion

默认数据边界：

- raw Evidence 和当前 `qa.local-evidence/v1` object 保持 `local-only:not-uploadable`；
- 允许上传的对象必须是从 raw Evidence 生成的独立 sanitized derivative，而不是修改 ownership label 后直接上传原对象；
- sanitized derivative 必须完成 schema/media/size validation、redaction、post-redaction digest 和 provenance binding；
- NyxID、Talos heartbeat/findings/task result 不承载 Artifact bytes；
- Talos 当前 metadata-only `uri` registration 不是 byte ownership、integrity 或 Hosted ingest receipt。

以下为 **proposed 路径**：

```text
backend/src/artifacts/mod.rs
backend/src/artifacts/grant.rs
backend/src/artifacts/ingest.rs
backend/src/artifacts/store.rs
```

实现：

- object identity；
- digest、length、media type、sensitivity binding；
- one-time/short-lived upload grant；
- immutable ArtifactIngestReceipt；
- duplicate same-key/same-digest replay；
- same-key/different-digest conflict；
- raw/unsanitized evidence rejection；
- lost-ack query/reconcile；
- retention/TTL。

现有 `backend/src/storage/chrono_storage.rs` 可作为 object CRUD transport，但其 API没有 presigned URL，不能直接称为 Artifact service。

P1 前必须选择：

1. Hosted streaming ingest；或
2. storage/NyxID 新增 object-scoped digest-bound grant。

### 6.4 Quality 和 Report

以下为 **proposed 路径**：

```text
backend/src/quality/mod.rs
backend/src/quality/evaluator.rs
backend/src/reports/mod.rs
backend/src/reports/service.rs
```

Quality 只消费冻结输入：

- CaseResultSet；
- EvidenceManifest；
- ArtifactIngestReceipts；
- Environment/ReadinessReceipt；
- CleanupReceipt；
- policy/ruleset digest。

Report 只消费 immutable ReportInputSet。相同冻结输入必须产生相同 QualityEvaluation/ReportRecord digest。

Local Runtime 不生成 Final Quality，也不决定 `report_impossible`。它只报告 execution/delivery/cleanup facts。

### 6.5 HostedQualityFeedback

Hosted 生成 pointer-only feedback：

- Talos QARun ref/digest；
- ProjectPackSnapshot/TestCaseAsset versions；
- StructuredPlan；
- CaseResultSet/EvidenceManifest；
- QualityEvaluation/ReportRecord；
- cursor/event/dedup key；
- coverage/asset proposal seed。

PQL ingestion failure进入 feedback repair queue，不重跑本地测试。

### 6.6 NyxID transport adapter

以下为 **proposed 路径**：

```text
backend/src/transport/nyxid.rs
```

不要扩展 storage-specific `backend/src/storage/nyxid_token.rs` 承担 QA domain。

Hosted authorization、Artifact 和 downstream handoff API 必须同时验证：

- route-scoped NyxID transport security；
- Hosted business authorization；
- device/node/machine/worker/installation binding；
- transport/application error 分层。

HTTP 200、OAuth token 或 transport audit receipt 不等于 Hosted business authorization、Artifact receipt 或 Talos RunAcceptance。

---

## 7. P2：清理、加固和运维

### 7.1 Repair queues

增加独立 queue：

- authorization/revocation repair；
- Talos terminal handoff reconcile；
- local cleanup repair；
- Artifact delivery repair；
- Quality/Report repair；
- Publication repair；
- PQL feedback repair。

任何 delivery/publication/feedback repair 都不得触发测试重跑。

### 7.2 全阶段 failpoint

覆盖：

- acceptance commit 前后；
- reservation/authorization/dispatch；
- resource intent/create/identity；
- worker request/result；
- Browser action/assertion；
- Evidence capture/redaction/manifest；
- cleanup each-resource；
- upload grant/bytes/ack；
- Host/worker/Hosted restart；
- lease expiry/fence rollover；
- staging TTL；
- feedback acknowledgement。

### 7.3 Quota 和 policy

增加：

- per-run action/time/process/memory/disk/event/Evidence quotas；
- origin/action/media allowlist；
- PNG/bounded sanitized JSON validation；
- staging TTL；
- redaction policy version/digest；
- SafeError size；
- task/run/attempt/artifact/report correlation limits。

### 7.4 Capability negotiation

区分：

```text
local-qa-mvp/v1
hardened-untrusted-code/v1
```

不支持 Hardened 时 fail closed，禁止降级。

### 7.5 Hardened profile

Hardened guest、EffectGate、Warden、Secret Broker、signed Recovery 等继续作为后续 track。它们不能阻塞 Browser MVP，也不能成为 MVP 已有安全保证。

### 7.6 Observability

建立：

- QARun/Task/Attempt correlation；
- state/outcome/delivery/cleanup metrics；
- lease/fence/cancel events；
- resource residual inventory；
- artifact/quality/report latency；
- repair queue lag；
- audit query；
- bounded, secret-free logs。

---

## 8. Proposed contracts and interfaces

### 8.1 Talos Testing API 与 Hosted downstream interface

NyxID/Agent-facing 逻辑 namespace：

```text
talos.testing.get_capabilities  -> getTestingCapabilities
talos.testing.submit            -> submitTestingRun
talos.testing.get               -> getTestingRun
talos.testing.events            -> listTestingRunEvents
talos.testing.cancel            -> cancelTestingRun
```

上述 Agent-facing namespace 全部由 Talos owning repo 实现。Hosted domain 只提供：

```text
HostedDownstreamQAService
  issue_or_replay_authorization
  ingest_talos_terminal_projection
  grant_artifact_upload
  ingest_or_reconcile_artifact
  evaluate_quality
  build_report
  publish_report
  settle_run
  deliver_quality_feedback
```

这些名称为 proposed，不表示固定基线已经存在。Talos public operations、Talos QARun/task backend 和 Hosted downstream service 是三个逻辑边界；Hosted 不得暴露同名 Testing operations，也不得把 Local Runtime API 原样暴露给 Agent。

### 8.2 QARun 与 TestingTask

```text
Talos QARun
  ├─ frozen input set
  ├─ authorization ref/digest
  ├─ one or more TestingTask/Attempt
  ├─ bounded snapshot/events/cancel
  └─ terminal result/evidence/cleanup refs

Hosted Settlement Record
  ├─ Talos QARun terminal ref/digest
  ├─ ReportInputSet
  ├─ ArtifactIngestReceipts
  ├─ QualityEvaluation
  ├─ ReportRecord / PublicationReceipt
  └─ RunSettlement
```

Talos 可以在 Runtime acceptance 前新建 dispatch attempt；acceptance 后禁止自动换机执行。Hosted 只保存 immutable correlation 和 downstream receipts，不能创建 attempt 或倒退 Talos QARun terminality。

### 8.3 Runtime interface

```text
get_capabilities
submit_run
get_run
get_run_events
cancel_run
```

Runtime 不接收 Talos 自由结构 task。`TestingExecutor` 必须通过 `LocalQARuntimeAdapter` 显式构造 strict `qa.local-run-admission/v2`；Runtime-owned `TestingPackageInvocationAdapter` 再构造 `testing-runner-invocation.v1` 并调用 Testing-owned `TestingPackageExecutor`。Talos lease/worker token、NyxID bearer、自由 host path 不得穿透任一 adapter。

### 8.4 Canonical names

本 Repo 必须与 Talos、Testing Packages 和 PQL owning repo 对齐：

```text
pql.testing-design-input-set.v1
testing-observation.v1
testing-assertion-result.v1
testing-case-result.v2
testing-case-result-set.v2
testing-evidence-manifest.v1
talos.testing-run-snapshot/v1
talos.testing-event-page/v1
hosted.talos-terminal-handoff-receipt/v1
hosted.artifact-ingest-receipt/v1
hosted.report-input-set/v1
hosted.run-settlement/v1
```

所有持久对象使用 strict schema，但 canonicalization/digest encoding 由 exact contract major 的 owner registry 决定：新建 `qa.local-*`、`hosted.*` 和 PQL contracts 使用 RFC 8785/JCS + lowercase `sha256:<64 hex>`；已发布 Testing majors 保持其 baseline canonicalization 和裸 64-hex，直到 Testing owner 发布新 major。所有 ref 必须携带 `contract_id`、major、`canonicalization_profile` 和 digest encoding，consumer 禁止静默重写。

---

## 9. 删除、降级与废弃计划

### 9.1 立即删除或隔离

- production `PassingExecutor`；
- constant request digest；
- 64-byte submit walking skeleton；
- 无 effect receipt 的固定状态推进；
- READY/selector/screenshot 直接推断 passed；
- production path 中的 synthetic terminal result。

测试 fake 可以留在 test-only namespace。

### 9.2 降级为兼容/历史

- `qa.local-evidence/v1`：PoC fixture；
- `qa.local-worker-protocol/v1`：compatibility test protocol；
- `qa.local-lifecycle/v1`：历史 progress projection；
- generic log bundle：diagnostic，不是 EvidenceManifest；
- chrono-storage upload URL：transport response，不是 ArtifactIngestReceipt。

### 9.3 新链路 Gate 后再废弃

- direct NyxID → Local Host production path；
- v1 production adapters；
- fixed browser-smoke canonical schema；
- duplicate QA state stored in session/pod modules；
- any Host-owned `report_impossible`/Final Quality logic。

### 9.4 文档修正

后续独立修正把 inert scaffold、component smoke 或 atomic file write 描述成“完整生产闭环”的表述。本文不修改原文档。

### 9.5 Contract 与 fixture drift 迁移

以下 drift 必须在 R0/P0 形成独立 schema/fixture migration，不能只在 adapter 中宽松兼容：

1. **Execution profile 名称**：总体架构使用 `local_qa_agent_mvp`，当前 `qa-contracts/registry.json` 使用 `local_qa_host_mvp`。目标统一为 `local_qa_agent_mvp`；旧值只能由 explicit compatibility reader 接受，不能成为新 admission output。
2. **Evidence media type**：Local stager 当前写 `text/plain; charset=utf-8`，Testing manifest 当前接受 `text/plain`。必须冻结一个 canonical media type，并提供 old/new golden fixture；同一 major 内不得静默归一化后改变 digest。
3. **Canonical JSON `-0`**：MVP strict parser 必须在通用 RFC 8785/JCS canonicalization 前拒绝 textual `-0`，避免不同 parser 对非法/边界输入产生不同 acceptance digest。
4. **Action 后 assertion 前 crash**：workflow-qa seed fixture 已从历史 `case_failed_then_cleanup` 校正为 `lost_or_inconclusive_then_cleanup`；owning repo 仍必须同步 Runtime recovery、Testing result vocabulary 和 conformance tests。
5. **`report_impossible` authority**：workflow-qa seed fixture 已拆开 Local `upload_expired` 与 Hosted `report_impossible` disposition；owning repo 仍必须以独立版本对象实现迁移，Local Runtime 永不生成最终 `report_impossible`。
6. **流程命名**：`workflow-qa` 是跨模块 process/saga 名称，不是可部署 service，也不能作为 Talos task kind、NyxID tool 或 Local Runtime endpoint namespace。

本文只记录 owning repo 的迁移要求。workflow-qa 的 seed fixture 已对齐目标 oracle，但仍标记为 `draft`；代码、schema、golden vectors 和 conformance tests 迁移完成前，相关 Gate 不得标记通过。

---

## 10. 跨 Repo 依赖与实施顺序

### 10.1 外部依赖

| 依赖 | Owner | fkst-hosted 需要什么 |
| --- | --- | --- |
| Talos testing task | Talos | strict `testing` discriminator、placement、lease/generation/fence、TestingExecutor、bounded result refs |
| Canonical testing contract | fkst-packages-testing | Plan/Observation/Assertion/CaseResultSet/EvidenceManifest/TestingPackageExecutor exact release；qa-contracts 只生成 binding/conformance |
| PQL lifecycle objects | product-quality-loop | Snapshot/Asset/Input/HostedQualityFeedback counterpart |
| NyxID Tool transport | NyxID | Talos OpenAPI tool projection、propagated identity、org scope/approval/audit；不承载 QA state |
| Artifact backend | Hosted/storage | streaming ingest 或 object-scoped grant |
| Business authorization | Hosted | signing/verification key 和 full tuple binding |

Talos owning repo 的生产 blocker 必须作为外部依赖跟踪：

1. task claim 与 machine capacity reservation 当前需要原子化，才可安全支持并发 claim/多 control-plane replica；
2. lease expiry/requeue 后必须使用 generation/fence 阻止旧 worker 继续 Browser、Secret、result 或 upload effect；
3. running task 必须执行 deadline，而不只在 `submitted` 阶段 expiry；
4. cancel 后不得在 worker observed-stop 或 machine-lost 前提前释放 capacity；
5. cancellation 需要主动 delivery/ack，不能只依赖约 20 秒 heartbeat 轮询；
6. worker artifact API 必须从 caller-provided URI metadata 升级为 scoped upload、digest verification、provenance 和 byte ownership；
7. machine critical capability 需要 attestation/verification，不能只信 owner 声明的 tags；
8. 需要稳定 QA executor registration/version negotiation；generic Browser session 不能替代 deterministic QA executor；
9. 需要普通 push/PR CI、claim race、split-brain、running deadline、cancel latency、Artifact integrity 和真实 NyxID→machine QA E2E。

上述 blocker 不通过在 `fkst-hosted` 复制 Talos scheduler 或让 Local Runtime 接收 Talos内部表来规避。

### 10.2 实施顺序

```text
1. 跨 Repo authority/contract owner 冻结
2. qa-contracts v2 + golden fixtures
3. Testing Packages canonical-first output + package manifest
4. Local Runtime real executor spine
5. Talos owning repo 完成 Testing Tool/QARun/Task 外部 Gate
6. Hosted business authorization + Talos terminal handoff
7. Artifact grant/ingest
8. Quality/Report/Settlement/Feedback
9. Talos testing canary
10. direct path 与 v1 consumer inventory
11. legacy deprecation/removal
```

### 10.3 不允许的依赖

- Local Runtime 依赖 Talos scheduler 内部表；
- Testing Packages 依赖 Hosted database；
- Hosted Quality 读取 raw local files；
- NyxID 解释 QARun；
- PQL 调用 Runtime loopback；
- Hosted 通过 session/pod liveness 推断 QARun success。

---

## 11. 验收门槛

### G0 Contract Gate

- Rust/TypeScript 对同 fixture 产生相同 JCS bytes 和 SHA-256；
- unknown field/version、越界、缺 fence/authorization 拒绝；
- same-key/same-digest replay；
- same-key/different-digest conflict；
- cross-run evidence/task/receipt 拒绝。

### G1 No Synthetic Pass Gate

以下不得进入 passed：

- executor 未接线；
- Browser READY；
- missing selector；
- screenshot 成功；
- worker protocol failure；
- empty assertion；
- task findings 非空；
- NyxID/HTTP 200。

### G2 Effect Gate

- 没有 persisted receipt 不推进 state；
- effect 前检查 cancel/deadline/fence；
- stale attempt 零新副作用；
- action 后 assertion 前 crash → lost/inconclusive；
- completed replay 零重复 effect。

### G3 Recovery Gate

- 每个 stage 后强制 crash；
- restart 后进入 reconcile/lost/repair，不自动重跑；
- acceptance 后不自动换机；
- event sequence 稳定；
- unknown ownership 不猜测删除。

### G4 Cleanup Gate

- Chrome/profile/download/workspace/process/port exact cleanup；
- unrelated process/file 不受影响；
- residual 可持久化和 repair；
- blocking residual 不释放 slot。

### G5 Artifact Gate

- grant 过期/重放拒绝；
- digest/length/media/sensitivity mismatch 拒绝；
- raw/unsanitized Evidence 拒绝；
- bytes-after-ack-loss 使用 same key/digest reconcile；
- receipt immutable。

### G6 Hosted Downstream Durability Gate

Hosted 重启后以下不丢：

- business authorization state；
- Talos terminal handoff dedup/correlation；
- Artifact receipts；
- ReportInputSet；
- Quality/Report/Settlement；
- repair queue state。

### G7 Deterministic Quality Gate

相同冻结输入产生相同 QualityEvaluation/ReportRecord digest。缺失必需 receipt 时由 Hosted 判定 ReportInputSet incomplete/`report_impossible`。

### G8 End-to-End Gate

覆盖：

```text
pass
fail
blocked
cancel
timed_out
lost_or_inconclusive
upload_pending/upload_expired
cleanup_residual
```

完整链路：

```text
NyxID caller
→ Talos `talos.testing.*` Tool operation
→ Talos QARun / TestingTask
→ Worker TestingExecutor
→ LocalQARuntimeAdapter
→ Local Runtime
→ TestingPackageExecutor / Testing Packages
→ Hosted Artifact ingestion
→ Hosted Quality/Report/Settlement
→ HostedQualityFeedback
```

### G9 NyxID Tool Gate

- Talos catalog/OpenAPI 可发现五个 testing operation；
- operationId、schema、bounds 和 error projection 稳定；
- org sharing/scope 生效，viewer/out-of-scope caller 被拒绝；
- submit/cancel 的 method/path approval policy 可验证，read rule 可独立配置；
- propagated identity 的 subject/org/group/permission/audience/freshness fail closed；
- development identity fallback 在 production 禁用；
- audit 能关联 caller、org、QARun 和 Talos task；
- NyxID bearer 不进入 Hosted store、task、worker、Runtime、Artifact 或 log；
- transport 200/approval 不等于 business authorization 或 RunAcceptance。

### G10 Talos/Real-machine Gate

- `testing` task 使用 strict discriminator，不进入 `browse|computer_use` planner；
- claim/capacity 原子性和 stale generation/fence negative test 通过；
- running deadline、active cancel、observed-stop 和 capacity release 顺序通过；
- Artifact bytes/digest/provenance 由 scoped upload/Hosted receipt 验证，不信 caller URI；
- critical capability 与 executor/runtime/package version 可验证；
- worker/Runtime Node/Rust/browser version matrix 对齐，Talos Node 22 要求与本 Repo CI 不冲突；
- 在真实 macOS arm64 机器完成 per-run Sandbox、temporary Chrome、CaseResult/Evidence/Cleanup E2E；
- Talos task `completed` 后，缺 Artifact/Cleanup/ReportInputSet 时 Hosted Settlement 仍不得为 passed；
- network partition、lease expiry、worker crash、Runtime crash、cancel latency 和 lost-ack 均有自动化 acceptance。

---

## 12. 风险与开放决策

1. 内部 `error`/`lost` 原因如何投影到 canonical `lost_or_inconclusive`，以及 SafeError/diagnostic reason 的闭合 vocabulary。
2. Talos 与 `qa-contracts` 谁拥有跨仓 wire schema。
3. Hosted backend 新 durable datastore 的部署、迁移、HA 和成本。
4. chrono-storage 无 presigned grant 时选择 streaming ingest 还是扩展 storage API。
5. business authorization signing key、rotation 和 revocation。
6. NyxID testing scope、route、caller/node/machine audit projection。
7. Testing Packages canonical implementation owner 和 package release authority。
8. v1 Browser-only，还是同时开放 CLI/HTTP runner。
9. Runtime local credential 和 executable identity。
10. direct NyxID → Host deprecation window。
11. `report_impossible` fixture/migration 版本。
12. Talos terminal handoff 到 Hosted downstream domains 的 transport、authentication、retry 和 retention contract。

---

## 13. 永久证据链接

### 13.1 固定基线

- [固定提交](https://github.com/ChronoAIProject/fkst-hosted/commit/7df95034557ef751172b12e1cb5300e3565e311e)
- [PR #5992](https://github.com/ChronoAIProject/fkst-hosted/pull/5992)
- [Issue #5988](https://github.com/ChronoAIProject/fkst-hosted/issues/5988)

### 13.2 Local QA Runtime

- [Host Journal](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/apps/local-qa-runtime/host/src/journal.rs)
- [Host executor](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/apps/local-qa-runtime/host/src/executor.rs)
- [Host coordinator](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/apps/local-qa-runtime/host/src/coordinator.rs)
- [Browser adapter](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/apps/local-qa-runtime/browser-adapter/src/lib.rs)
- [qa-contracts registry](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/packages/qa-contracts/contracts/registry.json)

### 13.3 Hosted plumbing

- [Hosted router](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/backend/src/router.rs)
- [Hosted state](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/backend/src/state.rs)
- [ChronoStorage client](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/backend/src/storage/chrono_storage.rs)
- [NyxID token provider](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/backend/src/storage/nyxid_token.rs)

### 13.4 外部 Talos/NyxID

- [Talos 固定参考提交](https://github.com/ChronoAIProject/talos/commit/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb)
- [Talos README task lifecycle](https://github.com/ChronoAIProject/talos/blob/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb/README.md#L12-L23)
- [Talos scheduler capability matching](https://github.com/ChronoAIProject/talos/blob/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb/control-plane/src/services/scheduler.ts#L7-L30)
- [Talos OpenAPI](https://nyx-api.chrono-ai.fun/public/s/talos-spec/openapi.json)
- [Talos worker setup skill](https://ornn.chrono-ai.fun/skills/talos-worker-setup)

### 13.5 本仓库参考

- [总体 Talos Testing Tool 设计](../talos-bounded-testing-tool-architecture.zh-CN.md)
- [Hosted 缺口分析](../../repo-gaps/fkst-hosted-gap-analysis.zh-CN.md)
- [Local QA Runtime 缺口分析](../../repo-gaps/local-qa-runtime-gap-analysis.zh-CN.md)

本次审计为严格只读，未运行会生成 `target/` 或其他产物的 build/test。本文中的 Gate 是后续实施验收要求，不表示当前已经通过。
