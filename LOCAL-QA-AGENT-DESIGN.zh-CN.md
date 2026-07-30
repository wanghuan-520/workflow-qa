# FKST Local QA Agent MVP 实现设计

> 状态：`local_qa_agent_mvp` 当前实施设计，尚未表示对应能力已经实现
> 日期：2026-07-30
> 配套系统设计：[DESIGN.zh-CN.md](DESIGN.zh-CN.md)
> 配套字段与协议规范：[SPEC.zh-CN.md](SPEC.zh-CN.md)
> 未来安全 Profile：[LOCAL-QA-RUNTIME-DESIGN.zh-CN.md](LOCAL-QA-RUNTIME-DESIGN.zh-CN.md)
> 内部拓扑语义源：[fkst-local-qa-agent-internals.mmd](fkst-local-qa-agent-internals.mmd)

## 1. 文档定位与证据边界

本文定义 `fkst-hosted/apps/local-qa-agent` 的进程拓扑、模块边界、最小持久化、环境生命周期、浏览器、Evidence handoff、取消和恢复语义。跨进程字段、严格枚举、签名对象和 wire error 以 [SPEC.zh-CN.md](SPEC.zh-CN.md) 为准；系统级职责和端到端 Run 生命周期以 [DESIGN.zh-CN.md](DESIGN.zh-CN.md) 为准。

本文描述的是 **Target MVP**，不是当前实现状态。当前仓库中真实存在的实现只有 [NyxID Browser Loop PoC](poc/nyxid-browser-loop/server.mjs)，它验证了：

```text
NyxID Cloud
→ NyxID Node
→ 已人工启动的 loopback PoC service
→ playwright-core 启动系统 Google Chrome
→ 固定 fixture 点击与 DOM 断言
→ 内存 Run Result 和本机截图路径
```

PoC 没有实现本设计中的请求认证、Source materialization、container/Compose、Readiness、通用 testing-runner、SQLite journal、取消、Artifact upload、云端报告或自动资源 Cleanup。

## 2. 三个核心需求与结论

| 需求 | MVP 责任链 | 设计结论 |
| --- | --- | --- |
| 云端控制用户本地浏览器 | Hosted 经 NyxID 调用 Agent；Agent 启动自己拥有的系统 Chrome session | 可满足；NyxID 不直接控制 Chrome |
| 本地启动 App、数据库和 Middleware | Agent materialize 固定 Source，并创建 per-run container project | 可满足；容器只提供生命周期隔离，不是 hostile-code Sandbox |
| 本地测试结束后生成云端报告 | Agent 上传结构化结果和脱敏 Evidence；Hosted 生成并保存 ReportRecord | 可满足；最终报告不在 Agent 中 compose |

Local QA Agent 不能完全省略。NyxID Node 是设备传输和 credential injection 层，不拥有 Durable Run，也不具备资源所有权、测试语义、取消、进程树清理和 restart reconciliation。MVP 的目标是把必须存在的本地组件收敛为一个薄代理，而不是把这些职责交给 SSH exec 或 NyxID Node。

## 3. 组件边界与调用拓扑

正式数据面固定为：

```text
Hosted QA Orchestrator
    │ signed LocalQARequestAuthorization
    ▼
NyxID Cloud
    │ scoped API key / service policy / audit
    ▼
explicit node-pinned service
    ▼
NyxID Node
    │ local credential injection
    ▼
127.0.0.1 Local QA Agent
    ├─ Source / Workspace Manager
    ├─ Container Environment Controller
    ├─ Readiness Controller
    ├─ testing-runner Adapter
    ├─ Host Chrome Controller
    ├─ Evidence Stager / Redactor
    ├─ Artifact Upload Client
    └─ Cleanup Manager
```

控制面和数据面分离：

