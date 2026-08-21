# Local QA Runtime 可执行路径与缺口审计

> Repo：[ChronoAIProject/fkst-hosted](https://github.com/ChronoAIProject/fkst-hosted)
>
> 审计日期：2026-08-21
>
> Pinned Baseline：[`feat/local-qa-runtime@c79d11d99ba854d14ce41b2849ba0bbf5c50e522`](https://github.com/ChronoAIProject/fkst-hosted/commit/c79d11d99ba854d14ce41b2849ba0bbf5c50e522)
>
> Live status overlay（2026-08-21）：当前远端 `feat/local-qa-runtime@bd2a52b53dd486fea3f307bc937e3fa803eaf3bf`；`develop@5af95163cbcdad5dcffac1cc17418bc5417ba98c`。Live branch 仍相对 `develop` 明显分叉；本文结论不得外推为主线能力。`#6009` Journal v4 reopen issue 已 closed/completed；pinned `c79d11d` 的 reopen defect 只作为历史证据，live `bd2a52b` 是否完成修复仍须以代码和 reopen tests 复核，issue 状态本身不构成实现证据。
>
> 规范性边界：`fixtures/local-qa-host-mvp-contract-v1.json` 和 `fixtures/local-qa-host-mvp-failpoint-matrix-v1.json` 当前标记为 `draft`、`normative=false`、`completion_gate=MVP-A0`。它们是 seed corpus，不是已通过的 production conformance gate。
>
> 实际代码位置：`apps/local-qa-runtime` 和 `packages/qa-contracts`。当前产品进程为 **Local QA Host**，Rust package/executable 为 `fkst-local-qa-host`；目录中同时保留未来 Hardened Runtime 的 inert shells。
>
> Target Profile：`local_qa_agent_mvp`。Target 架构见 [Talos Testing Tool 最小 MVP 设计](../design-proposals/talos-testing-tool-mvp-design.zh-CN.md)；本地执行规范仍参考 [Local QA Host MVP 设计](../local-qa-host-mvp-design.zh-CN.md)。
>
> Talos Tool/QARun/attempt/fence 缺口见 [talos 详细缺口](talos-gap-analysis.zh-CN.md)；PQL client/运行投影见 [product-quality-loop 详细缺口](product-quality-loop-gap-analysis.zh-CN.md)；Hosted Authorization 和最小 ArtifactStore 是 **Proposed / Decision pending** 的 MVP 候选外部依赖，详见 [边界决策提案](../design-proposals/hosted-authorization-artifact-boundary-decision.zh-CN.md)；Final Quality/Report/Settlement 属于 Post-MVP。

## 0.0 AI 直接执行结构化测试用例

Target 执行模型不是“生成测试脚本后运行”，而是：

```text
immutable structured TestCase
  -> Testing Packages TestCaseExecutionEngine / TestingAgentLoop
  -> ModelInferencePort
  -> strict typed tool call
  -> Local QA Runtime typed tool broker
  -> bounded sanitized ModelObservation
  -> next AI turn
  -> deterministic AssertionReducer
  -> CaseResultSet + EvidenceManifest + ResultAuthorityReceipt
```

Local QA Runtime 不调用模型、不解释断言、不生成代码或脚本。它提供通用 Run/Attempt/Resource/Executor/ModelObservation/Evidence/Cleanup Core，并对每次工具调用执行权限、预算、取消、deadline、attempt/fence 和 ownership 检查。Browser 只是第一种 Executor；API、CLI、Mobile 等后续 Executor 必须复用同一 Core contract。

执行路径禁止：

- 生成、保存或运行中间测试脚本；
- 任意 Shell、argv、解释器 eval、动态 import/plugin 或运行时安装 package；
- raw CDP、任意 filesystem/network 和 caller-supplied executable；
- 把模型文本、hidden reasoning 或 Browser action success 直接当作 passed。

## 0. 2026-08-20 Talos adapter 边界校正

### 0.1 推荐接入路径

```text
NyxID / Talos Testing Tool
  -> Talos QARun / TestingAttempt
  -> talos-worker TestingExecutor
  -> Talos-owned LocalQARuntimeAdapter (loopback or Unix socket)
  -> Local QA Runtime generic Core / typed tool broker
  -> Testing Packages TestCaseExecutionEngine / TestingAgentLoop
  -> Runtime-owned Browser/API/CLI tool adapters + Evidence/Cleanup
```

Talos 拥有 QARun、placement、lease/generation/fence 和 current-claim authority；被接受决策指定的 Authorization Authority 签发 operation-specific business authorization。Talos Worker owns the production `TestingExecutor` and `LocalQARuntimeAdapter`; Runtime exposes the versioned local surface. Local QA Runtime owns generic admission, Run/Attempt/Resource/Executor state, ModelObservation sanitization, Evidence, Journal, Cleanup and local execution facts. Testing Packages owns the AI test-case loop and CaseResult semantics. Runtime does not call the model, interpret assertions, or generate scripts.

### 0.2 本轮核实状态

- Live branch `feat/local-qa-runtime@bd2a52b53dd486fea3f307bc937e3fa803eaf3bf` 已超出 pinned `c79d11d` Baseline；`PassingExecutor`、inert admission、cancel/recovery 和 AI/tool loop 必须逐项按 live head 复核。
- Pinned Baseline 的 Host 只接受 `{"kind":"inert"}`，production 使用 `PassingExecutor`，并在没有真实 effect 时写入 evidence/upload/terminal 状态。
- `#6009` Journal v4 reopen 已 closed/completed；当前文档保留该问题作为历史 Baseline 证据，不把 issue 关闭本身当作代码验证。
- 执行中 cancel、executor error、restart stranded attempt、通用 AI/tool loop、Talos adapter 和 decision-pending Authorization/Artifact 接线仍是 Target/Candidate。
- Browser adapter、Worker protocol、Evidence stager、Environment ownership 都是可复用组件，但当前 Host 没有 production peer；`qa.local-worker-protocol/v1` 也缺 deadline、heartbeat、cancel、cleanup/fence 语义。
- Talos 线上服务已激活并支持 proxy-compatible worker body credentials、single-action interactive session 和 worker v0.5.0；这些是 adapter substrate，不是 Testing Tool 已完成的证据。

### 0.3 Runtime 直接缺口

**P0：** 重新审计 live head；定义通用 Runtime Core、Executor/model/tool identity、ModelObservation、typed tool broker 和 AI-session-facing admission；接通真实执行、取消、失败恢复和 canonical result commit。Business authorization、Talos current claim 与最小 Artifact delivery 是条件性 P0：先通过 Hosted owner/认证/storage decision gate。Pinned Baseline 的 Journal v4 reopen 只作为历史验证项。

**P1：** Source/workspace、Environment/readiness、Browser infrastructure assembly、sanitized Evidence、Artifact delivery、安装运维和跨 Executor conformance。

**明确不归 Runtime：** Talos QARun/placement/lease/fence 与生产 `LocalQARuntimeAdapter`、被接受 owner 的 authorization/Artifact service、PQL selection、Testing Packages 的 AI TestCaseExecutionEngine/AssertionReducer 和 Hosted Quality/Report/Settlement。

## 1. 执行摘要

当前分支不是一条可运行的 Local QA MVP，而是若干已经通过组件测试的 walking skeleton：

- Host loopback API、SQLite acceptance、Snapshot、Events 和 execution-attempt claim 已经激活。
- Browser adapter 能真实启动隔离的系统 Chrome、访问固定 loopback fixture、截图并清理进程和临时目录。
- TypeScript Worker 有严格的 fixed browser-smoke policy 和 bounded framed protocol。
- Evidence stager 能把 bounded bytes 原子写入本地目录并验证 digest。
- Rust/TypeScript `qa-contracts` 已有 lifecycle、Evidence、Worker protocol 和 canonical digest 基础。
- ownership 模块已有 durable intent、stable provider key、labels 和 handle binding。

Pinned `c79d11d` Baseline 的这些能力没有被 production Host 串联，并存在 Journal v4 reopen bug。该缺陷已由 #6009 标记 closed/completed，但 live `bd2a52b...` 必须通过代码和 reopen tests 重新验证；本文不再把它作为未经验证的当前第一 blocker。

当前真实生产路径是：

```text
PUT {"kind":"inert"}
→ SQLite acceptance
→ Coordinator claim
→ PassingExecutor
→ synthetic state transitions
→ terminal / passed
```

它不是：

```text
authorized Run
→ exact Source / Environment
→ Worker
→ Chrome
→ AssertionResult / CaseResult
→ Evidence
→ Cleanup
→ Upload / Report handoff
```

### 1.1 两个最早的断点

1. **外部第一个断点：request 仍是 inert fixture。** Host 只接受 `{"kind":"inert"}`，使用固定 request digest，没有 Source、Plan、Environment Profile、Talos task/attempt、generation/fence、deadline 或 active-slot contract。
2. **内部第一个断点：Host hard-wire `PassingExecutor`。** Executor 不启动 Worker、Chrome、项目、Evidence 或 Cleanup，直接返回 `passed`。Coordinator 随后仍写入 `staging_evidence`、`uploading` 和 `terminal`，因此这些状态目前不是对应 effect 已发生的证明。

### 1.2 结论

当前状态可以准确描述为：

> **组件级基础较强，但 production vertical slice 缺失。没有任何现有命令能从 Host submit 开始，真实执行 Worker、Chrome、测试判定、Evidence、Cleanup，并得到持久化 terminal result。**

当前最早的真实阻塞不是缺少更多组件 fixture，而是：Host 仍接受 inert request，生产路径仍使用 `PassingExecutor`，并把 synthetic `passed` 推进成 evidence/upload/terminal 状态。必须先建立 Host-owned execution spine，才能把后续 contract 和 recovery 变成真实 effect 的约束。

最短路线不是重写 Browser、Worker 或 Evidence，而是先建立 Host-owned execution spine，把现有组件接成第一条诚实可执行链路；随后再接 exact Source、受控 Environment/readiness、Testing Packages、Talos adapter、恢复和 Artifact 交付。

### 1.3 MVP 分层与证据门槛

Local QA Runtime 的“可用 MVP”需要拆成四个不能互相替代的 gate：

| Gate | 目标 | 当前状态 | 不能推出的结论 |
| --- | --- | --- | --- |
| `MVP-0A` Browser assembly | Host acceptance → real Worker → Chrome → Evidence → exact Cleanup → durable terminal | 未完成；production 仍为 `PassingExecutor` | 不证明 AI TestCase、AssertionReducer 或 Talos canary |
| `MVP-0B` Runtime Core | strict admission、Source/Environment、cancel/deadline、restart/reconcile、OwnedHandle 和正交 Outcomes | 未完成；多项仍为 absent/disconnected | 不证明 Testing Packages semantic engine 已接通 |
| `MVP-0C` AI Test Execution | Testing Packages adapter、ModelInferencePort、sanitized Observation、typed tools、AssertionReducer、CaseResult authority | 未完成；当前没有 Runtime production peer | 不证明完整 PQL/Talos/Artifact vertical slice |
| `MVP-1` Cross-repo Browser canary | PQL → NyxID → Talos → Worker → Runtime → Testing Packages → Artifact/terminal refs | 外部 conditional target | 不属于 Local QA Runtime 单 repo 可独立完成 |

`MVP-0A` 的 fixed Browser smoke 是 infrastructure assembly gate；`MVP-0C` 才是 AI TestCase semantic gate。不能用 fixed smoke、fake Executor、draft fixture 或组件测试代替另一层的通过证据。

固定 Baseline 关键证据：

- [`apps/local-qa-runtime/README.md`](https://github.com/ChronoAIProject/fkst-hosted/blob/c79d11d99ba854d14ce41b2849ba0bbf5c50e522/apps/local-qa-runtime/README.md)
- [`host/src/coordinator.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/c79d11d99ba854d14ce41b2849ba0bbf5c50e522/apps/local-qa-runtime/host/src/coordinator.rs)
- [`host/src/journal.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/c79d11d99ba854d14ce41b2849ba0bbf5c50e522/apps/local-qa-runtime/host/src/journal.rs)
- [`host/src/executor.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/c79d11d99ba854d14ce41b2849ba0bbf5c50e522/apps/local-qa-runtime/host/src/executor.rs)
- [`browser-adapter/src/lib.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/c79d11d99ba854d14ce41b2849ba0bbf5c50e522/apps/local-qa-runtime/browser-adapter/src/lib.rs)
- [`evidence-stager/src/lib.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/c79d11d99ba854d14ce41b2849ba0bbf5c50e522/apps/local-qa-runtime/evidence-stager/src/lib.rs)
- [`workers/src/protocol-worker.ts`](https://github.com/ChronoAIProject/fkst-hosted/blob/c79d11d99ba854d14ce41b2849ba0bbf5c50e522/apps/local-qa-runtime/workers/src/protocol-worker.ts)

## 2. 当前可执行能力地图

| 能力 | 当前入口和实现 | 当前验证 | production Host 是否调用 | 当前结论 |
| --- | --- | --- | --- | --- |
| Host startup / loopback API | `host/src/main.rs`、`host/src/lib.rs`；`local-demo`；health/submit/get/events/cancel | `host/tests/fail_closed.rs`、`host/tests/loopback_sqlite.rs` | 是 | API 和 bounded HTTP 基础可用，但只接受 inert request |
| SQLite acceptance / replay | `host/src/journal.rs`；WAL、accepted request、Run、Event、cancel intent、attempt | restart/replay/race tests | 是 | acceptance skeleton 可用，未实现真实授权、nonce、active slot 和完整 Outcomes |
| Coordinator | `host/src/coordinator.rs` | blocking/fake executor tests | 是 | 能 claim 和推进固定状态，但 Event sequence 和流程是 synthetic |
| Runtime Core / Executor dispatch | `host/src/executor.rs`、`coordinator.rs` 的 `PassingExecutor` | fake passing path | 是 | 通用 Core 尚未接入真实 Executor；无 I/O，不能证明发生过 QA |
| Browser Executor adapter | `browser-adapter/src/lib.rs` 的 `run_fixed_browser_smoke()` | 真实系统 Chrome component smoke | 否 | Browser infrastructure component 可用；不是 AI conformance，也不是 CaseResult authority |
| ModelInference adapter / AI TestCaseExecutionEngine | 当前没有 Runtime production peer | 无 | 否 | Target：Testing Packages 拥有 AI loop，Runtime 只提供 provider egress/typed tool ports |
| LocalQARuntimeAdapter | Talos worker-side target，Runtime 仅提供 local wire surface | 无 | 否 | 生产 adapter 属 Talos，不应由 Runtime 复制或直连 Talos public API |
| Worker policy | `workers/src/policy.ts` | pure policy tests | 否 | 能校验固定请求、引用和 assertion；不是完整 Testing Packages runner |
| Worker process protocol | `workers/src/protocol-worker.ts`、`worker-main.ts` | fragmented framing/process acceptance | 否 | 七个 capability exchange 已定义；production Host peer 不存在 |
| Evidence stager | `evidence-stager/src/lib.rs` | runner-log stage/verify tests | 否 | bounded atomic filesystem primitive 可用；当前对象明确为 `local-only:not-uploadable`，没有 Host integration、manifest 或 upload client |
| Shared contracts | `packages/qa-contracts` registry、Rust/TypeScript validators | parity、fixture、negative tests | 部分 | 有基础 scalar/ref/protocol；缺完整 Run/admission/resource/result/upload contract |
| launcher/supervisor/guest-agent/secret-broker | 各自 `src/main.rs` | scaffold ratchet | 否，且不得调用 | 未来 Hardened Profile 的 inert shells，不是 MVP 能力 |

### 2.1 已经可以运行的组件验证

Rust workspace：

```bash
cd apps/local-qa-runtime
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo build --workspace --locked
cargo test --workspace --locked -- --nocapture
```

Worker：

```bash
cd apps/local-qa-runtime/workers
npm ci --ignore-scripts
npm run --ignore-scripts typecheck
npm run --ignore-scripts build
npm run --ignore-scripts test
```

Shared contracts：

```bash
npm --prefix packages/qa-contracts ci --ignore-scripts
npm --prefix packages/qa-contracts run --ignore-scripts typecheck
npm --prefix packages/qa-contracts run --ignore-scripts build
npm --prefix packages/qa-contracts run --ignore-scripts test
```

真实 Chrome component smoke：

```bash
cd apps/local-qa-runtime
cargo test --locked -p fkst-local-qa-browser-adapter \
  real_browser_walks_fixed_fixture_and_cleans_owned_resources -- --nocapture
```

这些命令证明组件可构建、协议 fail closed、Chrome 可启动、Evidence 可原子写入。它们**不证明** `Host → Worker → Chrome → Evidence → Journal`，更不证明 Hosted/NyxID/Source/Compose/upload/report 全流程。

### 2.2 CI 已覆盖和未覆盖

PR #5965 的 Rust lint/build/test、Docker build 和 gitleaks 已通过。`rust-ci.yml` 还覆盖：

- Local QA Rust fmt、clippy、build、workspace tests。
- macOS arm64 和 Windows compile check。
- TypeScript contract typecheck/build/tests。
- Worker typecheck/build/process tests。
- scaffold/source/dependency ratchet。
- 有 allowlisted Chrome 的 Linux runner 上执行真实 Chrome test。

CI 尚未覆盖：

- Host 调用 Worker、Browser adapter 或 Evidence stager。
- exact Source checkout、Environment Profile、Compose 和 readiness。
- Testing Packages Browser route 和 canonical CaseResult。
- cancel/timeout/Worker crash/Chrome crash/Host kill 的统一 Cleanup。
- restart-to-`lost`、stable-key discovery 和 no-rerun。
- NyxID transport、双层授权、Artifact upload、Quality 和 Report。

## 3. 当前端到端路径在哪里断

| 阶段 | 状态 | 当前事实 | 缺口 |
| --- | --- | --- | --- |
| Talos QARun / TestingAttempt | `absent` | Runtime 没有 Talos adapter 或 attempt context | Tool API、placement、lease、generation、fence 由 Talos 实现；Runtime 只做本地 admission |
| NyxID / Talos delivery | `absent` | Host 只有无认证 loopback API | production worker adapter、local credential、machine/runtime binding 和 bounded transport mapping |
| Host admission | `skeleton` | inert JSON、固定 digest、SQLite acceptance/replay | 完整 request、strict canonical projection、签名、nonce、single-active transaction |
| Source/workspace | `absent` | 无 Source input 或 workspace manager | exact object/digest、per-run workspace、ownership/reconcile |
| Compose/readiness | `absent` | 无 Environment Profile 或 service lifecycle | controlled Compose、loopback ports、budgets、typed ReadinessReceipt |
| Worker process | `implemented but disconnected` | framed protocol 和 process test 已有 | Host spawn/supervise、stdio bounds、deadline、cancel、terminal validation |
| Browser tool adapter | `implemented but disconnected` | fixed adapter 可启动真实 Chrome | Host capability peer、目标 URL/action 输入、durable generic Executor ownership |
| AI interpretation/tool loop | `absent` | 没有 ModelInferencePort、TestingAgentLoop、tool ledger 或 strict model-call peer | Testing Packages 直接解释 immutable TestCase；Runtime 提供 typed tool broker 和 sanitized ModelObservation |
| Assertion/CaseResult | `partial and disconnected` | fixed Worker 只支持单一 READY smoke | deterministic/model-judged evaluator + AssertionReducer；Browser/AI 只提出事实和结构化 verdict |
| Evidence | `implemented primitive but disconnected` | stager 只写 LocalEvidenceObject | sanitized observation、screenshot/JSON manifest、policy、Journal refs |
| Cleanup | `component-local only` | Browser adapter 能清自己的资源 | Run-wide Chrome/Worker/Compose/workspace/quarantine exact cleanup 和 receipt |
| Upload | `absent` | 无 grant/client/attempt | cleanup-before-upload、stable object key/digest、lost-ack/TTL reconcile |
| Hosted report handoff | `absent` | 无 ingestion projection | CaseResultSet、EvidenceManifest、CleanupReceipt、ReportInputSet |

### 3.1 当前状态机会制造错误事实

`RunCoordinator` 在 `Executor::execute()` 返回后，无条件推进：

```text
executing
→ staging_evidence
→ cleaning_up_execution
→ uploading
→ finalizing_local
→ terminal
```

但 `PassingExecutor` 没有产生 Evidence、Cleanup 或 Upload effect。这导致：

- `passed` 不是测试判定，只是 fake executor 返回值。
- `staging_evidence` 不代表存在 staged object 或 manifest。
- `uploading` 不代表申请过 grant 或写入 upload attempt。
- `terminal` 没有四类正交 Outcomes，也没有 CleanupReceipt。

在真实 executor 接入前，应避免把当前 nine-state test 当作 MVP lifecycle 已实现。

### 3.2 Cancel 不收敛

当前 cancel 只覆盖 durable intent 的一部分：

- claim 前 cancel 会写 `cancel_requests` 和 Event，但 Run 不进入 `cancelled/terminal`；`claim_next()` 又会排除它，因此可能永久停在 `accepted`。
- execution attempt 已存在时，`journal.cancel()` 返回 `ActiveAttempt`；HTTP 只映射成通用 journal failure。
- 没有停止 Worker、Chrome、Compose 或后续 action 的信号。
- 没有 CleanupReceipt、cancelled outcome 或 residual disposition。

### 3.3 Executor error 不收敛

如果真实 executor 返回 error，当前 coordinator 会直接退出：

- 不写 failed/lost outcome。
- 不追加安全 failure Event。
- 不进入 compensation/cleanup。
- Host 主循环随后观察 coordinator 退出并停止服务。

真实执行器接入前必须先定义 error-to-outcome 和 mandatory cleanup 路径。

### 3.4 Restart 后 attempt 会 stranded

`claim_next()` 只选取 `accepted` 且没有 `execution_attempt` 的 Run。Host 在 claim 后崩溃时：

- attempt 保持 `claimed`。
- Run 可能停在 `preparing` 到 `finalizing_local` 任一状态。
- restart 不会 reclaim、标记 `lost` 或恢复 Cleanup。
- 旧 Browser Case 不能重跑，但当前也没有 reconcile/terminal closure。

## 4. P0：Pinned Baseline 缺陷与 Target 正确性/协议缺口

### 4.1 Journal schema v4 reopen（Pinned Baseline defect；live status 需复核）

[`host/src/journal.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/c79d11d99ba854d14ce41b2849ba0bbf5c50e522/apps/local-qa-runtime/host/src/journal.rs) 的 migration 会把 `user_version` 设置为 4，但 migrate/reopen 分支没有把 version 4 作为成功状态接受。结果是：

- 首次初始化可能成功。
- 正常重启后打开同一个 Journal 可能失败。
- restart/reconcile、cancel recovery 和 terminal replay 无法建立可信基线。

修复要求：

- version 4 reopen 幂等成功。
- 每个历史 version 都有显式、事务化 migration。
- migration 失败前不得开放 admission。
- migration/reopen/restart 必须进入自动测试，而不是只测 fresh database。

### 4.2 Startup reconcile 和正交 terminal outcomes

启动顺序必须固定为：

```text
close admission
-> migrate
-> discover owned resources and claimed attempts
-> reconcile lease/generation/fence
-> stop or cleanup unsafe attempts
-> freeze lost/cancelled/timed_out outcomes
-> reopen admission
```

至少需要可持久化：

```text
control_status
execution_outcome
evidence_outcome
upload_outcome
cleanup_outcome
```

`terminal` 不能继续作为一个同时暗示 passed、Evidence 完整、upload 完成和 Cleanup 成功的单值状态。

### 4.3 `qa.local-run-admission/v2`

Runtime admission 需要绑定：

```text
run_id / task_id / attempt_id
machine / worker / installation / runtime-instance identity
generation / fence token / signed lease claim ref
deadline
exact source ref/digest
structured TestCase set / input ref/digest
approved tool catalog / policy ref/digest
executor_id / executor_version / capability_digest
model inference adapter identity/version
prompt / harness / evaluator refs/digests
testing package or data-bundle manifest ref/digest
environment profile ref/digest
policy / approval scope / durable budgets
request digest / idempotency key
local credential identity
LocalQARequestAuthorization ref/digest/full signed object
authorization issuer/key ID/operation/method/path/body digest/nonce/expiry
```

所有验证必须发生在 workspace、process、port、model call、tool effect、Chrome 或 Evidence staging effect 之前。Runtime 必须独立验证 local credential、operation-specific authorization signature/revocation/replay、Talos current-claim/fence、runtime/executor identity、tool catalog、model/prompt/harness identity 和 durable budget；任一验证不可用或不一致时 fail closed。Runtime 不保存 NyxID bearer、Talos worker token、raw `lease_token`、provider secret 或 raw prompt/observation，只持久化 bounded refs/digests、accepted identity 和 receipts。

### 4.4 Worker protocol 缺少 deadline、heartbeat 和 cancel

当前 [`protocol-worker.ts`](https://github.com/ChronoAIProject/fkst-hosted/blob/c79d11d99ba854d14ce41b2849ba0bbf5c50e522/apps/local-qa-runtime/workers/src/protocol-worker.ts) 只有一次 invocation、顺序 capability exchange 和 terminal result。需要补齐：

- invocation deadline 和 per-effect timeout。
- heartbeat/liveness。
- cancel/abort frame。
- bounded stderr/stdout drain 和 EOF timeout。
- typed infrastructure failure 与 protocol violation。
- cleanup/finalization result。
- stale generation/fence 的 point-of-use 拒绝。

不能只依赖杀进程；协议应允许 Testing Packages 停止生成新 action，并让 Runtime 精确清理已拥有资源。

### 4.5 AI Test Session、Bounded Tool Broker 和 Result Commit

目标接线必须区分：

- Talos Worker 的固定 `TestingExecutor`：由 Talos owning repo 实现 claim projection、heartbeat、cancel、deadline、bounded result projection。
- Talos worker 侧 `LocalQARuntimeAdapter`：调用 Runtime submit/get/events/cancel；Runtime 只提供 local wire surface。
- Local QA Runtime Core：验证 admission、executor/tool identity、预算、cancel/deadline/fence，执行 typed tool effect，生成 sanitized ModelObservation，持久化 receipts、Evidence、Cleanup 和 recovery facts。
- Testing Packages 的 `TestCaseExecutionEngine / TestingAgentLoop`：直接读取 immutable structured TestCase，维护 model turns，选择 strict typed tools，接收 ModelObservation，并提出结构化 assertion/result。
- deterministic `AssertionReducer`：验证 tool receipts、Observation/Evidence binding 和 evaluator output，签发 canonical CaseResult/ResultAuthorityReceipt。

Runtime 不复制 assertion/domain logic、不调用模型、不生成脚本；Worker 不直接打开 Chrome；Testing Packages 不拥有 Talos lease 或本机资源。任何 AI tool call 都必须通过 closed tool catalog 和 Runtime point-of-use authorization。

### 4.6 当前 P0 退出条件与 owner backlog

在进入完整 MVP 前，以下条件必须逐项完成：

- **真实 admission：** 替换 inert body，接收 strict、bounded、digest-bound 的 Run request；在 local credential、operation-specific authorization、Talos current-claim、Source/Plan/Environment/package/executor identity、nonce/idempotency 和 single-active transaction 全部通过后，才允许创建本地资源。
- **真实 executor：** 生产路径移除 `PassingExecutor`；由 Host-owned executor spawn/supervise Worker，连接 Browser adapter、Evidence stager 和 Cleanup manager。`PassingExecutor` 只能作为 test fake。
- **错误收敛：** Worker/protocol/executor/Chrome/Evidence/cleanup error 都必须落到 bounded Outcome、Event、CleanupReceipt 或 blocking residual，不能直接退出 coordinator。
- **取消与 deadline：** cancel intent 先入 Journal，再拒绝新 effect、signal Worker、停止 Browser/Compose/process tree、完成 cleanup；`CancelAck` 不等于停止完成。
- **重启恢复：** startup 关闭 admission，迁移 Journal，发现 attempt/resource，按 stable key 和 ownership reconcile；effect 可能已发生时固定为 `lost_or_inconclusive`，禁止自动重跑。
- **Worker protocol：** 补齐 absolute deadline、per-effect timeout、heartbeat/liveness、cancel/abort frame、bounded stdout/stderr、cleanup acknowledgement 和 stale generation/fence rejection。
- **Source/Environment：** exact Source、per-run workspace、versioned Environment Profile、controlled Compose、typed readiness、loopback port ownership 和 resource budgets 必须成为真实 Host path。
- **AI semantic gate：** Runtime 只能通过 resolved package/executor identity、`TestingPackageExecutor`、ModelInferencePort、sanitized ModelObservation 和 typed capability ports 接入 Testing Packages；CaseResult、EvidenceManifest、ResultAuthorityReceipt 和 AgentTurnLedger 必须真实持久化。

已有 hosted owner-side backlog：[#5977](https://github.com/ChronoAIProject/fkst-hosted/issues/5977) Browser Executor assembly、[#6010](https://github.com/ChronoAIProject/fkst-hosted/issues/6010) durable cancellation、[#6011](https://github.com/ChronoAIProject/fkst-hosted/issues/6011) failure/timeout/restart reconciliation、[#6012](https://github.com/ChronoAIProject/fkst-hosted/issues/6012) strict admission v2、[#6020](https://github.com/ChronoAIProject/fkst-hosted/issues/6020) generic Runtime Core。它们是实现 backlog，不是当前代码已完成的证据。

## 5. MVP-0：先建立第一条诚实的本地 E2E

MVP-0 的目标是让一个 hermetic Browser Run 从 Host submit 真正走到 terminal。它是完整 MVP 的本地执行基线，不代表 NyxID、生产授权、安装分发、云端 upload/report 已完成。

```text
canonical structured TestCase request
→ atomic local acceptance
→ digest-bound fixture Source / Environment
→ Testing Packages TestCaseExecutionEngine / TestingAgentLoop
→ ModelInferencePort
→ strict typed tool call
→ Runtime tool broker / selected Executor
→ bounded sanitized ModelObservation + effect receipt
→ deterministic AssertionReducer
→ CaseResultSet + EvidenceManifest + ResultAuthorityReceipt
→ exact execution Cleanup
→ durable AgentTurnLedger / Snapshot / Events / Outcomes
```

### 5.1 `MVP-0A`：Browser infrastructure assembly gate

在完整 AI TestCaseExecutionEngine 接入前，保留固定 browser-smoke 作为 **Browser infrastructure assembly gate**。它只证明 Host/Worker/Chrome/Evidence/Cleanup 基础，不证明 AI 能解释 TestCase，也不证明 tool-use Target 已完成：

```text
HTTP submit
→ SQLite
→ real fixed Host executor
→ spawn fkst-local-qa-worker
→ service seven capability requests
→ run_fixed_browser_smoke()
→ EvidenceStager
→ persist Worker result and Evidence refs
→ terminal Snapshot / Events
```

该增量应：

1. 用 Host-owned executor 替换 production `PassingExecutor`。
2. 让 `host/Cargo.toml` 依赖 Browser adapter 和 Evidence stager。
3. 启动 `fkst-local-qa-worker`，限制 executable/version/digest、stdin/stdout frame、stderr、deadline 和 process group。
4. 实现协议中的 clock、`browser-session.run/v1`、`browser-session.close/v1` 和 Evidence capability。
5. 从 Browser 结果构造 contract-valid `LocalSanitizedObservationRef` 和 screenshot Evidence ref。
6. 在 terminal commit 前持久化 Worker invocation/result、Evidence metadata/ref 和 execution outcome。
7. Worker、Browser 或 staging 失败时写非 passing outcome，并始终执行 Cleanup。
8. 增加真实 Host-process acceptance test，证明 Browser 和 Worker 只执行一次。

这条 assembly gate 仍是固定 infrastructure fixture，不是 AI/tool-use conformance，也不能声称测试语义已闭合；它只消除当前最严重的问题：Host 声称 passed，却从未执行任何真实 effect。

`MVP-0A` 的退出条件是：生产不再使用 `PassingExecutor`；真实 Worker、Chrome、Evidence 和 Cleanup 每个 effect 都有可验证计数；success/failure/crash/timeout 都产生独立 Outcome；Host kill/restart 不重复 Browser effect；每条路径都有 CleanupReceipt 或 blocking residual。

### 5.2 `MVP-0B`：Runtime Core correctness

在 assembly gate 后，必须把 fixed fixture 替换为真实 Runtime Core 入口，并完成：

- strict Run admission、local credential、business authorization、current-claim、nonce/idempotency 和 active slot；
- exact Source、per-run workspace、Environment Profile、Compose/readiness 和 loopback port ownership；
- cancel/deadline、executor error、Host restart、stranded attempt、OwnedHandle 和 cleanup reconcile；
- 四类正交 Outcomes、bounded SafeError、Snapshot/Event/cursor integrity；
- profile 名称统一为 `local_qa_agent_mvp`；旧 `local_qa_host_mvp` 只能由 compatibility reader 接受，不能作为新 admission output。

`MVP-0B` 的退出条件是：真实项目能够完成 pass、assertion failure、readiness timeout、cancel、Chrome crash、executor error、Host kill/restart；不重复执行、不跨 Run 清理，且每条路径都有持久化 Outcome 与 CleanupReceipt/residual。

### 5.3 `MVP-0C`：AI Test Execution gate

只有 Runtime Core correctness 通过后，才接入 Testing Packages semantic engine：

```text
resolved package/executor identity
→ TestingPackageExecutor
→ immutable TestCase + StructuredPlan
→ ModelInferencePort
→ closed typed tool
→ Runtime capability broker
→ sanitized ModelObservation + effect receipt
→ AssertionReducer
→ CaseResultSet + EvidenceManifest + ResultAuthorityReceipt
```

必须覆盖 unknown/malformed tool、prompt injection、refusal/timeout/truncation、budget exhaustion、forged receipt、AgentTurnLedger replay 和 action 后 assertion 前的 `lost_or_inconclusive`。这一 gate 不应由 fixed Browser smoke 或 fake Executor 代替。

### 5.4 `MVP-0B/0C` 的组合退出条件

Source、Compose、Testing Packages 和 Run-wide ownership 已分别列入 `MVP-0B`、`MVP-0C`；这里不再把它们重复计为 assembly gate。组合退出条件是：

- exact immutable Source Object 和 per-run workspace 不修改用户原 checkout；
- digest-bound Environment Profile 启动受控 Compose，并生成 typed readiness；
- `fkst-packages-testing` 的版本化 Browser/Assertion/CaseResult contract 通过 adapter 接入；
- Run-wide OwnedHandle 和 CleanupReceipt 覆盖 workspace、Compose、Worker、Chrome、Evidence staging；
- 任一 Source、readiness、Testing Packages 或 cleanup failure 都产生 bounded Outcome，且不重跑已发生的 effect。

只有 `MVP-0A`、`MVP-0B` 和 `MVP-0C` 全部完成，才可以称为“本地 MVP 流程跑通”。

## 6. 完整 MVP Gap Matrix

| 阶段 | 当前状态 | 目标能力 | 优先复用 | 退出标准 |
| --- | --- | --- | --- | --- |
| Contract convergence | scalar/ref/protocol 基础 | 通用 Run request、TestCase input、Executor/model/tool identity、AI session/result contracts、authorization/claim bindings、bounds/outcomes/errors/receipts | `qa-contracts` canonical/digest validators、MVP fixtures | Rust/TS 对合法、冲突、错误绑定、工具拒绝、预算耗尽和 failpoints 给出同一结果 |
| Runtime Core / tool broker | 未定义 | generic Run/Attempt/Resource/Executor/ModelObservation/Evidence/Cleanup Core | 当前 Journal、ownership、Browser infrastructure components | Browser 与 fake non-Browser Executor 复用同一 Core conformance |
| AI interpretation/tool loop | absent | TestingAgentLoop、ModelInferencePort、closed tool catalog、AgentTurnLedger、AssertionReducer | Testing Packages semantics、Runtime typed tool ports | 多轮 tool loop、replay、未知工具、prompt injection、refusal/truncation 全部 fail closed |
| Admission | inert body + fixed digest | local credential + decision-accepted authorization + Talos claim/fence + case-set/tool/executor/model identity + budgets/idempotency/deadline 原子提交 | 当前 WAL Journal/admit transaction | 任一 signature/claim/identity/capability mismatch 零 effect；第二 Run `device_busy` |
| Source/workspace | 无 | exact Source verify、cache/materialize、per-run workspace、OwnedHandle | Environment patterns，仅作为 Runtime adapter 参考 | wrong digest 执行前失败；不修改用户 checkout；restart 可识别 owned workspace |
| Environment/readiness | 无 | versioned profile、Compose、loopback ports、budgets、typed readiness | `environment-factory` 和 generic-host lifecycle | readiness failure 不启动 AI Case；所有已创建资源进入 Cleanup |
| Host-worker/tool peer | protocol only | spawn/supervise、typed tool dispatch、deadline/cancel、receipt validation | `qa.local-worker-protocol/v1` process harness | malformed/truncated/unknown tool/timeout/crash fail closed；结果持久化后才 terminal |
| Testing Packages integration | fixed smoke policy | TestCaseExecutionEngine/TestingAgentLoop、ModelObservation、AssertionResult、CaseResult、ResultAuthorityReceipt | `testing-runner` contracts and fake inference | Runtime 不复制 assertion logic；AI 文本不直接成为 passed |
| Browser ownership | adapter self-owned temp resources | Journal-owned browser attempt/process/profile/download handle | `run_fixed_browser_smoke()` 的 allowlist、process group、cleanup | Chrome crash/cancel/timeout/restart 不 attach 或重跑旧 Case |
| Journal/ownership | request/run/event/cancel/attempt | resource、environment/browser/worker/evidence/upload/cleanup attempts 和 residuals | 当前 single-writer SQLite | intent-before-effect；uncertain create 按 stable key reconcile；不猜测删除 |
| Cancel/timeout | intent 不驱动 effect | durable intent、stop new action、signal Worker、kill Chrome、stop Compose、Cleanup | Worker process/session close 和 Browser process-group control | 每个阶段 cancel/timeout 都形成 outcome + CleanupReceipt/residual |
| Restart recovery | claimed attempt stranded | admission gate、discovery、restart-to-lost、cleanup/upload reconcile、no-rerun | generic-host restart/replay acceptance | Host kill 后不重复 Case；known resource 精确清理；unknown ownership blocking residual |
| Evidence safety | local object staging primitive | bounded quarantine、safe projection、PNG/JSON validation、manifest、TTL | EvidenceStager atomic write/digest | raw data 不进入 Journal/Event/cloud；只有 screenshot + bounded JSON 可上传 |
| Cleanup-before-upload | 无 Run-wide cleanup | exact reverse cleanup、receipt、release active slot，再等待 cloud | Browser cleanup + environment cleanup patterns | Hosted 离线不阻塞本地 Cleanup 或 local terminal |
| Upload | 无 | per-object grant、stable object key/digest、attempt、lost-ack、expiry | Decision-pending MVP ArtifactStore primitives | response lost 不重复 Artifact；TTL 到期 `upload_expired` |
| Installation/pairing | `local-demo` 手工启动 | signed user artifact、LaunchAgent、pairing、local credential rotation/revoke/reset | 现有安装/credential PoC 经验 | 已安装 Host 只接受 loopback/socket adapter + local credential + signed authorization；不直接暴露 NyxID route |
| Artifact/Report handoff | 无 | MVP pointer-only result/evidence/cleanup projection；Post-MVP ReportInputSet | Testing Packages terminal projection、decision-pending Artifact ingestion | Artifact receipt 可交付；后续 Quality/Report repair 不重跑 Case |

## 7. 可实施工作包

依赖顺序：

```text
WP0
→ WP1
→ WP2 + WP3
→ WP4
→ WP5
→ WP6
```

### 7.1 WP0：通用 Core、TestCase、Tool 和 Result contract

交付：

- 通用 Run/Attempt/Resource/Executor/ModelObservation/Evidence/Cleanup contract。
- structured TestCase、Step、typed Tool、Assertion、EvidencePolicy、CleanupPolicy schemas。
- `executor_id/version/capability_digest`、ModelInference adapter identity 和 approved tool catalog。
- `ModelInferencePort`、strict tool-call/result schemas、capability intersection 和 bounded budgets。
- `AgentTurnLedger`、ResultAuthorityReceipt、CaseResultSet-EvidenceManifest binding。
- `qa.local-run-admission/v2`、RunAcceptance、Snapshot/Event/SafeError。
- Talos run/task/attempt、signed lease claim ref、generation、fence、deadline 和 current-claim resolver bindings。
- Decision-accepted `LocalQARequestAuthorization` ref/digest/full signed object、issuer/key/operation/request tuple、nonce/expiry/revocation contract；raw lease token 禁止进入 Runtime。
- Source、structured TestCase set、data-bundle manifest、Environment/Profile、Executor/model/tool/harness capability digest bindings。
- execution/evidence/upload/cleanup 四类正交 Outcomes。
- resource intent、OwnedHandle、attempt、CleanupReceipt 和 residual types。
- machine-readable payload/string/array/depth/Event/ModelObservation/Evidence/staging/TTL bounds。
- shared Rust/TypeScript fixtures、live-baseline overlay、reopen regression 和 failpoint expectations。

阻断条件：WP0 未冻结前，不应让 Runtime、Testing Packages、Talos 和模型 adapter 各自发明 TestCase/tool/identity/budget/result 字段。

### 7.2 WP1：AI Test Session 与 typed tool broker

交付：

- Runtime 提供通用 tool broker、ModelObservation sanitization、provider egress/privacy policy 和 local resource ports。
- Testing Packages 提供 `TestingAgentLoop`、模型 turn 状态、tool catalog、prompt/policy identity 和 deterministic AssertionReducer。
- Talos worker-side `TestingExecutor`/`LocalQARuntimeAdapter` 只作为外部 adapter 接入，不由 Runtime 实现。
- 生产执行禁止生成/运行脚本、任意 shell、eval、dynamic plugin、runtime package install。
- AI tool-call/receipt/observation/terminal ledger 持久化，budget 单调消耗。
- Browser fixed smoke 只作为 infrastructure gate；增加 fake non-Browser Executor fixture。

建议主要文件：

- `apps/local-qa-runtime/host/src/executor.rs`
- `apps/local-qa-runtime/host/src/coordinator.rs`
- `apps/local-qa-runtime/host/src/journal.rs`
- `apps/local-qa-runtime/host/src/lib.rs`
- `apps/local-qa-runtime/host/Cargo.toml`
- 新的 Worker peer / process supervisor module 和 Host integration test

### 7.3 WP2：Source 和 Environment

交付：

- exact Source Object acquisition 和 digest verification。
- per-run workspace 和 source cache ownership。
- versioned Environment Profile。
- controlled Compose project/network/volume/port。
- typed readiness、deadline 和 budgets。
- environment/resource intent 和 exact provider identity。

实现不得：

- 修改用户原 checkout。
- 接受 floating branch/image tag。
- 挂载 Home、SSH、Keychain、个人 Chrome、其他 repo 或 Docker socket。
- 对 unknown ownership 做模糊清理。

### 7.4 WP3：结构化 TestCase 和 AI Engine integration

不应在 Rust Host 中实现 TestCase 解释、模型 turn、tool selection、断言或 CaseResult 语义。优先复用 `fkst-packages-testing` 的数据和 contract 能力：

- data-only test bundle manifest：固定 TestCase/schema/contract identity、content digest 和 required typed-tool capabilities；不得携带脚本、代码、hooks 或动态 entrypoint。
- AI testing session input：绑定 Run/Attempt、structured TestCase set、Source、PQL InputSet、approved tool catalog、policy、budgets 和 deadline。
- `ModelInferencePort`：provider-neutral request/response、refusal/timeout/truncation/usage 和 bounded provider error。
- closed typed tool catalog：每个 tool 有 strict schema、allowlist、quota、point-of-use authorization、sanitized result 和 durable receipt。
- `TestingAgentLoop`：直接解释 TestCase，不生成中间脚本；用 ModelObservation 驱动下一 turn。
- deterministic/model-judged evaluator + `AssertionReducer`：AI 只能提出结构化 verdict，最终 CaseResult 必须由绑定和 invariant 校验确认。

Runtime 负责本机资源、tool effect、ModelObservation sanitization、ownership 和 cleanup；Testing Packages 负责 TestCase/Step/Assertion 语义、AI loop 和 canonical result proposal；Talos 负责 dispatch，不解释模型结果。

退出标准：

- AI 直接读取结构化 TestCase；无 generated script/code/plugin/shell execution。
- tool catalog unknown/malformed/越权参数零 effect 拒绝。
- model/prompt/tool/harness identity 与 AgentTurnLedger、CaseResult、Evidence 绑定。
- 每个声明 Case 都有 CaseResult 或 bounded non-execution reason。
- malformed、truncated、unknown-version、refusal、budget exhaustion 或 contradictory result fail closed。

### 7.5 WP4：Ownership、Cancel、Cleanup 和 Restart

需要增加 Journal 表或等价持久对象：

- `resources`
- `environment_attempts`
- `executor_attempts`（Browser/API/CLI-specific state belongs behind the adapter）
- `worker_attempts`
- `model_turns`
- `tool_call_attempts`
- `evidence_attempts`
- `cleanup_attempts`
- `upload_attempts`
- `nonce_records`
- `active_slots`
- `residuals`

规则：

1. effect 前写 intent。
2. create 成功但 identity 未写回时，以 stable provider key 和 ownership label reconcile。
3. cancel/timeout intent 先持久化，再停止新 model turn、tool call、Executor effect，并 signal Worker。
4. success/failure/cancel/timeout/crash 都进入 exact Cleanup。
5. restart 先关闭 admission，再 migrate、discover、reconcile、cleanup，最后开放 admission。
6. interrupted model turn 在 target effect 前可按 ledger policy 重放；effect 后 assertion 前标记 `lost/inconclusive`，禁止自动重跑 Case。
7. identity mismatch 或 unknown ownership 形成 blocking residual，禁止猜测删除。

### 7.6 WP5：Evidence pipeline

MVP 可上传 Evidence 只允许：

- `image/png` screenshot。
- bounded sanitized JSON。

固定流程：

```text
raw provider observation
→ bounded local quarantine
→ pre-model sanitization/redaction
→ bounded ModelObservation
→ TestingAgentLoop context
→ typed tool/effect receipt
→ safe Evidence projection
→ media/size/schema/canary validation
→ post-redaction digest
→ EvidenceManifest
→ sanitized staging
```

当前 Worker/Evidence stager 的 `runner.log` + `text/plain` 可保留为 local-only diagnostics，但不能被计入 MVP uploadable Artifact set，也不能替代 bounded JSON result。

需要新增：

- `ModelObservation` 的 pre-model 构造、字段 allowlist、敏感信息清除和持久 digest。
- screenshot dimension/size validator 和 model-visible media policy。
- bounded JSON/tool-result schema/size validator。
- RedactionReceipt、InferenceEgressReceipt 和 canary corpus。
- per-turn/per-tool/per-attempt/per-Run staging quota。
- EvidenceManifest、CaseResultSet binding、retention 和 TTL。
- `AgentTurnLedger` 与 tool/effect receipt lineage。

### 7.7 WP6：Delivery 和 production entry

本地顺序固定：

```text
Evidence validation complete
→ terminate Worker / selected Executor resources
→ cleanup Compose / ports / workspace / raw quarantine
→ write CleanupReceipt
→ release execution slot only if cleanup is complete or authority-backed isolation is proven
→ request delivery grant
→ upload or reconcile
```

交付：

- per-object grant client。
- stable object key + digest retry/reconcile。
- bytes stored/ack lost 的 receipt lookup。
- local terminal while Hosted unavailable。
- sanitized staging TTL 和 `upload_expired`。
- signed Host artifact、LaunchAgent、pairing 和 credential lifecycle。
- LocalQARuntimeAdapter 的 loopback/Unix-socket transport mapping；Runtime 不暴露 NyxID public route。
- Hosted decision gate 接受后的 MVP Artifact ingestion receipt 和 pointer-only terminal handoff；Quality/Report handoff保持 Post-MVP。

Local Host 不决定 `report_impossible`。Hosted 根据 immutable `ReportInputSet` 的完整性和 policy 决定该结果。

## 8. 文件和权威边界

| 范围 | 负责 | 不负责 |
| --- | --- | --- |
| `apps/local-qa-runtime/host/**` | generic admission、Run/Attempt/Journal、Executor/tool broker、ModelObservation sanitization、resource ownership、recovery | AI inference、Assertion/CaseResult 领域逻辑、最终 Quality |
| `executor-adapter/**`（目标边界） | Browser/API/CLI 等具体 typed effects、bounded Observation/effect receipt | generic Run state、Case assertion、跨 Executor Cleanup authority |
| `browser-adapter/**` | Browser Executor 的 Chrome process/profile/download、typed browser effects、bounded observation | AI loop、Case Pass/Fail、通用 Runtime Core、Hosted upload |
| `evidence-stager/**` | bounded local staging、digest、verification、ModelObservation/Evidence sanitization、attempt cleanup | 判断最终 CaseResult、长期 storage |
| `workers/**` | bounded Worker protocol 和版本化 tool/session transport | Host resource ownership、任意直接 Chrome/filesystem/network、AI assertion authority |
| `packages/qa-contracts/**` | shared wire/state/error/ref/digest contract | 执行业务 effect |
| `fkst-packages-testing/packages/local-qa-host-adapter/**` | stateless workflow bridge 和 terminal validation | Host durability、process、Chrome、workspace、cleanup |
| `fkst-packages-testing/examples/generic-host/**` | 生命周期、durability、crash/recovery 的参考实现 | 直接作为 FKST production Local QA Host 发布 |
| Talos | QARun、TestingTask/Attempt、placement、lease、generation、fence、cancel control | 本地资源、Assertion/CaseResult 和 raw Evidence |
| NyxID | caller identity、approval、服务路由和 transport audit | QARun state、placement、Pass/Fail 和 Artifact bytes |
| Proposed Hosted Authorization Authority（Decision pending） | operation-specific business authorization、signing key lifecycle、verifier key distribution | operational QARun、placement、current claim、raw lease token 和本地资源 |
| Proposed Hosted MVP ArtifactStore（Decision pending） | per-object grant、prepare/commit/lookup、ingest receipt、lost-ack | CaseResult、QARun、raw quarantine 和本地 Cleanup |
| Hosted Post-MVP | Final Quality、Report、Publication、Settlement、feedback | operational QARun、机器调度、本地资源和 raw quarantine |

当前 issue drafts 使用目标目录 `apps/local-qa-host`，审计代码仍位于 `apps/local-qa-runtime`。目录最终命名和迁移需要单独冻结，不能与功能接线混在同一个改动中；在迁移前应以实际路径为准。

## 9. 实现前必须修正的契约漂移

### 9.1 Profile 名称

- 规范性 MVP 文档和 fixtures：`local_qa_agent_mvp`。
- 当前 `qa-contracts/contracts/registry.json`：`local_qa_host_mvp`。

目标实现统一使用 `local_qa_agent_mvp`。旧值只作为待迁移 drift，不得形成第二个等价 Profile。

### 9.2 Action 后、Assertion 前崩溃

早期 failpoint fixture 将 `browser.after_action_before_assertion` 写成 `case_failed_then_cleanup`。workflow-qa seed fixture 已校正，但 owning repo 的 Runtime recovery、Testing result vocabulary 和 conformance tests 尚未迁移。错误语义的风险不变：action 可能已产生 effect，但 assertion 没有形成权威结果。

目标应为：

```text
lost_or_inconclusive_then_cleanup
```

restart 后不得猜测 assertion，也不得自动重跑 Case。

### 9.3 `report_impossible` 权威

- Local Host 记录 execution/evidence/upload/cleanup facts，例如 `upload_expired`。
- Hosted 根据 `ReportInputSet` 缺失和 report policy 决定 `report_impossible`。

workflow-qa seed fixture 已把该 disposition 标记为 Hosted-owned mirror；owning repo 的 schema、实现和 conformance tests 仍不能把 Hosted report decision 伪装成本地 execution state mutation。

### 9.4 Evidence media

- 当前 fixed Worker 申请 `runner.log` / `text/plain; charset=utf-8`。
- MVP 可上传边界是 screenshot + bounded sanitized JSON。

因此 runner log 只能是 local-only diagnostic；产品 EvidenceManifest 必须使用 PNG 和 contract-approved JSON。

### 9.5 Executor、AI Session 与 Testing Packages 的判定权

Pinned Baseline 的 Browser adapter 在 observed text 不等于 `READY` 时直接返回 operation error，Worker 又重复检查 observed text。这会把正常 assertion failure 降格成 Browser infrastructure error。

Target 边界应为：

```text
Executor adapter → typed effect result + bounded raw observation
Runtime → sanitized ModelObservation + verified effect receipt
TestingAgentLoop → structured assertion/result proposal
AssertionReducer → canonical AssertionResult + CaseResult + ResultAuthorityReceipt
```

Executor 只对协议、进程/网络/Browser effect 和观察失败负责；Runtime 不解释断言；AI 文本不能决定 passed；Testing Packages 的 reducer 是最终 CaseResult 语义权威。

### 9.6 安装、pairing 和本地 IPC 生命周期

完整 MVP 还需要一条可安装、可升级、可撤销的 Host 生命周期，而不是只能手工启动 `local-demo`：

- signed Host artifact、install/update/rollback/uninstall；
- 显式 Node pairing 和 installation identity；
- local credential rotation、revoke、reset；
- pairing epoch、旧 binding retirement 和本地 IPC sequence ledger；
- Host restart 后先恢复 binding/revocation state，再开放 authenticated traffic；
- 旧 pairing、sequence gap、revocation batch gap 和 stale IPC binding 必须 fail closed；
- 安装/升级失败不得清空 Journal、nonce、resource ownership 或 admission history。

这些能力属于 Local QA Host product entry/operations，不应被未来 Hardened `launcher`、`supervisor` 或 `secret-broker` inert shell 伪装替代。当前没有完成安装、pairing、credential lifecycle 和 production IPC evidence，因此不能把 `local-demo` 入口称为可交付 MVP。

## 10. 统一 E2E Gate

当前仓库没有一条 whole-flow command。目标应增加单一入口，例如：

```bash
bash apps/local-qa-runtime/tests/local-qa-host-mvp-e2e.sh --all
```

> 该命令当前尚不存在，是实施完成后的目标验收入口。

该 gate 应构建 Rust/Worker，启动 hermetic Source/Compose fixture 和 Host，提交 Run，等待 terminal，并检查 Journal、Events、Outcomes、Evidence 和 Cleanup。现有 fixed Browser smoke 只作为 Browser infrastructure gate；另需独立 AI Test Execution E2E gate，验证 TestCase → model turn → typed tool → sanitized ModelObservation → AssertionReducer。

### 10.1 `MVP-0A` Browser assembly 必测场景

以下场景属于 Browser assembly gate；它们必须先由真实 Host/Worker/Chrome/Evidence/Cleanup 链路通过，不能由 `PassingExecutor` 或 fake executor 代替。

| 场景 | 必须证明 |
| --- | --- |
| happy path | 真实 Worker 和 Chrome 各执行一次；CaseResult passed；Evidence refs 持久化；Cleanup 完成 |
| assertion failure | execution failed 是测试结果，不是 Browser infra error；失败 Evidence 按 policy 处理 |
| readiness timeout | 不启动 Browser Case；environment failure；已创建资源 cleanup |
| same key/same digest replay | 返回原 acceptance；不启动第二个 Worker/Chrome |
| conflicting digest | 零新 effect；稳定 conflict code |
| cancel before claim | terminal cancelled 或明确 cancelled closure；不创建执行资源 |
| cancel during execution | 停止新 action；signal Worker；kill Chrome；CleanupReceipt |
| Worker crash | 非 passing bounded outcome；stderr 不泄露；Cleanup |
| Chrome crash/timeout | 独立 infra classification；process tree 清理 |
| Host kill/restart | admission 先关闭；旧 Case 不重跑；known resources reconcile/cleanup |
| action 后 assertion 前 crash | `lost/inconclusive`；不推断 failed/passed；不自动重跑 |
| ownership mismatch | 不删除未知资源；产生 blocking residual |
| AI TestCase loop | AI 直接读取结构化 Case，多轮只调用 closed typed tools；不生成或执行脚本 |
| unknown/malformed tool | strict schema 拒绝；零 effect；SafeError 入 ledger |
| prompt-injection Observation | pre-model sanitization 后仍只允许 bounded ModelObservation；不得扩大 tool scope |
| model refusal/truncation | bounded non-execution/result classification；不 fallback 为 passed |
| budget exhaustion | model turns/tool calls/tokens/effects/Observation bytes 单调消耗；不因 replay 重置 |
| AgentTurnLedger replay | 已提交 turn 不重复 inference/effect；effect uncertainty 为 `lost/inconclusive` |
| forged effect receipt | Runtime/Testing Packages binding 校验失败；不提交 CaseResult |
| assertion reducer | deterministic/model-judged verdict 经过 reducer；模型文本不能直接建立 passed |

其中前十一个场景是 `MVP-0A/0B` 的 Host/Runtime gate；AI TestCase loop、unknown tool、prompt injection、model refusal/truncation、budget、AgentTurnLedger、forged receipt 和 reducer 属于独立的 `MVP-0C` semantic gate。两类 gate 都必须通过，才能称为 Local QA Host Browser MVP。

### 10.2 完整 MVP 增补场景

- expired/revoked/unknown signing key。
- wrong authorization operation/method/path/body digest，或 start authorization 被重放为 cancel/reconcile。
- Talos current-claim resolver unavailable、claim superseded 或 signed lease claim ref 不匹配。
- wrong device/node/installation/Profile/Source/Plan/Environment digest。
- nonce replay 和 second active Run。
- resource create 后、identity write 前 crash。
- stale lease/generation/fence 尝试继续 action、upload 或 terminal commit。
- Talos control-plane outage after local acceptance；只做 same-machine reconcile，不自动跨机器重跑；本地 cleanup 不等待 Talos/Hosted 在线。
- Hosted authorization/revocation outage；新 effect fail closed，quiesce/cleanup/receipt repair 仍可在本地完成。
- Model provider timeout/refusal/truncation、InferenceEgress policy rejection 和 provider identity mismatch。
- Evidence redaction/canary/media/size/schema failure。
- Hosted Artifact outage during cleanup/upload。
- grant 后 bytes 前 crash。
- bytes stored、ack lost。
- staging TTL expiry。
- Event cursor expiry 和 Snapshot resync。

### 10.3 每个场景的全局断言

- no duplicate execution。
- no automatic Case rerun after uncertainty。
- no cross-run cleanup。
- stable Event sequence 和 digest。
- bounded SafeError，无 raw/path/header/cookie/credential/argv。
- raw Evidence 不离开设备。
- uploadable media 只有 screenshot + bounded JSON。
- CleanupReceipt 或明确 residual disposition。
- execution/evidence/upload/cleanup Outcomes 可独立解释。

Testing Packages adapter 还应继续运行：

```bash
cd ../fkst-packages-testing
scripts/run.sh test local-qa-host-adapter
PYTHON=python3.12 scripts/run.sh example generic-host
```

这些测试用于验证复用边界和参考生命周期，不能替代 Rust Host 的 whole-flow gate。

## 11. 完成标准

### 11.1 可提交

- 真实 admission request 经过 local credential、decision-accepted authorization/revocation/replay、Talos current claim、run/task/attempt、generation/fence、runtime/executor/model/tool identity、deadline、digest、idempotency 和 single-active gate。
- approved tool catalog、capability intersection、inference policy 和 durable budget 已绑定。
- Runtime request、Journal、Event 和 log 不包含 NyxID bearer、worker token、raw `lease_token`、provider secret 或 raw prompt/observation。
- 所有校验在 workspace、Compose、Worker、model call、tool effect、Chrome 或 staging effect 前完成。
- `local_qa_agent_mvp` 是唯一新 admission profile；`local_qa_host_mvp` 只能由显式 compatibility reader 接受，不能作为新输出。
- Host 已安装 artifact、pairing epoch、local credential、revocation state 和 IPC sequence ledger 在 restart/update/re-pair 后仍可恢复，并且旧 binding 在新 effect 前 fail closed。

### 11.2 可执行

- Runtime 能向 TestingAgentLoop 提供 bounded ModelInferencePort、typed tool broker 和 pre-model sanitized ModelObservation。
- exact Source、structured TestCase set 和 Environment Profile 可验证。
- per-run workspace 和 controlled Compose 产生 typed readiness。
- Browser Executor 作为第一种 Executor 完成 infrastructure gate；production path 不再使用 `PassingExecutor`。
- API/CLI 等未来 Executor 可以复用同一 Core contract，不要求修改 Run/Attempt/Resource/Cleanup 模型。

### 11.3 可判定

- Testing Packages 的 TestCaseExecutionEngine/AssertionReducer 是 AssertionResult/CaseResult 权威。
- deterministic/model-judged evaluator 的结果均须经过 reducer 和 receipt binding。
- 任一 Executor effect success、HTTP 200、process exit 0、Browser action success 或模型文本不能单独表示 passed。
- 每个 Case 有 CaseResult 或 bounded non-execution reason；ResultAuthorityReceipt 绑定 CaseResultSet/EvidenceManifest。

### 11.4 可清理

- 每个 workspace、Compose resource、port、Worker、Executor backend、Chrome、profile/download 和 staging object 都有 OwnedHandle。
- success/failure/cancel/timeout/crash/restart 都形成 CleanupReceipt 或 residual。
- execution resources 在等待 Hosted/upload 前完成 Cleanup。
- model provider、tool broker、AI turn 和 Artifact delivery 失败不阻止本地 quiesce/cleanup；residual 未隔离时不释放 slot。

### 11.5 可恢复

- restart 关闭 admission，执行 migrate、discovery、reconcile 和 Cleanup 后再开放。
- uncertain Browser Case 不自动重跑。
- uncertain create 只按 stable key 和 exact ownership reconcile。
- identity mismatch 不触发猜测删除。

### 11.6 可交付

- raw Evidence 不离开设备。
- 只有 validated PNG 和 bounded sanitized JSON 进入 uploadable Artifact set。
- lost acknowledgement 使用同一 object key/digest 对账，不重复创建 logical Artifact。
- Hosted 离线时本地仍可 Cleanup 和 terminal；TTL 到期有明确 `upload_expired`。
- Hosted decision gate 被接受后，MVP ArtifactStore 返回稳定 ingest receipt；Hosted Post-MVP 从 immutable ReportInputSet 生成 Quality/Report，repair 不修改本地执行事实或重跑 Case。

## 12. MVP 非目标

首发不实现：

- API、CLI、Mobile 或通用 computer-use Executor；它们必须后续复用同一 Core contract。
- 生成、保存或执行测试脚本、generated code、interpreter eval、dynamic plugin/import、runtime package install。
- 任意 Shell、argv、CDP、filesystem/network 或 caller-supplied executable。
- Runtime 自己调用模型、解释断言或推导 Final Quality。
- 非空 `secret_refs` 或项目 Secret materialization。
- DOM、trace、network body、download content 上传。
- Host 内最终 Quality、长期 Artifact/Report 或 GitHub/PQL publication。
- Host restart 后自动 Resume/重跑旧 Case。
- VZ VM、EffectGate、Grant authority ledger、Secret Broker 或 signed RecoveryDecision。

launcher、supervisor、guest-agent 和 secret-broker shells 必须保持 inert，不得被 Browser-only MVP 误启用，也不能被描述为当前安全保证。

## 13. 建议落地顺序

1. 冻结 WP0 的 TestCase/AI session/tool/model/result identity、strict schemas 和 machine-readable bounds。
2. 建立 Runtime generic Core、typed tool broker、ModelObservation sanitization 和 fake Executor conformance。
3. 完成 Browser infrastructure assembly gate，消除 synthetic `passed`，但不把它当作 AI conformance。
4. 接入 Testing Packages TestCaseExecutionEngine/TestingAgentLoop、ModelInferencePort、AgentTurnLedger 和 AssertionReducer。
5. 并行完成 Source/Environment、ownership/cancel/restart/cleanup 和 Evidence pipeline。
6. 接入 Talos-owned TestingExecutor/LocalQARuntimeAdapter、delivery/Artifact consumer contract 和安装运维。
7. 增加 AI Test Execution E2E 与 live-provider canary，作为 feature branch 合并和发布 gate。

只有当以下四层证据全部成立，才可以称为 Local QA Runtime Browser MVP 完成：

1. `MVP-0A`：真实 Host/Worker/Chrome/Evidence/Cleanup assembly，生产不再使用 `PassingExecutor`，并能形成 durable terminal。
2. `MVP-0B`：strict admission、exact Source/Environment、cancel/deadline、executor error、restart/reconcile、OwnedHandle 和正交 Outcomes 全部闭合。
3. `MVP-0C`：AI E2E 能证明结构化 TestCase 直接执行、strict typed tools、pre-model sanitization、model/tool identity、ledger replay、budget exhaustion、deterministic result reduction、`lost/inconclusive`、取消/崩溃恢复和 no-script/no-rerun。
4. `MVP-1`：若声称完整跨仓 Browser canary，还必须加上 Talos TestingTask/Worker、Hosted Authorization、ArtifactStore、安装 pairing 和真实 macOS canary；这些是外部 owner 的独立 gate，不由本 repo 单独证明。
