# Local QA Runtime 可执行路径与缺口审计

> Repo：[ChronoAIProject/fkst-hosted](https://github.com/ChronoAIProject/fkst-hosted)
>
> 审计日期：2026-08-20
>
> Baseline：[`feat/local-qa-runtime@4b17389711fc420bfef56765d7d6af34e1702eb0`](https://github.com/ChronoAIProject/fkst-hosted/commit/4b17389711fc420bfef56765d7d6af34e1702eb0)
>
> 分支边界：审计时该分支相对 `develop` 为 `ahead 130 / behind 220`；本文结论不得外推为 `develop` 或主线已交付能力。
>
> 实际代码位置：`apps/local-qa-runtime` 和 `packages/qa-contracts`。当前产品进程为 **Local QA Host**，Rust package/executable 为 `fkst-local-qa-host`；目录中同时保留未来 Hardened Runtime 的 inert shells。
>
> Target Profile：`local_qa_agent_mvp`。Target 架构见 [Talos Testing Tool 最小 MVP 设计](../design-proposals/talos-testing-tool-mvp-design.zh-CN.md)；本地执行规范仍参考 [Local QA Host MVP 设计](../local-qa-host-mvp-design.zh-CN.md)。
>
> Talos Tool/QARun/attempt/fence 缺口见 [talos 详细缺口](talos-gap-analysis.zh-CN.md)；PQL client/运行投影见 [product-quality-loop 详细缺口](product-quality-loop-gap-analysis.zh-CN.md)；Hosted Artifact/Final Quality/Report 属于后续外部领域。

## 0. 2026-08-20 Talos adapter 边界校正

### 0.1 推荐接入路径

```text
NyxID / Talos Testing Tool
  -> Talos QARun / TestingAttempt
  -> talos-worker TestingExecutor
  -> LocalQARuntimeAdapter (loopback or Unix socket)
  -> Local QA Host
  -> Worker protocol
  -> Browser adapter + Testing Packages + Evidence/Cleanup
```

Talos 拥有 `QARun`、`TestingTask`、`TestingAttempt`、placement、lease、generation、fence、cancel control 和 bounded terminal projection；Local QA Runtime 拥有本机 admission、workspace/process/port/Chrome、Evidence staging、Journal、Cleanup 和本地 execution facts。Runtime 不应直连 Talos public API，也不应使用 Talos 的通用 Browser executor 代替固定 TestingExecutor。

### 0.2 本轮核实状态

- `feat/local-qa-runtime@4b17389711fc420bfef56765d7d6af34e1702eb0` 未发生实现漂移；它仍是 Candidate，不能外推为 `fkst-hosted develop@5af95163` 已交付能力。
- Host 仍只接受 `{"kind":"inert"}`，production 仍使用 `PassingExecutor`，并在没有真实 effect 时写入 evidence/upload/terminal 状态。
- Journal v4 reopen、执行中 cancel、executor error、restart stranded attempt 仍是先于 Talos 接入必须修复的正确性问题。
- Browser adapter、Worker protocol、Evidence stager、Environment ownership 都是可复用组件，但当前 Host 没有 production peer；`qa.local-worker-protocol/v1` 也缺 deadline、heartbeat、cancel、cleanup/fence 语义。
- Talos 线上服务已激活并支持 proxy-compatible worker body credentials、single-action interactive session 和 worker v0.5.0；这些是 adapter substrate，不是 Testing Tool 已完成的证据。

### 0.3 Runtime 直接缺口

**P0：** 修复 schema v4 reopen；替换 synthetic `PassingExecutor`；定义并验证版本化 local admission（run/task/attempt/machine/generation/fence/deadline）；接入固定 Testing Packages invocation；持久化真实 execution/evidence/cleanup outcomes。

**P1：** Host↔Worker↔Browser↔Evidence assembly、Source/workspace、Environment/readiness、cancel/timeout、restart-to-lost、same-machine reconcile、sanitized PNG/JSON、upload grant/lost-ack。

**明确不归 Runtime：** Talos QARun/placement/lease/fence 的公共控制面、PQL selection、Testing Packages assertion 语义、Hosted Artifact/Quality/Report/Settlement。

## 1. 执行摘要

当前分支不是一条可运行的 Local QA MVP，而是若干已经通过组件测试的 walking skeleton：

- Host loopback API、SQLite acceptance、Snapshot、Events 和 execution-attempt claim 已经激活。
- Browser adapter 能真实启动隔离的系统 Chrome、访问固定 loopback fixture、截图并清理进程和临时目录。
- TypeScript Worker 有严格的 fixed browser-smoke policy 和 bounded framed protocol。
- Evidence stager 能把 bounded bytes 原子写入本地目录并验证 digest。
- Rust/TypeScript `qa-contracts` 已有 lifecycle、Evidence、Worker protocol 和 canonical digest 基础。
- ownership 模块已有 durable intent、stable provider key、labels 和 handle binding。

但这些能力没有被 production Host 串联，而且最新 Baseline 存在一个直接阻断 restart 的 P0 bug：migration 会把 SQLite `user_version` 写为 4，但 reopen 路径没有接受 version 4 的成功分支，正常重开可返回 `UnsupportedDatabaseVersion(4)`。

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

最短路线不是重写 Browser、Worker 或 Evidence，而是先建立 Host-owned execution spine，把现有组件接成第一条诚实可执行链路；随后再接 exact Source、受控 Environment/readiness、Testing Packages、Talos adapter、恢复和 Artifact 交付。

固定 Baseline 关键证据：

- [`apps/local-qa-runtime/README.md`](https://github.com/ChronoAIProject/fkst-hosted/blob/4b17389711fc420bfef56765d7d6af34e1702eb0/apps/local-qa-runtime/README.md)
- [`host/src/coordinator.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/4b17389711fc420bfef56765d7d6af34e1702eb0/apps/local-qa-runtime/host/src/coordinator.rs)
- [`host/src/journal.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/4b17389711fc420bfef56765d7d6af34e1702eb0/apps/local-qa-runtime/host/src/journal.rs)
- [`host/src/executor.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/4b17389711fc420bfef56765d7d6af34e1702eb0/apps/local-qa-runtime/host/src/executor.rs)
- [`browser-adapter/src/lib.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/4b17389711fc420bfef56765d7d6af34e1702eb0/apps/local-qa-runtime/browser-adapter/src/lib.rs)
- [`evidence-stager/src/lib.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/4b17389711fc420bfef56765d7d6af34e1702eb0/apps/local-qa-runtime/evidence-stager/src/lib.rs)
- [`workers/src/protocol-worker.ts`](https://github.com/ChronoAIProject/fkst-hosted/blob/4b17389711fc420bfef56765d7d6af34e1702eb0/apps/local-qa-runtime/workers/src/protocol-worker.ts)

## 2. 当前可执行能力地图

| 能力 | 当前入口和实现 | 当前验证 | production Host 是否调用 | 当前结论 |
| --- | --- | --- | --- | --- |
| Host startup / loopback API | `host/src/main.rs`、`host/src/lib.rs`；`local-demo`；health/submit/get/events/cancel | `host/tests/fail_closed.rs`、`host/tests/loopback_sqlite.rs` | 是 | API 和 bounded HTTP 基础可用，但只接受 inert request |
| SQLite acceptance / replay | `host/src/journal.rs`；WAL、accepted request、Run、Event、cancel intent、attempt | restart/replay/race tests | 是 | acceptance skeleton 可用，未实现真实授权、nonce、active slot 和完整 Outcomes |
| Coordinator | `host/src/coordinator.rs` | blocking/fake executor tests | 是 | 能 claim 和推进固定状态，但 Event sequence 和流程是 synthetic |
| Executor | `host/src/executor.rs` 的 `PassingExecutor` | fake passing path | 是 | 无 I/O，不能证明发生过 QA |
| Browser adapter | `browser-adapter/src/lib.rs` 的 `run_fixed_browser_smoke()` | 真实系统 Chrome component smoke | 否 | 独立 Chrome/process/profile/download cleanup 已证明；只测内建 fixture |
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
| Browser | `implemented but disconnected` | fixed adapter 可启动真实 Chrome | Host capability peer、目标 URL/action 输入、durable browser ownership |
| Assertion/CaseResult | `partial and disconnected` | fixed Worker 只支持单一 READY smoke | 接入版本化 Testing Packages contract；Browser 只产 Observation |
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

## 4. P0：最新 Baseline 必须先修复的正确性和协议缺口

### 4.1 Journal schema v4 reopen blocker

[`host/src/journal.rs`](https://github.com/ChronoAIProject/fkst-hosted/blob/4b17389711fc420bfef56765d7d6af34e1702eb0/apps/local-qa-runtime/host/src/journal.rs) 的 migration 会把 `user_version` 设置为 4，但 migrate/reopen 分支没有把 version 4 作为成功状态接受。结果是：

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
machine identity
generation / fence token
deadline
exact source ref/digest
structured plan ref/digest
testing package manifest ref/digest
environment profile ref/digest
policy/budgets
request digest / idempotency key
```

所有验证必须发生在 workspace、process、port、Chrome 或 Evidence staging effect 之前。Runtime 不保存 NyxID bearer 或 Talos worker token，只消费已经投影并可本地验证的 attempt/fence context。

### 4.4 Worker protocol 缺少 deadline、heartbeat 和 cancel

当前 [`protocol-worker.ts`](https://github.com/ChronoAIProject/fkst-hosted/blob/4b17389711fc420bfef56765d7d6af34e1702eb0/apps/local-qa-runtime/workers/src/protocol-worker.ts) 只有一次 invocation、顺序 capability exchange 和 terminal result。需要补齐：

- invocation deadline 和 per-effect timeout。
- heartbeat/liveness。
- cancel/abort frame。
- bounded stderr/stdout drain 和 EOF timeout。
- typed infrastructure failure 与 protocol violation。
- cleanup/finalization result。
- stale generation/fence 的 point-of-use 拒绝。

不能只依赖杀进程；协议应允许 Testing Packages 停止生成新 action，并让 Runtime 精确清理已拥有资源。

### 4.5 `TestingExecutor`、`LocalQARuntimeAdapter` 和 runner invocation

目标接线必须区分：

- Talos worker 的固定 `TestingExecutor`：claim、heartbeat、cancel、deadline、bounded result projection。
- worker 侧 `LocalQARuntimeAdapter`：调用 Runtime submit/get/events/cancel。
- Runtime 内 `TestingPackageInvocationAdapter`：通过 `testing-runner-invocation.v1` 调用 Testing Packages。
- Testing Packages：唯一解释 StructuredPlan、生成 action、计算 assertion/CaseResult。

Runtime 不复制 assertion/domain logic；worker 不直接打开 Chrome；Testing Packages 不拥有 Talos lease 或本机资源。

## 5. MVP-0：先建立第一条诚实的本地 E2E

MVP-0 的目标是让一个 hermetic Browser Run 从 Host submit 真正走到 terminal。它是完整 MVP 的本地执行基线，不代表 NyxID、生产授权、安装分发、云端 upload/report 已完成。

```text
canonical fixture request
→ atomic local acceptance
→ digest-bound fixture Source
→ per-run workspace
→ controlled Compose service
→ typed readiness
→ Host-owned Worker process
→ framed capability peer
→ isolated System Chrome
→ Testing Packages AssertionResult / CaseResult
→ screenshot + bounded sanitized JSON
→ exact execution Cleanup
→ durable terminal Snapshot / Events / Outcomes
```

### 5.1 第一增量：先把已有组件真实串起来

在 Source/Compose 和完整 Testing Packages adapter 之前，先增加一个固定 browser-smoke assembly gate：

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

这条 assembly gate 仍是固定 fixture，不是完整产品 MVP，但它能消除当前最严重的问题：Host 声称 passed，却从未执行 QA。

### 5.2 MVP-0 完成还需加入 Source、Compose 和 Testing Packages

完成 assembly gate 后，再把内建 fixture 替换为：

- exact immutable Source Object。
- per-run workspace，不修改用户原 checkout。
- digest-bound Environment Profile。
- 一个受控 Compose project 和 typed readiness。
- `fkst-packages-testing` 的版本化 Browser/Assertion/CaseResult contract。
- Run-wide OwnedHandle 和 CleanupReceipt。

只有这一层完成，才可以称为“本地 MVP 流程跑通”。

## 6. 完整 MVP Gap Matrix

| 阶段 | 当前状态 | 目标能力 | 优先复用 | 退出标准 |
| --- | --- | --- | --- | --- |
| Contract convergence | scalar/ref/protocol 基础 | 完整 Run request、bounds、projection、state/outcomes/errors/receipts | `qa-contracts` canonical/digest validators、MVP fixtures | Rust/TS 对合法、冲突、错误绑定和 failpoints 给出同一结果 |
| Admission | inert body + fixed digest | local credential + Talos attempt/generation/fence + idempotency + deadline + active slot 原子提交 | 当前 WAL Journal/admit transaction | 错误绑定零 effect；same key/digest replay；第二 Run `device_busy` |
| Source/workspace | 无 | exact Source verify、cache/materialize、per-run workspace、OwnedHandle | Testing Packages generic-host exact checkout 模式 | wrong digest 执行前失败；不修改用户 checkout；restart 可识别 owned workspace |
| Environment/readiness | 无 | versioned profile、Compose、loopback ports、budgets、typed readiness | `environment-factory` 和 generic-host lifecycle | readiness failure 不启动 Case；所有已创建资源进入 Cleanup |
| Host-worker peer | protocol only | spawn/supervise、capability dispatch、deadline/cancel、terminal validation | `qa.local-worker-protocol/v1` process harness | malformed/truncated/timeout/crash fail closed；结果持久化后才 terminal |
| Testing Packages adapter | fixed smoke policy | StructuredPlan、BrowserAction、Observation、AssertionResult、CaseResult | `local-qa-host-adapter` 和 `testing-runner` | testing-runner 是 Case Pass/Fail 唯一权威；Host 不复制 assertion logic |
| Browser ownership | adapter self-owned temp resources | Journal-owned browser attempt/process/profile/download handle | `run_fixed_browser_smoke()` 的 allowlist、process group、cleanup | Chrome crash/cancel/timeout/restart 不 attach 或重跑旧 Case |
| Journal/ownership | request/run/event/cancel/attempt | resource、environment/browser/worker/evidence/upload/cleanup attempts 和 residuals | 当前 single-writer SQLite | intent-before-effect；uncertain create 按 stable key reconcile；不猜测删除 |
| Cancel/timeout | intent 不驱动 effect | durable intent、stop new action、signal Worker、kill Chrome、stop Compose、Cleanup | Worker process/session close 和 Browser process-group control | 每个阶段 cancel/timeout 都形成 outcome + CleanupReceipt/residual |
| Restart recovery | claimed attempt stranded | admission gate、discovery、restart-to-lost、cleanup/upload reconcile、no-rerun | generic-host restart/replay acceptance | Host kill 后不重复 Case；known resource 精确清理；unknown ownership blocking residual |
| Evidence safety | local object staging primitive | bounded quarantine、safe projection、PNG/JSON validation、manifest、TTL | EvidenceStager atomic write/digest | raw data 不进入 Journal/Event/cloud；只有 screenshot + bounded JSON 可上传 |
| Cleanup-before-upload | 无 Run-wide cleanup | exact reverse cleanup、receipt、release active slot，再等待 cloud | Browser cleanup + environment cleanup patterns | Hosted 离线不阻塞本地 Cleanup 或 local terminal |
| Upload | 无 | per-object grant、stable object key/digest、attempt、lost-ack、expiry | Hosted object storage primitives | response lost 不重复 Artifact；TTL 到期 `upload_expired` |
| Installation/pairing | `local-demo` 手工启动 | signed user artifact、LaunchAgent、pairing、credential rotation/revoke/reset | 现有 NyxID node-pinned transport + PoC 经验 | 已安装 Host 经 NyxID 接收绑定 Run；wrong/offline fail closed |
| Artifact/Report handoff | 无 | pointer-only CaseResultSet/EvidenceManifest/CleanupReceipt projection | Testing Packages terminal projection、Hosted ingestion | Hosted 冻结 ReportInputSet；Quality/Report repair 不重跑 Case |

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

### 7.1 WP0：Contract convergence

交付：

- `qa.local-run-admission/v2`、RunAcceptance、Snapshot/Event/SafeError。
- Talos run/task/attempt、generation、fence 和 deadline bindings。
- Source、StructuredPlan、Testing Package manifest、Environment/Profile 和 Browser capability digest bindings。
- execution/evidence/upload/cleanup 四类正交 Outcomes。
- resource intent、OwnedHandle、attempt、CleanupReceipt 和 residual types。
- machine-readable payload/string/array/depth/Event/Evidence/staging/TTL bounds。
- shared Rust/TypeScript fixtures、migration v4 reopen 和 failpoint expectations。

阻断条件：WP0 未冻结前，不应让 admission、Journal 和 Testing Packages 各自发明字段或默认上限。

### 7.2 WP1：Host execution spine

交付：

- production real executor composition，删除 `PassingExecutor` 的 production wiring。
- Host-owned Worker process lifecycle 和 capability peer。
- Talos `LocalQARuntimeAdapter` 对 submit/get/events/cancel 的严格映射。
- Browser adapter 与 Evidence stager integration。
- Worker result、sanitized observation、Evidence refs 和 attempt persistence。
- effect-sensitive state transitions；没有 effect 时不得写对应 state。
- executor error compensation 和 terminal classification。
- 第一条 `Host → Worker → Chrome → Evidence → Journal` acceptance test。

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

### 7.4 WP3：Testing Packages integration

不应在 Rust Host 中重新实现计划、断言、CaseResult 或完整 QA workflow。优先复用 `fkst-packages-testing`：

- `testing-package-manifest.v1`：固定 package ID、version、commit、content digest、entrypoints 和 capabilities。
- `testing-runner-invocation.v1`：绑定 run/attempt、Source、PQL InputSet、StructuredPlan、package manifest、policy、budgets 和 deadline。
- provider-neutral capability ports：immutable artifact、typed browser effect、bounded Observation、cancel/deadline/fence check、canonical artifact write。
- generic-host 已有的 exact checkout、process supervision、readiness、cleanup、restart discovery、terminal replay 和 durable claim 模式只作为实现参考。
- `testing-runner` 的 Browser action、Observation、AssertionResult 和 CaseResult 权威。

Host 负责 process、Chrome、filesystem、ports、ownership 和 cleanup；Testing Packages 负责 Plan interpretation、action progression、assertion evaluation 和 CaseResult。

退出标准：

- Host 不复制 assertion/domain logic。
- Worker 不能直接打开 Chrome/CDP、任意 filesystem 或任意 network。
- 每个声明 Case 都有 CaseResult 或 bounded non-execution reason。
- malformed、truncated、unknown-version 或 contradictory result fail closed。

### 7.5 WP4：Ownership、Cancel、Cleanup 和 Restart

需要增加 Journal 表或等价持久对象：

- `resources`
- `environment_attempts`
- `browser_attempts`
- `worker_attempts`
- `evidence_attempts`
- `cleanup_attempts`
- `upload_attempts`
- `nonce_records`
- `active_slots`
- `residuals`

规则：

1. effect 前写 intent。
2. create 成功但 identity 未写回时，以 stable provider key 和 ownership label reconcile。
3. cancel/timeout intent 先持久化，再停止新 action、signal Worker、terminate Chrome/Compose。
4. success/failure/cancel/timeout/crash 都进入 exact Cleanup。
5. restart 先关闭 admission，再 migrate、discover、reconcile、cleanup，最后开放 admission。
6. interrupted Browser Case 标记 `lost/inconclusive`，禁止自动重跑。
7. identity mismatch 或 unknown ownership 形成 blocking residual，禁止猜测删除。

### 7.6 WP5：Evidence pipeline

MVP 可上传 Evidence 只允许：

- `image/png` screenshot。
- bounded sanitized JSON。

固定流程：

```text
raw observation
→ bounded quarantine
→ safe assertion/evidence projection
→ redaction
→ media/size/schema/canary validation
→ post-redaction digest
→ EvidenceManifest
→ sanitized staging
```

当前 Worker/Evidence stager 的 `runner.log` + `text/plain` 可保留为 local-only diagnostics，但不能被计入 MVP uploadable Artifact set，也不能替代 bounded JSON result。

需要新增：

- `LocalSanitizedObservation` 的构造和持久引用。
- screenshot dimension/size validator。
- bounded JSON schema/size validator。
- RedactionReceipt 和 canary corpus。
- per-attempt/per-Run staging quota。
- EvidenceManifest、retention 和 TTL。

### 7.7 WP6：Delivery 和 production entry

本地顺序固定：

```text
Evidence validation complete
→ terminate Worker / Chrome
→ cleanup Compose / ports / workspace / raw quarantine
→ write CleanupReceipt
→ release execution slot
→ request upload grant
→ upload or reconcile
```

交付：

- per-object grant client。
- stable object key + digest retry/reconcile。
- bytes stored/ack lost 的 receipt lookup。
- local terminal while Hosted unavailable。
- sanitized staging TTL 和 `upload_expired`。
- signed Host artifact、LaunchAgent、pairing 和 credential lifecycle。
- NyxID transport mapping。
- Hosted Artifact ingestion 和 pointer-only report handoff。

Local Host 不决定 `report_impossible`。Hosted 根据 immutable `ReportInputSet` 的完整性和 policy 决定该结果。

## 8. 文件和权威边界

| 范围 | 负责 | 不负责 |
| --- | --- | --- |
| `apps/local-qa-runtime/host/**` | admission、Journal、coordinator、Worker supervision、resource ownership、recovery | Assertion/CaseResult 领域逻辑、最终 Quality |
| `browser-adapter/**` | owned Chrome process/profile/download、typed browser effects、bounded observation | Case Pass/Fail、Hosted upload |
| `evidence-stager/**` | bounded local filesystem staging、digest、verification、attempt cleanup | 判断哪些 Artifact 可上传、长期 storage |
| `workers/**` | bounded Worker protocol 和版本化 runner/policy entry | Host resource ownership、任意直接 Chrome/filesystem/network |
| `packages/qa-contracts/**` | shared wire/state/error/ref/digest contract | 执行业务 effect |
| `fkst-packages-testing/packages/local-qa-host-adapter/**` | stateless workflow bridge 和 terminal validation | Host durability、process、Chrome、workspace、cleanup |
| `fkst-packages-testing/examples/generic-host/**` | 生命周期、durability、crash/recovery 的参考实现 | 直接作为 FKST production Local QA Host 发布 |
| Talos | QARun、TestingTask/Attempt、placement、lease、generation、fence、cancel control | 本地资源、Assertion/CaseResult 和 raw Evidence |
| NyxID | caller identity、approval、服务路由和 transport audit | QARun state、placement、Pass/Fail 和 Artifact bytes |
| Hosted 后续领域 | Artifact ingestion、Final Quality、Report、Publication、Settlement | operational QARun、机器调度、本地资源和 raw quarantine |

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

### 9.5 Browser 与 Testing Packages 的判定权

当前 Browser adapter 在 observed text 不等于 `READY` 时直接返回 operation error，Worker 又重复检查 observed text。这会把正常 assertion failure 降格成 Browser infrastructure error。

目标边界应为：

```text
Browser adapter → action result + bounded Observation
Testing Packages → AssertionResult + CaseResult
```

Browser adapter 只对协议、进程、导航和观察失败负责，不应决定产品 assertion 是否通过。

## 10. 统一 E2E Gate

当前仓库没有一条 whole-flow command。目标应增加单一入口，例如：

```bash
bash apps/local-qa-runtime/tests/local-qa-host-mvp-e2e.sh --all
```

> 该命令当前尚不存在，是实施完成后的目标验收入口。

该 gate 应构建 Rust/Worker，启动 hermetic Source/Compose fixture 和 Host，提交 Run，等待 terminal，并检查 Journal、Events、Outcomes、Evidence 和 Cleanup。

### 10.1 MVP-0 必测场景

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

### 10.2 完整 MVP 增补场景

- expired/revoked/unknown signing key。
- wrong device/node/installation/Profile/Source/Plan/Environment digest。
- nonce replay 和 second active Run。
- resource create 后、identity write 前 crash。
- stale lease/generation/fence 尝试继续 action、upload 或 terminal commit。
- Talos control-plane outage after local acceptance；只做 same-machine reconcile，不自动跨机器重跑。
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

- 真实 admission request 经过 local credential、Talos run/task/attempt、generation/fence、deadline、digest、idempotency 和 single-active gate。
- 所有校验在 workspace、Compose、Worker、Chrome 或 staging effect 前完成。

### 11.2 可执行

- exact Source 和 Environment Profile 可验证。
- per-run workspace 和 controlled Compose 产生 typed readiness。
- Host 启动受控 Worker 和独立 System Chrome。
- production path 不再使用 `PassingExecutor`。

### 11.3 可判定

- Testing Packages 是 AssertionResult/CaseResult 权威。
- Browser action success、HTTP 200、process exit 0 或文本声称成功都不能单独表示 passed。
- 每个 Case 有 CaseResult 或 bounded non-execution reason。

### 11.4 可清理

- 每个 workspace、Compose resource、port、Worker、Chrome、profile/download 和 staging object 都有 OwnedHandle。
- success/failure/cancel/timeout/crash/restart 都形成 CleanupReceipt 或 residual。
- execution resources 在等待 Hosted/upload 前完成 Cleanup。

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
- Hosted 从 immutable ReportInputSet 生成 Quality/Report；repair 不修改本地执行事实或重跑 Case。

## 12. MVP 非目标

首发不实现：

- API、CLI 或 Codex backend。
- 任意 Shell、任意 CDP、任意本地进程执行。
- 非空 `secret_refs` 或项目 Secret materialization。
- DOM、trace、network body、download content 上传。
- Host 内最终 Quality、长期 Artifact/Report 或 GitHub/PQL publication。
- Host restart 后自动 Resume/重跑旧 Case。
- VZ VM、EffectGate、Grant authority ledger、Secret Broker 或 signed RecoveryDecision。

launcher、supervisor、guest-agent 和 secret-broker shells 必须保持 inert，不得被 Browser-only MVP 误启用，也不能被描述为当前安全保证。

## 13. 建议落地顺序

1. 修正 WP0 contract drift 和 machine-readable bounds。
2. 完成 WP1 的 fixed assembly gate，消除 synthetic `passed`。
3. 并行完成 WP2 Source/Compose 和 WP3 Testing Packages adapter。
4. 在真实项目 happy path 前完成 WP4 ownership/cancel/restart/cleanup。
5. 完成 WP5 screenshot + bounded JSON Evidence pipeline。
6. 完成 WP6 upload、pairing/NyxID 和 Hosted report handoff。
7. 增加统一 E2E command，并把它设为 feature branch 合并和发布 gate。

当统一 E2E gate 能证明授权 happy path、测试失败、取消、超时、Worker/Chrome crash、Host restart、Evidence failure、Hosted outage 和 lost upload acknowledgement 都收敛，且没有重复执行、跨 Run 清理或 raw 数据外泄时，才可以称为 Local QA Host MVP 整条流程跑通。