- Run 创建、查询、事件读取和取消经 NyxID route 到 Agent。
- Agent acceptance 必须快速持久化并返回；完整测试不占用单个长代理请求。
- Event 使用 bounded cursor read；断线后由 Hosted 携带 `after_sequence` 重连。
- 大体积 Artifact 不沿 NyxID Run response 返回。Agent 使用短期、单对象 upload capability 直接上传 Hosted artifact ingestion endpoint。
- SSH exec 只用于人工批准的安装、诊断或 break-glass 运维，不是自动 QA Run 协议。

## 4. 进程拓扑与 Module

Agent 是用户级部署目标，不要求 root LaunchDaemon。它可以由 LaunchAgent、桌面应用 helper 或等价用户级 supervisor 启动，只监听 loopback 或受控 Unix socket。

| Module | 责任 | 明确禁止 |
| --- | --- | --- |
| Ingress/Auth Adapter | 处理五个 endpoint，验证 transport credential 和 Hosted 业务授权 | 把“来自 NyxID”当作业务授权 |
| Run Coordinator | 推进 local state，协调 Prepare、Execute、Stage、Cleanup 和 Upload | 自行生成云端 Workflow terminal 或 Quality |
| Small Journal | 保存 request/idempotency、run、event、resource、upload/cleanup attempt | 演化成 Grant/Fence/Effect authority ledger |
| Source/Workspace Manager | 获取 digest-bound Source，验证 SHA，创建 per-run workspace | 执行浮动 branch 或未绑定 source |
| Container Controller | 管理 project、container、network、volume、port 和 service process | 挂载 home、SSH、Keychain、个人浏览器目录或 Docker socket |
| Readiness Controller | 执行 Plan 声明的 typed probes | 把 HTTP service 可达等同于所有依赖 ready |
| Runner Adapter | 调用 `testing-runner` 和 Backend，持久化 Observation/CaseResult | 接受 Backend/LLM 自报 Pass/Fail |
| Browser Controller | 启动 Agent 自有 Chrome process tree、Profile 和 downloads | 附加个人 Chrome 或暴露 arbitrary CDP |
| Evidence Stager | bounded quarantine、redaction、validation、digest | 把 raw bytes 写入普通日志、event 或 cloud |
| Upload Client | post-redaction grant exchange、上传、digest 对账 | 使用 Run 创建时预签的未知 digest grant |
| Cleanup Manager | 依据 resource record 补偿清理并报告 residual | 按模糊名称、端口扫描或进程名删除资源 |

## 5. 四层认证与业务授权

### 5.1 Hosted → NyxID

- 使用专用 workload/API identity，不复用浏览器 session。
- 只允许目标 Local QA Service 和允许的 Node 集合。
- 设置 method/path scope、rate limit 和可选 approval policy。
- 显式绑定 Node；Node 不可用时 fail closed，不回退到 server-side direct route。

### 5.2 NyxID Cloud → Node

该层由 NyxID 自身负责 Node authentication、request integrity、timestamp/nonce/replay protection 和 transport audit。FKST 文档只依赖这些行为，不重新定义 NyxID 内部密码学协议。

### 5.3 Node → Agent

- Node 从本地 credential store 注入每个 Agent 安装实例独有的本地 credential。
- credential 不进入 NyxID Cloud default header、仓库、argv、普通日志或 Run payload。
- Agent 只监听 loopback/Unix socket；地址和相同 UID 不能替代认证。
- 生产禁止 PoC 的 `auth_method=none`。

### 5.4 Hosted 业务授权

每个非 public-health 请求都携带 Hosted 签名的 `LocalQARequestAuthorization`，至少绑定：

- `operation=start|read|cancel`、HTTP method、canonical path 和 request/body digest。
- actor/workload identity、agent instance、device 和 Run。
- Source、Plan、Policy、Profile 与 capability digest；read/cancel variant 禁止混入 start-only authority。
- `issued_at`、absolute expiry/deadline、nonce、purpose 和 signature。

本地 credential 证明请求来自获准 Adapter；Hosted 签名证明具体业务操作获得授权。两层缺一不可。

