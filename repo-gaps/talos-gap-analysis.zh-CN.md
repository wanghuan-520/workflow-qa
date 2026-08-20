# talos 详细缺口清单

> Repo：[ChronoAIProject/talos](https://github.com/ChronoAIProject/talos)
>
> 审计日期：2026-08-20
>
> Baseline：[`main@a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb`](https://github.com/ChronoAIProject/talos/commit/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb)
>
> Target：[PQL Testing 简化时序图](../design-proposals/diagrams/pql-testing-simple-flow.mmd) 与 [Talos Testing Tool 最小 MVP 设计](../design-proposals/talos-testing-tool-mvp-design.zh-CN.md)

## 0. 2026-08-20 线上合同与 Tool 可行性校正

### 0.1 结论

Testing 可以成为 Talos 服务的第一方 `talos.testing` Tool family，但不能复用现有 generic `TaskCreate(kind=browse|computer_use, goal)` 作为测试合同，也不能通过 interactive Session 拼出确定性 QA run。

建议由 Talos owning repo 暴露五个 bounded operation：

```text
talos.testing.get_capabilities
talos.testing.submit
talos.testing.get
talos.testing.events
talos.testing.cancel
```

内部保持：

```text
QARun -> TestingTask -> TestingAttempt -> fixed TestingExecutor -> LocalQARuntimeAdapter
```

### 0.2 本轮核实的当前事实

- `main@a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb` 仍是线上对应 Baseline，worker 已升级到 `v0.5.0`。
- 线上 Talos `/openapi.json` 与该 commit 的 `specs/talos-openapi.yaml` 规范化 SHA-256 一致：`1b9b101e677ccb3140bdc0a70fb3f9b475f54ef06163eb1d40468a1447fc9920`；不存在已观察到的部署漂移。
- 当前 `TaskKind` 只有 `browse | computer_use`；没有 `testing`、QARun、TestingAttempt、generation/fence、Testing event cursor、CaseResultSet/EvidenceManifest/CleanupReceipt projection。
- 当前通用 claim 是 list-then-save，Mongo task 和 machine lease 分开写，没有 CAS/事务/fence；cancel 会先标记 terminal 并释放 lease，而正在运行的 Playwright action 没有 AbortSignal；lease 过期会重新提交任务，可能重复非幂等 Browser effect。
- 当前 artifact 仍只有 `{name, content_type, size, uri}` metadata；不能证明 bytes、digest、provenance 或 ingest receipt。
- 当前 worker daemon 的单次 `runOnce()` 是串行消费；machine `capacity > 1` 不会自动形成同一 daemon 的并发 testing slots，且 scheduler capability matching 读取 machine tags，不读取 pool tags。Testing MVP 必须显式建模 per-machine active slot 和并发上限。
- `talos-worker-setup` skill 的 rendezvous/body credential、pool sharing 和 capability tags 是可复用部署基础；Ornn URL 当前不可用，不能作为额外公开合同来源。

### 0.3 直接优先级

**P0：** QARun + 五 operation + strict versioned schemas/idempotency；`kind=testing` union；固定 TestingExecutor/Runtime adapter；atomic reservation/claim；attempt generation/fence/stale-writer rejection；local acceptance 后 no-rerun；active cancel/deadline/abort。

**P1：** immutable Snapshot/events/opaque cursor resync；正交 execution/evidence/upload/cleanup outcomes；scoped Artifact upload/digest/receipt；durable callback/outbox；restart/reconcile；capability attestation 和真实 macOS arm64 canary。

**P2：** API/CLI/performance/mobile backend、更多浏览器和 Secret/profile/hardened profile。所有扩展都必须 fail closed，不得降级到 `browse` 或 `computer_use`。

## 1. 执行摘要

Talos Baseline 已经具备通用异步任务控制面、pool/machine 调度、worker outbound claim、lease/heartbeat、interactive Browser action、NyxID JWT 和 artifact/callback 基础。这些能力可作为 Testing Tool 的底层平台。

但当前实现没有 `kind=testing`，也没有目标时序图中的 Testing Tool/QARun contract：

```text
get_capabilities
submit
get
events
cancel
```

通用 `Task` 或 interactive `Session` 不能直接等同于测试 `QARun`。它们尚不能冻结 StructuredPlan、Testing Package、Case/Assertion 语义、Evidence/Result 绑定、Cleanup 结果，也没有定义 local acceptance 后的 no-rerun/fence 边界。

## 2. Target 职责与非职责

Talos Testing Tool 应负责：

- 暴露稳定、异步、bounded 的 Testing Tool API。
- 幂等创建和管理 operational `QARun`。
- 维护 Snapshot、Event cursor 和 cancel intent/ack。
- 将 `QARun` 拆分为 `TestingTask`/`TestingAttempt`。
- 根据 capability/policy 选择 pool 和 machine。
- 管理 reservation、lease、generation、fence、heartbeat、deadline 和 stale writer rejection。
- 通过固定 `TestingExecutor` 调用本机 Local QA Runtime。
- 接收 bounded terminal result 与 opaque result/evidence/cleanup refs。

Talos 不应负责：

- 解释或改写 `StructuredPlan`。
- 生成 Browser action、计算 assertion 或决定 `CaseResult`。
- 直接启动项目环境或 Chromium；这些属于 Local QA Runtime。
- 搬运 raw Artifact bytes 或拥有本地 raw quarantine。
- 根据 task completed 判断测试 passed。
- 决定 Final Quality、Report 或资产 promotion。

## 3. Baseline 已实现能力

### 3.1 通用 Task 控制面

已实现：

- `submitted -> claimed -> running -> completed/failed/cancelled` 状态基础。
- claim、lease、heartbeat、deadline、过期重排和 terminal result。
- 人工 input 与 handoff 状态。
- task result、structured findings 和 artifact refs。

证据：

- [`domain/types.ts`](https://github.com/ChronoAIProject/talos/blob/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb/control-plane/src/domain/types.ts)
- [`task-service.ts`](https://github.com/ChronoAIProject/talos/blob/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb/control-plane/src/services/task-service.ts)
- [`server.ts`](https://github.com/ChronoAIProject/talos/blob/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb/control-plane/src/http/server.ts)

### 3.2 Pool、machine 和 capability 调度

已实现：

- pool ownership/visibility。
- machine online/capacity 基础。
- capability requirements matching。
- profile machine pinning 和 worker token。
- worker outbound polling/claim。

这些能力可以复用，但 Baseline 的 claim 是 list-then-save，并且项目文档要求单 control-plane replica；尚不能证明多副本原子 claim 或 testing single-active attempt。

### 3.3 Interactive Browser Session

已实现：

- 外部 planner 每次提交一个 typed action。
- 单 action in-flight。
- screenshot、click、type、key、scroll、wait、navigate。
- DOM text 和 accessibility locator。
- Playwright persistent context。
- 匿名任务使用独立临时 profile，关闭时递归清理。
- 持久 profile 有控制面锁。

证据：

- [`session-service.ts`](https://github.com/ChronoAIProject/talos/blob/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb/control-plane/src/services/session-service.ts)
- [`browser-executor.ts`](https://github.com/ChronoAIProject/talos/blob/a32e537f8ded5d52886cd6ebec0a1ea59aeb3ecb/worker/src/executor/browser-executor.ts)

它与 Target 的 typed Browser action loop 相近，但 action 目前来自 API caller，而不是由 Local QA Runtime 调用固定 Testing Packages runner。

### 3.4 Identity、callback 和 artifact metadata

已实现：

- NyxID JWT caller identity。
- pool ownership、machine worker token、lease token 和 profile owner 检查。
- HMAC webhook。
- callback timeout 和有限重试。
- worker 上报 `{name, content_type, size, uri}` artifact metadata。

当前 callback 仍是进程内 fire-and-forget，没有 durable redelivery outbox；artifact API 不保存、上传或校验 bytes/digest。

### 3.5 Cancel 基础

cancel 后，后续 heartbeat/worker API 会返回 `task_cancelled`。但：

- 正在阻塞的 Playwright action 不能被立即中断。
- 取消延迟依赖 heartbeat/poll 周期。
- 没有 testing `CancelAck`、runtime stop、cleanup outcome 的完整投影。

## 4. 当前状态矩阵

| Target 能力 | 状态 | Baseline 事实 | 主要缺口 |
| --- | --- | --- | --- |
| Testing Tool facade | 缺失 | 只有通用 Task/Session HTTP API | 五个 operation、严格 request/response schema、版本协商 |
| `QARun` | 缺失 | Task 可作为底层构件 | 产品 run 与内部 task/attempt 尚未分离 |
| Testing placement | 部分实现 | 通用 pool/machine/capability scheduler 已有 | `kind=testing`、runtime capability、single-active local acceptance |
| `TestingExecutor` | 缺失 | worker 有 Browser executor | 固定 testing executor 和 Runtime adapter |
| lease/generation/fence | 部分实现 | lease/heartbeat 已有 | generation/fence/stale completion、post-acceptance no-rerun |
| bounded events | 缺失 | task GET + callback | immutable event sequence、cursor、snapshot resync |
| testing result ABI | 缺失 | status/findings/artifacts/error | CaseResult/Evidence/Cleanup refs 与独立 outcomes |
| Artifact delivery | 部分实现 | metadata refs 已有 | upload grant、digest/size/media validation、lost-ack reconcile |
| cancel/cleanup | 部分实现 | cancel 可被 worker 后续调用观察 | action 中断、Runtime cleanup、ack 与 completion 分离 |
| 多副本调度 | 未验证 | 当前 claim 非原子，要求单 replica | atomic reservation/claim/CAS |

## 5. P0：Testing Tool API 和 QARun 模型

### 5.1 五个稳定 operation

需要新增：

| Tool | 目标语义 |
| --- | --- |
| `talos.testing.get_capabilities` | 返回支持的 contracts、profiles、backends 和 bounded limits |
| `talos.testing.submit` | 以 client-provided `run_id` 幂等创建或重放 QARun |
| `talos.testing.get` | 返回 bounded Snapshot、正交 outcomes、attempt 和 opaque refs |
| `talos.testing.events` | 返回 bounded immutable events、cursor 和 has_more |
| `talos.testing.cancel` | 持久化取消意图并返回 `CancelAck`，不伪装成已停止 |

要求：

- OpenAPI 有稳定 operationId，供 NyxID catalog 投影。
- same `run_id`/same request digest replay 原 acceptance。
- same `run_id`/different digest fail closed。
- acceptance 只表示请求已被控制面接受。
- response 不包含 raw Artifact bytes、完整 DOM、trace、network body 或本机路径。

### 5.2 区分 `QARun`、`TestingTask` 和 `TestingAttempt`

```text
QARun
  对外稳定 run_id、request identity、Snapshot、Events、Cancel、结果引用

TestingTask
  调度到某类 executor 的严格任务，不使用自由文本 goal 决定执行

TestingAttempt
  一次具体 placement/claim/local acceptance，绑定 machine、lease、generation、fence
```

一个 `QARun` 在 local acceptance 前可以产生新的 attempt；local acceptance 后不得自动跨机器重跑已经可能产生副作用的 Case。

### 5.3 `kind=testing` strict union

当前 Task kind 不足以表达：

- exact source ref/digest。
- StructuredPlan ref/digest。
- Environment Profile ref/digest。
- Testing Package ID/version/digest。
- execution profile 和 runtime capability。
- result/evidence/cleanup contracts。
- testing budgets 和 policy。

需要新增严格、版本化的 `talos.testing-task/v1`。`goal` 只可用于显示，不能参与授权、placement、runner selection、effect 或 Pass/Fail。

## 6. P0：Worker 和 Local Runtime 接线

### 6.1 固定 `TestingExecutor`

worker 应显式注册 `TestingExecutor`，而不是开放 generic plugin、shell 或 caller-supplied executable。

它负责：

- 验证 task kind/schema/version。
- 将 attempt、lease、generation、fence 和 deadline 投影给 Runtime adapter。
- 调用本机 loopback/Unix socket `LocalQARuntimeAdapter`。
- 维持 claim/heartbeat/cancel。
- 从 Runtime 获取 bounded Snapshot/Event/terminal refs。
- 回传 result/evidence/cleanup refs 和 outcomes。

它不负责：

- checkout、启动应用或 Chrome。
- 解释 StructuredPlan。
- 计算 assertion。
- 生成 CaseResult。

### 6.2 `LocalQARuntimeAdapter`

需要版本化 adapter contract，至少覆盖：

```text
admit/submit
get snapshot
list events
cancel
reconcile terminal
```

adapter 必须映射而不是合并 Talos 与 Runtime 状态：Talos 管 operational attempt；Runtime Journal 管本机 effect、ownership、Evidence 和 Cleanup。

## 7. P0：attempt、generation 和 fence

### 7.1 必需身份

每个 execution-bearing 调用必须绑定：

```text
run_id
task_id
attempt_id
machine_id
generation
lease_token
fence_token
deadline
```

lease 表示 worker 仍可报告当前 attempt；fence 决定 worker 是否仍可产生新 effect、上传 Artifact 或提交 terminal result。

### 7.2 local acceptance 前后的 retry 边界

local acceptance 前：

- claim 丢失、worker 离线或 Runtime 明确未接受时，可以创建新 attempt 或重新 placement。

local acceptance 后：

- 只允许 same-machine reconcile、停止和 Cleanup。
- 不能因为 heartbeat 丢失自动跨机器重跑。
- stale generation/fence 必须拒绝 Browser effect、upload 和 completion。
- action 已发生但 assertion 未冻结时，结果应为 `lost/inconclusive`，不得猜测 pass/fail。

### 7.3 stale writer rejection

必须测试：

- 旧 lease heartbeat。
- 旧 generation completion。
- 旧 fence upload。
- cancel 与 completion 竞争。
- deadline 与 result commit 竞争。
- machine 重新注册后的旧 worker token。

## 8. P1：调度和多副本可靠性

当前 list-then-save claim 不能作为多副本 production scheduler 的最终实现。需要：

- 原子 reservation/claim 或持久 CAS。
- single-active execution-bearing Testing attempt。
- per-machine Testing concurrency hard limit。
- reservation expiry 和 cleanup residual blocking。
- control-plane restart 后恢复 run/task/attempt/lease/fence。
- capacity 不能在 `cleanup_outcome=residual_blocking` 时释放给新 Testing Run。

## 9. P1：Snapshot、Events 和 durable delivery

### 9.1 Bounded Snapshot/Event

Snapshot 至少需要：

- stable run ID/version/ref/digest。
- resume cursor。
- `control_status`。
- execution/evidence/upload/cleanup outcomes。
- current attempt identity。
- bounded summary/error。
- result/evidence/cleanup opaque refs + digests。

Event stream 要求：

- immutable sequence 和 digest。
- `after` cursor、limit、has_more。
- duplicate replay。
- cursor expiry -> Snapshot resync。
- 不包含 Artifact bytes 或未清洗本机信息。

### 9.2 Durable callback/outbox

当前有限重试不足以保证 terminal delivery。需要：

- durable outbox。
- stable delivery ID/request digest。
- provider acknowledgement。
- lost response lookup/reconcile。
- callback host allowlist fail closed；空 allowlist 不应默认允许任意 HTTP(S) host。
- delivery repair 不触发 test rerun。

## 10. P1：Artifact 和独立终态

### 10.1 Artifact contract

当前 worker 自报 URI 不是可信 ingestion。Target 需要：

1. Runtime 对 sanitized bytes 计算 digest/media/size。
2. 控制面或 Hosted ArtifactStore 为单对象签发 upload grant。
3. 上传后验证 object key、digest、media、size 和 run/case identity。
4. 返回 opaque Artifact ref 与 ingest receipt。
5. bytes stored/ack lost 时使用同 object key/digest 查询或重放。

Talos result 只携带 refs/digests，Artifact bytes 不经过 heartbeat、findings 或 NyxID Tool response。

### 10.2 正交 outcomes

Talos 需要分别表达：

```text
control_status
execution_outcome
evidence_outcome
upload_outcome
cleanup_outcome
```

示例：

- CaseResult 已冻结，但 upload unavailable。
- execution lost/inconclusive，但 cleanup complete。
- cancel accepted，但 Runtime 仍在 stopping。
- task terminal，但 cleanup residual blocking。

这些状态不能被压成一个 `completed/failed`。

## 11. P2：后续增强

首个 Browser-only canary 完成后再考虑：

- 多 browser/profile/backend。
- API/CLI testing tasks。
- richer Evidence media。
- persistent authenticated profile。
- Secret refs。
- 更复杂的 handoff。
- 多 pool policy 和租户 quota。

不得用 browse/computer_use fallback 替代 testing unavailable；不支持必须明确拒绝。

## 12. 建议实施顺序

### T1：Tool contract 和 strict task

1. Testing capabilities/request/acceptance/snapshot/event/cancel schemas。
2. `QARun` store 与 idempotency。
3. `kind=testing` strict union。
4. bounded `get/events`。

### T2：Attempt correctness

1. `TestingTask`/`TestingAttempt`。
2. atomic placement/claim。
3. generation/fence。
4. local acceptance/no-rerun boundary。
5. stale writer tests。

### T3：Worker/Runtime integration

1. 固定 `TestingExecutor`。
2. `LocalQARuntimeAdapter`。
3. heartbeat/cancel/deadline mapping。
4. terminal result projection。

### T4：Artifact 和 delivery

1. per-object upload grant。
2. digest-bound refs/receipts。
3. durable outbox/callback。
4. lost-ack reconcile。
5. cleanup residual capacity gate。

### T5：Cross-repo canary

1. PQL client fixture。
2. Testing Packages manifest/invocation fixture。
3. macOS arm64 canary pool。
4. happy/failure/cancel/crash/fence/Evidence outage tests。

## 13. 完成标准

Talos Testing Tool MVP 完成时应满足：

- 五个 Tool operation 有稳定、版本化、bounded contract。
- `QARun` 与内部 task/attempt 分离，duplicate submit 可正确 replay/conflict。
- `kind=testing` 不依赖自由文本 goal 或 generic plugin。
- placement、lease、generation、fence 和 local acceptance 边界可验证。
- stale worker 不能继续 Browser effect、upload 或 completion。
- worker 通过固定 executor 调 Runtime，不复制 Testing Packages 语义。
- Snapshot/Events 能在 duplicate、cursor expiry 和 control-plane restart 后收敛。
- result、Evidence、upload 和 Cleanup 可独立解释。
- callback/upload repair 不触发测试重跑。
- task completed 不被解释为 Case passed 或 Final Quality passed。