## 6. 外部 API 与幂等

MVP 只暴露五个 endpoint：

```text
GET  /v1/health
PUT  /v1/runs/{run_id}
GET  /v1/runs/{run_id}
GET  /v1/runs/{run_id}/events?after_sequence=N&limit=M
POST /v1/runs/{run_id}:cancel
```

### 6.1 Health

Public health 只返回 service/version/alive 等非敏感信息。Authenticated health 可以返回 admission、container provider、Chrome availability、active run count、disk pressure 和 recovery reason，但不得启动资源。

### 6.2 Submit

Hosted 预生成 `run_id`，使用 `PUT` 提交。Agent 在创建 workspace、container、port 或 Chrome 前先以 `(idempotency_key, request_digest)` 查询 journal：

- 同 key、同 digest：返回原 acceptance/snapshot。
- 同 key、不同 digest：返回 conflict，零副作用。
- 首次请求：在一个 journal transaction 中写 authorization digest、request、初始 state 和 sequence=1 event，再异步执行。

请求只接受 strict、digest-bound Source/Plan/Environment refs，不接受任意 shell、任意 URL、任意 cwd/env、任意 Compose YAML 或任意 CDP endpoint。

### 6.3 Query 与 Events

`GET /runs/{id}` 返回结构化 Snapshot、Outcome、Receipt refs 和安全错误，不返回 raw Evidence、本地绝对路径或 Secret。

Event endpoint 每次返回 bounded batch：`events[]`、`through_sequence`、`has_more`。完全相同 event 可以重放；同 sequence 不同 digest 是 integrity error。Hosted 必须使用 cursor 重连，不依赖无限长 SSE 或 Agent 主动 push。

### 6.4 Cancel

Cancel request 使用独立 idempotency key、digest、deadline 和 signed `operation=cancel` authorization。Agent 先持久化 cancel intent，再停止 owned Browser/runner/process domain，进入补偿 Cleanup。HTTP acknowledgement 只表示 intent 已接受，不表示资源已经清理。

## 7. Local State、Outcome 与 Event

Local state 表示流程位置：

```text
accepted
→ preparing
→ ready
→ executing
→ staging_evidence
→ cleaning_up_execution
→ uploading
→ finalizing_local
→ terminal
```

失败、取消和超时可以从任一资源持有状态进入 `cleaning_up_execution`。`terminal` 只表示本地必需 action 已 settled 或进入明确 repair backlog，不表示测试通过。

以下 Outcome 独立记录：

- `execution_outcome`
- `evidence_outcome`
- `upload_outcome`
- `cleanup_outcome`

云端继续独立记录 `report_outcome`、`final_quality_outcome` 和 `publication_outcome`。Snapshot 和 event 不按枚举名称直接映射 Hosted WorkflowState。

## 8. Small SQLite Journal

Journal 是最小执行事实存储，不是安全 authority ledger。建议逻辑表：

| 表 | 最小内容 |
| --- | --- |
| `run_requests` | run/request/idempotency key、request digest、authorization digest、deadline、acceptance response |
| `runs` | local state、Outcome、source/plan/profile refs、last error、timestamps |
| `events` | run、sequence、type、payload ref、snapshot digest、created time |
| `resources` | resource id/type、provider ref、ownership label、state、cleanup action |
| `upload_attempts` | artifact key/digest、grant ref、object ref、attempt、outcome、retry time |
| `cleanup_attempts` | target resource set digest、reason、attempt、released/residual refs、outcome |

要求：

- SQLite 使用单进程 writer 或等价串行 transaction boundary，避免同 Run 并发推进。
- request acceptance、初始 state 和首个 event 原子提交。
- 每个资源在 create 前登记 intent，在 create 后写 active provider identity；部分失败也必须可 Cleanup。
- Journal 不保存 Secret 明文、raw Artifact bytes、个人路径或 Node credential。
- migration 必须保持未终态 Run、event cursor、resource ownership、upload/cleanup attempt 可读。

## 9. Source、Workspace 与 Environment

### 9.1 Source Materialization

Agent 只 materialize Hosted 冻结的 immutable Source：

- PR 使用 frozen synthetic merge object；非 PR 使用 exact commit SHA。
- source provider/object/digest 必须与 `SourceAcquisition` 一致。
- 禁止在执行时重新解析浮动 branch、tag 或默认分支。
- workspace 位于 Agent application support 下的 per-run 目录，不写入用户原仓库。

### 9.2 EnvironmentExecutionSpec

MVP 使用 digest-bound、typed Environment spec，至少声明：

- provider/profile 和 source-relative Compose/profile ref。
- logical App、database、Middleware 和 test services。
- startup dependency order、loopback port exposure 和 resource limits。
- typed readiness probes、timeout 和 required/optional 条件。
- runner entry、allowed network destinations 和 opaque credential refs。

Compose/profile 文件必须位于 immutable Source 中并绑定 digest，或来自受信、版本化的 environment pack。Agent 不提供“上传任意 YAML 后执行”或通用 shell endpoint。

### 9.3 Container Boundary

每 Run 创建独立 project、network、volume 和 ownership labels：

- source 只读或 Run 专属 copy-on-write。
- 禁止挂载用户 home、SSH、Keychain、个人 Chrome、其他 repo 和 Docker socket。
- 只向宿主发布 Plan 声明的 loopback ports。
- CPU、memory、disk、process count 和 wall-clock 有显式上限。
- dependency installer 和 lifecycle scripts 只在 trusted-input policy 允许时执行。

这些约束用于可重复环境和可靠 Cleanup，不构成 hostile-code、容器逃逸或同用户攻击防护承诺。

### 9.4 Conditional Readiness

Readiness 只检查 Plan 声明且当前 Case 需要的 logical service。每项 probe 记录 target、attempt、timeout、observation 和 outcome。`GET /health` 可达不等于 Chrome、App、数据库或 Middleware ready。

## 10. testing-runner 与 Host Chrome

`testing-runner` 根据 Structured Assertion 计算 AssertionResult 和 CaseResult。Backend 只返回 Observation；`exit_code=0`、LLM 文本或 Browser action 成功都不能单独决定 Case passed。

MVP execution context 只包含 Run/Plan/Step、PreparedEnvironment、approved action envelope、attempt 和 deadline，不携带 Hardened `ExecutionFence`、`ExecutionGrant` 或 `EffectGate`。

Browser Controller：

- 使用本机安装的 Chrome executable，但每 Run 创建独立 process tree。
- 使用 temporary profile 和 isolated downloads，不接管用户现有 Chrome。
- 只执行 Plan 中的 typed BrowserAction；不向 Hosted、NyxID 或 worker 暴露 arbitrary CDP。
- 默认访问本 Run loopback target；额外 origin 必须在 Plan 中声明。
- screenshot、DOM、trace、network 和 download metadata 先进入 Evidence quarantine。
- Cancel、timeout、failure 和 restart cleanup 都必须终止 process tree 并处理 Profile/downloads。

MVP 不承诺 OS 级 direct-socket denial。需要 hostile page、强浏览器 egress enforcement 或复用个人登录状态时，必须使用独立显式授权能力或 Hardened Profile。

## 11. Evidence、Upload 与执行资源 Cleanup

### 11.1 本地 Pipeline

```text
raw observation
→ bounded quarantine
→ RedactionPolicy
→ RedactionReceipt
→ sanitized validation
→ post-redaction digest
→ EvidenceStagingManifest
→ cleanup execution resources
→ request per-object ArtifactUploadGrant
→ upload / digest reconcile
→ cleanup sanitized staging or retain until bounded TTL
```

Raw quarantine 永不进入 `getRun`、event、NyxID、Hosted report 或 object storage。失败的 redaction 不产生可上传 Artifact。

### 11.2 Grant Exchange

Run request 只携带 `artifact_upload_policy_ref` 和 grant exchange capability，不携带未知 digest 的 upload grant。Agent 完成 redaction后向 Hosted 提交 artifact key、post-redaction digest、media type 和 size；Hosted 返回单 Run、单对象、短 TTL、upload-only grant。

Agent 使用稳定 object key 和 digest 对账：上传响应丢失时先查询或重试同一 logical object，不生成第二个 Artifact identity。

### 11.3 先释放执行资源

Artifact staging 完成后，Agent 应先关闭 Chrome、runner、App/Middleware、containers、ports、networks、volumes 和 workspace，再等待上传或云端恢复。允许保留的只有经过脱敏的 staging bytes、upload attempt 和必要 journal metadata，并受独立 TTL/size limit 管理。

这避免 Hosted 暂时不可用时继续占用用户 CPU、内存、端口和浏览器。最终 `CleanupSummary` 同时投影 execution resource cleanup 和 staging cleanup，二者的 residual 不互相覆盖。

## 12. Cancellation、Timeout、Restart 与 Cleanup

### 12.1 Resource Ownership

workspace、container、network、volume、port、process、Chrome、Profile、downloads、quarantine 和 sanitized staging 都必须有精确 resource record。Cleanup 只能使用记录中的 provider identity/ownership label，禁止按模糊名称清理。

### 12.2 清理顺序

1. 持久化 cancel/timeout/failure intent，停止接纳新 Step。
2. 终止 Browser 和 runner process tree。
3. 停止 App/Middleware/test service。
4. 删除 container、network 和 volume。
5. 释放 port 和 workspace。
6. 删除 raw quarantine；sanitized staging 按 upload outcome 删除或保留到 TTL。
7. 写入 released、missing、identity mismatch、unknown 和 retryable residual。

### 12.3 Restart

Agent 启动时先关闭 admission，恢复 journal 并对未终态 Run 做 provider discovery：

- 不自动从 `executing` 继续 Case。
- 允许恢复 `getRun` 和 cursor event read。
- 允许对明确 digest/object key 的 upload attempt 做对账。
- 对 journal 中已知 owned resources 执行 cleanup/reconcile。
- 无法确认 ownership 的资源标为 residual，不猜测删除。

## 13. 云端 Artifact、Quality 与 Report 边界

Agent 输出本地执行事实：

- StructuredTestResult / CaseResult refs。
- EvidenceStagingManifest 和 ArtifactUploadReceipt。
- LocalAgentCleanupReceipt 与 profile-neutral CleanupSummary。
- execution/evidence/upload/cleanup Outcome。

Hosted 执行：

```text
ArtifactUploadReceipt
→ ArtifactIngestReceipt + durable ArtifactPointer
→ immutable ReportInputSet
→ QualityEvaluation
→ DeterministicReport JSON / HTML / Markdown
→ optional NarrativeSupplement
→ ReportRecord + object storage
→ GitHub / PQL Publication
```

报告通过率、失败 Case、耗时、Evidence refs、Cleanup 和 Quality 由确定性规则计算。NarrativeSupplement 可以总结失败和风险，但不能改变 Assertion、Case Pass/Fail、FinalQualityOutcome 或 publication eligibility；生成失败不能触发本地重跑。

## 14. Security、Audit 与 Operations

- NyxID audit 记录 transport actor/service/node/path/status；Hosted audit 记录 Workflow/Policy/Quality/Publication；Agent journal/audit 记录 request、state、resource、upload 和 cleanup。三侧使用 `run_id + request_id + request_digest + node_id + agent_instance_id` 关联。
- NyxID transport audit 不能作为 Agent 已持久接受 Run 或本地副作用已完成的 Receipt。
- Agent 日志必须结构化、限长、脱敏，不记录 credential、authorization payload 全文、raw Artifact 或用户绝对路径。
- Agent 更新前停止新 admission；active Run 完成或进入 cancel/cleanup。更新后先完成 journal migration、resource discovery 和 health check。
- 卸载前停止新 Run，处理 active resources，并向用户和 Hosted 显示无法清理的 residual。

## 15. Hardened Profile 升级条件与兼容映射

以下任一条件成立时，MVP 必须拒绝：

- 外部 fork、未知仓库或无法信任的依赖/lifecycle scripts。
- 开放式 Shell、Codex/Agent Action 或动态扩大文件、网络、Secret、Browser 权限。
- 生产 Secret、私网、云账号或高价值本地数据。
- 需要强 fencing、effect-before-commit recovery、跨重启 execution takeover。
- 需要 OS 级 Browser egress enforcement、direct-socket denial 或可审计 hostile-code 隔离。

Profile 兼容关系：

| Common contract | Agent 实现 | Hardened Runtime 实现 |
| --- | --- | --- |
| Source/Plan/CaseResult | Hosted frozen Plan + container execution | Design/Execution VM + Grant |
| Local request | 五 endpoint + signed request authorization | 八方法 RuntimeService + command/fence |
| Persistence | small run/resource/upload journal | single-writer authority ledger + effect/event outbox |
| Isolation | trusted-input container environment | per-phase VZ hostile-code Sandbox |
| Cleanup | resource records + compensating cleanup | sealed inventory + CleanupCapability/successor |
| Evidence | upload-only handoff | Hardened local ArtifactStore/capability read |
| Recovery | query/upload reconcile/cleanup, no rerun | signed RecoveryDecision 与 purpose-specific takeover |

## 16. 实施阶段与验收

### A0：契约闭合

- 五 endpoint、request authorization、state/outcome、EnvironmentExecutionSpec、journal、CleanupSummary 和 grant exchange contract。
- Rust/TypeScript/Hosted 或实际实现语言共享 canonicalization/strict-union fixtures。

### A1：NyxID + Agent + Chrome

- 用户级 Agent、本地认证、small journal、submit/get/events/cancel。
- system Chrome temporary profile、structured result、basic Cleanup。

### A2：Container Environment + Runner

- immutable Source/workspace、Compose/container、App/DB/Middleware、Readiness。
- testing-runner、Deterministic/Browser Backend、cancel/timeout/restart cleanup。

### A3：Evidence + Cloud Report

- quarantine/redaction、post-redaction grant exchange、upload/ingestion。
- CleanupSummary、QualityEvaluation、deterministic JSON/HTML/Markdown report、ReportRecord 和 Publication repair。

Definition of Done：

- [ ] Hosted 经显式 node-pinned NyxID service 到达 authenticated Agent，Node offline fail closed。
- [ ] 所有非 public-health endpoint 同时验证 local transport credential 和 Hosted business authorization。
- [ ] 同 key 同 digest 幂等返回；同 key 不同 digest 零副作用。
- [ ] Agent 不提供 arbitrary shell/URL/cwd/env/Compose/CDP endpoint。
- [ ] Source、container、network、volume、port、process、Chrome、Profile、downloads 和 staging 全部有 run ownership。
- [ ] success/failure/cancel/timeout/restart 都产生 CleanupSummary 或明确 residual。
- [ ] Agent restart 不自动重跑 Case。
- [ ] raw Evidence 不离开本机 quarantine；post-redaction bytes 才可申请 upload grant。
- [ ] 执行资源 Cleanup 不等待云端长期可用；仅 sanitized staging 可按 TTL 保留。
- [ ] Hosted 可由同一 ReportInputSet、ruleset 和 template 重放确定性报告。
- [ ] Narrative/Report/Publication repair 不修改测试事实，也不重跑本地测试。
- [ ] `hardened_untrusted_code` 请求被 Agent 明确拒绝，不静默降级。
