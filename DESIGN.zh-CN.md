# FKST Host 经 NyxID 触发用户本地自动化 QA：目标架构设计

> 状态：implementation-ready 设计基线，尚未表示对应能力已经实现
> 日期：2026-07-30
> 当前实施 Profile：`local_qa_agent_mvp`
> 未来安全 Profile：`hardened_untrusted_code`
> 对应规范：[SPEC.zh-CN.md](SPEC.zh-CN.md)
> 当前本地 Host 设计：[LOCAL-QA-HOST-DESIGN.zh-CN.md](LOCAL-QA-HOST-DESIGN.zh-CN.md)
> 未来 Hardened Runtime 设计：[LOCAL-QA-RUNTIME-DESIGN.zh-CN.md](LOCAL-QA-RUNTIME-DESIGN.zh-CN.md)

## 1. 文档状态、权威关系与 Profile

本文定义系统级职责、信任边界、部署拓扑、端到端生命周期和实施顺序。跨进程字段、严格枚举、Interface、状态机和错误契约以 [SPEC.zh-CN.md](SPEC.zh-CN.md) 为准；当前 Host 的本地进程、容器、浏览器、暂存、上传和 Cleanup 以 [LOCAL-QA-HOST-DESIGN.zh-CN.md](LOCAL-QA-HOST-DESIGN.zh-CN.md) 为准；未来不可信代码执行以 [LOCAL-QA-RUNTIME-DESIGN.zh-CN.md](LOCAL-QA-RUNTIME-DESIGN.zh-CN.md) 为准。

主要语义来源如下：

- [系统 Mermaid](fkst-host-nyxid-local-qa-flow.mmd)：当前 MVP 主链和未来 Hardened 分支的系统语义基准。
- [Host 内部 Mermaid](fkst-local-qa-host-internals.mmd)：当前 Local QA Host 内部语义基准。
- [Runtime 内部 Mermaid](fkst-local-qa-runtime-internals.mmd)：只适用于未来 Hardened Runtime。
- [NyxID 到本地 Chrome 最小闭环验证](NyxID-Local-Chrome-Minimal-Loop-Validation.md)：只证明实际跑通过的 Cloud → Node → loopback service → Chrome → structured result 链路。
- `old/` 与 [历史架构评审](FKST-NyxID-Local-QA-Architecture-Review.md)：仅作为历史资料，不是当前实现规范。

系统存在两个明确 Profile：

| Profile | 状态 | 可接受输入 | 本地隔离与授权模型 |
| --- | --- | --- | --- |
| `local_qa_agent_mvp` | 当前实施基线 | 受信任、已审查或组织明确允许的项目代码和测试定义 | per-run 容器负责生命周期隔离；Local QA Host 负责资源所有权、浏览器、证据和 Cleanup；不宣称抵御 hostile code |
| `hardened_untrusted_code` | 未来安全增强 | 外部 fork、未知依赖脚本、开放式 Shell/Agent Action、真实高价值 Secret | 保留 VZ Linux VM、Design/Execution Grant、LocalLeaseBinding、EffectGate、fencing、authority ledger、Warden、Secret Broker 和 signed recovery |

MVP 合规不得被描述为 Hardened Profile 合规。只要输入可能主动攻击宿主、依赖安装脚本不可信、需要开放式 Agent Action，或 Secret 泄露影响显著，就必须拒绝 MVP Profile，等待 Hardened Profile。

全文使用四种状态词，禁止混用：

| 状态词 | 允许描述的内容 |
| --- | --- |
| Current implementation | 当前仓库中可以直接检查的 PoC 源码行为 |
| Verified PoC | 2026-07-24 实际跑通过的 NyxID → 已运行 PoC service → Chrome 链路 |
| Target MVP | `A0-A3` 待实现、待通过 Exit Gate 的 Local QA Host 能力 |
| Future Hardened | VZ、EffectGate、fencing、authority ledger、signed recovery 等未来能力 |

## 2. 背景、目标与非目标

### 2.1 背景

FKST 需要从云端创建和追踪 QA Run，同时利用用户电脑上的本地源码、真实服务依赖和系统 Chrome。云端不能直接进入用户网络，NyxID 已经提供安全的设备反向通道；但是 NyxID 的职责是路由、凭据 broker 和审计，不是通用进程监督器。

当前核心需求是：

1. Hosted 可以经 NyxID 到达用户设备，并请求本地 Chrome 自动化。
2. 用户设备可以为一个 Run 启动隔离的 App、数据库和 Middleware，执行全部测试，并可靠清理。
3. 本地测试结束后，结构化结果和脱敏 Evidence 上传云端，由云端生成、保存和发布测试报告。

### 2.2 目标

当前设计建立以下 Durable QA Run：

```text
Create Run
→ Freeze Source / Plan / Policy
→ Select Device and Local Execution Profile
→ Dispatch control request through NyxID
→ Prepare per-run Containers
→ Conditional Readiness
→ Execute Tests and Host Chrome Actions
→ Collect Structured Results
→ Quarantine / Redact / Stage Evidence
→ Cleanup Chrome / Runner / Containers / Ports
→ Exchange per-object Upload Grants
→ Upload or Reconcile Sanitized Artifacts
→ Finalize Local Staging
→ Cloud Artifact Ingestion
→ Quality Evaluation
→ Deterministic JSON / HTML / Markdown Report
→ Optional Narrative Supplement
→ Persist ReportRecord and rendered objects
→ GitHub / PQL Publication
→ Finalize Settlement
```

系统应支持 PR、exact commit、手动和 API 入口；支持 Deterministic、Browser 和受限 Agent Backend；在失败、取消、超时、Node 断线和 Local QA Host 重启后收敛到可解释状态。

### 2.3 非目标

当前 MVP 不承诺：

- 抵御恶意 PR、恶意依赖 installer、容器逃逸或同一用户账户已经被攻陷。
- 接管用户已经打开的 Chrome、复用个人 Profile、Cookies、Keychain 或 Extensions。
- 让 NyxID Node Checkout 代码、启动容器、控制 Chrome、执行测试、判断 Pass/Fail 或生成报告。
- 在 Local QA Host 中生成最终 Quality、持久化长期报告或直接发布 GitHub/PQL。
- 自动执行任意 Shell、任意 CDP、任意宿主路径、任意网络目的地或任意 Secret 用途。
- 删除现有 Hardened Runtime 设计；它作为未来 Profile 保留。

## 3. 已验证事实与能力缺口

### 3.1 已验证事实

现有 POC 已证明：

```text
NyxID Cloud
→ 用户设备上的 NyxID Node
→ 已运行的 loopback-only 本地服务
→ playwright-core 启动系统 Google Chrome
→ 页面访问、点击、DOM 断言和截图
→ 结构化 Run Result
→ NyxID Node
→ 调用方
```

因此可以确认：

- 用户电脑不需要开放公网入站端口。
- NyxID Node 可以路由到 loopback-only 本地服务。
- 本地服务可以在不依赖 IDE 的情况下启动系统 Chrome。
- Submit + Poll 可以返回 Run ID、状态和结构化结果；当前 Evidence 仅是本机截图绝对路径，截图 bytes 没有经 NyxID 上传或持久化。
- NyxID 不需要理解浏览器动作或测试判定。

### 3.2 尚未实现的能力

POC 尚未证明：

- Local QA Host 安装、认证、升级和设备注册。
- Source materialization、容器/Compose 生命周期、真实 App/Middleware、Readiness 和资源限制。
- testing packages 与 Local QA Host 的正式集成。
- 临时 Chrome Profile、下载目录、进程树所有权和 Cleanup。
- 本地持久 run/resource journal、重启后查询和资源对账。
- Evidence quarantine、redaction、short-lived upload grant 和云端 artifact ingestion。
- ReportInputSet、QualityEvaluation、ReportRecord、GitHub/PQL publication 和 repair。

这些能力仍必须按对应里程碑实现和验收，不能从目标设计推断为已经存在。

## 4. 核心架构原则与不变量

1. **云端持久编排，本地薄执行。** Hosted 保存 Durable Run；Local QA Host 只管理当前设备上的执行和资源。
2. **NyxID 是设备通道，不是本地执行器。** NyxID 负责路由、传输认证、凭据 broker 和审计，不负责测试生命周期。
3. **本地请求必须独立授权。** 请求经 NyxID 到达并不等于业务允许执行；Local QA Host 必须校验目标设备、Run、Source/Plan digest、Profile、TTL、nonce 和 idempotency key。
4. **MVP 只接受受信任输入。** 容器是生命周期隔离和资源打包手段，不是 hostile-code 安全边界。
5. **Source 和 Plan 固定。** 测试必须绑定 immutable effective SHA 和 versioned Structured Plan；换 revision 创建新 Run。
6. **Runner 决定 Case Pass/Fail。** Backend 和 LLM 只提供 Observation，不得自报测试结论。
7. **宿主 Chrome 独立于容器。** Chrome 使用专用进程、临时 Profile 和独立下载目录；不得附加个人 Chrome 或暴露 arbitrary CDP。
8. **原始 Evidence 不离开设备。** 原始日志、DOM、截图、Trace 和下载先进入 bounded quarantine；只有完成 redaction 和 validation 的 bytes 才可上传。
9. **云端拥有长期 Artifact 和报告。** Local QA Host 只做短期 staging；云端负责持久存储、访问、保留、删除和报告索引。
10. **Cleanup 是强制补偿阶段。** 成功、失败、取消、超时和 Agent 重启都必须尝试 Cleanup；Cleanup outcome 与 execution outcome 分离。
11. **状态与 Outcome 分离。** Workflow state 表示流程位置；execution、evidence、upload、cleanup、report、quality 和 publication 分别记录结果。
12. **所有副作用幂等。** Run 提交、容器创建、Chrome 启动、Artifact 上传、报告生成和 Publication 都使用稳定 key 和 digest 对账。
13. **凭据保持最小用途。** NyxID 可以 broker credential，但 Local QA Host 只能获得 opaque reference 或面向精确动作的短期 material；不得把 Secret 写入普通日志、结果或 Artifact。
14. **Hardened 安全能力不能被静默降级。** 请求声明 `hardened_untrusted_code` 时，MVP Host 必须拒绝，不能改用普通容器继续。
15. **Terminal 表示 settled。** 必需 action 已成功、失败、跳过或进入明确 repair backlog 后才可 terminal；不表示全部成功。

## 5. 仓库、模块与部署拓扑

目标代码结构位于 `fkst-hosted` monorepo：

```text
ChronoAIProject/fkst-hosted
├── apps/hosted-control-plane
├── apps/local-qa-agent
└── packages/
    ├── qa-contracts
    ├── workflow-qa
    ├── testing-design
    ├── testing-runner
    ├── backend-contract
    ├── environment-factory
    ├── test-artifacts
    ├── quality-evaluation
    └── test-publication

ChronoAIProject/NyxID
YueZh127/product-quality-loop
```

| 部署目标 | 运行位置 | 主要目的 |
| --- | --- | --- |
| `apps/hosted-control-plane` | FKST 云端 | Durable Run、Source/Plan/Policy、调度、artifact ingestion/storage、Quality、report composition/storage、Publication 和 repair |
| `apps/local-qa-agent` | 用户电脑 | NyxID 可达的用户级薄代理；容器、Readiness、runner、宿主 Chrome、Evidence staging/redaction/upload 和 Cleanup |
| NyxID Cloud | NyxID 云端 | 认证调用方、解析 Service、执行 scope/approval/rate limit、选择 Node、代理审计；不拥有 QA Run |
| NyxID Node | 用户电脑 | 维护主动出站通道、验证 Cloud 请求、从本地 credential store 注入凭据并调用 loopback service |
| Node-routed Service | NyxID 配置对象 | 将稳定 service slug 映射到明确 Node 和本地 endpoint；它不是 daemon、进程编排器或 Sandbox |
| NyxID SSH exec | 运维路径 | 仅用于人工批准的安装、只读诊断或 break-glass；禁止作为正式 QA Run 数据面 |
| PQL | 独立服务 | 测试策略、Project Pack、Coverage Gap、Proposal、Review 和 Promotion |

两个 app 独立构建和发布。`packages/*` 是可组合模块，不是独立 daemon，也不得依赖 apps 的实现。

## 6. 组件职责与边界

### 6.1 Hosted Control Plane

负责：

- RunDraft、SourceAcquisition、RunSpec、Structured Plan 和 Policy。
- 设备选择、Profile 选择、dispatch、Checkpoint 和恢复编排。
- short-lived ArtifactUploadGrant 签发与 artifact ingestion。
- durable artifact/object storage、访问控制、retention 和 deletion。
- ReportInputSet、QualityEvaluation、DeterministicReport、NarrativeSupplement 和 ReportRecord。
- GitHub/PQL PublicationPlan、Receipt、repair 和最终 settlement。

不负责：直接运行项目代码、本地容器、Chrome 动作或本地 Cleanup。

### 6.2 Local QA Host

负责：

- 认证 NyxID 到 loopback/Unix socket 的请求，并验证 Run envelope。
- 创建 per-run workspace、container project、network、volume、port reservation 和 staging 目录。
- 启动 App、数据库和 Middleware，执行 conditional Readiness。
- 调用 `testing-runner`，把 Backend Observation 转为结构化 CaseResult。
- 按需启动专用宿主 Chrome、临时 Profile 和下载目录。
- 收集原始 Evidence，执行 quarantine、redaction、sanitized validation 和 upload。
- 持久化最小 run/resource/upload journal，以支持幂等、查询、重启后 Cleanup 和上传对账。
- 在所有终止路径清理属于该 `run_id` 的资源，并输出 CleanupReceipt。

不负责：签发业务 Grant、生成最终 Quality、长期保存 Artifact/Report、直接发布 GitHub/PQL，或把普通容器宣称为 hostile-code sandbox。

### 6.3 Local QA Host 内部角色

| 角色 | 责任 |
| --- | --- |
| Ingress/Auth Adapter | 接收 NyxID 路由请求，验证本地认证、Run envelope、TTL、nonce 和 idempotency |
| Run Coordinator | 推进 local state，协调准备、执行、上传和 Cleanup |
| Small Run Journal | 保存 run、event、owned resource 和 upload attempt；不是完整 authority ledger |
| Container Controller | 管理 per-run container/Compose project、network、volume、port 和 process labels |
| Readiness Controller | 执行 Plan 声明的健康检查，不强制无关能力 |
| Runner Adapter | 调用 testing-runner 和 Backend，保存结构化结果 |
| Browser Controller | 启动和控制专用 host Chrome，管理 profile、downloads 和 process tree |
| Evidence Stager/Redactor | 管理 bounded quarantine、redaction、validation 和 post-redaction digest |
| Upload Client | 使用 short-lived grant 上传 sanitized artifacts 并记录 Receipt |
| Cleanup Manager | 按 run ownership 停止和删除容器、进程、端口、Chrome 和临时文件 |

### 6.4 Testing Packages

- `testing-design` 生成 Structured Plan。
- `testing-runner` 根据结构化 Assertion 决定 Case Pass/Fail。
- `environment-factory` 提供 Prepare、Readiness、resource registration 和 compensation Cleanup 领域接口，由 Local Agent 注入 container adapter。
- `test-artifacts` 提供 EvidenceManifest、redaction 和 artifact identity。
- `quality-evaluation` 在云端生成 Final Quality Outcome。
- `test-publication` 只消费 QualityEvaluation 和 ReportRecord，不重新解释原始日志。

## 7. 信任、认证与请求边界

MVP 使用四层认证与授权：

```text
Hosted workload identity
→ NyxID scoped service/node authorization
→ NyxID Cloud-to-Node transport protection
→ Node-injected local Agent credential
→ Hosted-signed LocalQARequestAuthorization
→ Local QA Host admission
```

| 层 | 证明内容 | 不能证明的内容 |
| --- | --- | --- |
| Hosted → NyxID | 调用方可访问目标 service/node，满足 scope、rate limit 和可选 approval | 具体 Run 已获得 FKST 业务授权 |
| Cloud → Node | 请求来自 NyxID Cloud，满足 NyxID 的 integrity、freshness 和 replay 检查 | Agent 已持久接受 Run 或本地副作用已完成 |
| Node → Agent | 调用者持有该 Agent 安装实例的本地 credential | 请求中的 Source/Plan/Profile 合法 |
| Hosted business authorization | 精确 operation、method/path/body digest、actor、agent/device/run、TTL、nonce 和 purpose 获得签名授权 | NyxID transport 当前在线或本机 capability 满足 |

Local QA Host 对每个非 public-health request 至少验证：

- local transport authentication 和目标 agent/device identity。
- `LocalQARequestAuthorization` 的 `start | read | cancel` strict variant、签名、purpose 和 audience。
- `run_id`、`request_id`、idempotency key、HTTP method/path 和 canonical request/body digest。
- start variant 的 immutable source、plan、policy、profile 和 capability digest。
- absolute deadline、TTL、nonce 和 replay state。
- container/browser/resource requirements 是否在本机能力范围内。

MVP 不要求完整 Design/Execution Grant、LocalLeaseBinding 或 fence protocol。Hardened Profile 继续使用这些机制，但不能把它们混入 Agent 的公共 Backend、journal 或 API。

生产 endpoint 禁止 `auth_method=none`。Loopback、相同 UID、Node identity 或请求来自 NyxID 本身都不能替代 authentication 和 business authorization。显式 node pin 不可用时必须 fail closed，禁止静默改走 server-side direct route。

## 8. Source、Plan 与执行范围

PR 默认测试固定 synthetic merge commit；非 PR Run 使用 exact commit SHA。Hosted 完成 SourceAcquisition 后冻结 RunSpec，Local QA Host 只 materialize 和验证该 immutable revision。

Structured Plan 至少声明：

- Case、Step、Backend 和结构化 Assertion。
- environment profile、App/Middleware、依赖和 readiness。
- 容器资源上限、端口和允许的网络目的地。
- 是否需要宿主 Chrome、允许的 BrowserAction 和 target origin。
- Evidence requirements、redaction policy 和 upload policy。
- Secret 的 opaque reference、用途和允许的目标进程/服务。

MVP 不允许 Backend 在执行中扩大范围。出现新增命令、目录、网络、Secret、Browser 权限或显著预算时，Run 进入 `amendment_pending` 或 blocked；修订后必须产生新的 Plan version 和批准结果。Source revision 变化必须创建新 Run。

## 9. Local QA Host MVP 生命周期

| 阶段 | 行为 | 主要产物 |
| --- | --- | --- |
| Create / Source | 创建 RunDraft，解析并冻结 immutable source | RunSpec、SourceAcquisition |
| Plan / Policy | 生成和审查 Structured Plan，选择 `local_qa_agent_mvp` | Plan、PolicyDecision |
| Dispatch | Hosted 经 NyxID 对 `PUT /v1/runs/{run_id}` 提交目标 Agent | LocalQARunRequest、acceptance event |
| Prepare | 创建 per-run workspace、containers、network、volumes、ports | PreparedEnvironment、resource records |
| Readiness | 按 Plan 检查 App/Middleware；仅 Browser Run 准备 Chrome | ReadinessReceipt |
| Execute | runner 选择 Backend，结构化 Assertion 生成 CaseResult | StructuredTestResult、CaseResult |
| Collect | 收集 logs/DOM/screenshots/traces/download metadata | raw quarantine entries |
| Stage | Redact、validate、计算 post-redaction digest | EvidenceStagingManifest |
| Cleanup execution | 停止 Chrome/runner/services/containers，释放 ports/networks/volumes/workspace | LocalAgentCleanupReceipt、CleanupSummary |
| Grant exchange / Upload | 按 post-redaction digest 申请 short-lived per-object grant，上传或对账 sanitized artifacts | ArtifactUploadGrant、ArtifactUploadReceipt |
| Finalize local | 删除 sanitized staging，或按 bounded TTL 保留并进入 upload repair | staging cleanup outcome |
| Ingest | 云端校验 upload receipts 和 object digests | ArtifactIngestReceipt |
| Quality | 聚合 Case、Coverage、Evidence 和 Cleanup | QualityEvaluation |
| Report | 构建 deterministic core，可选 narrative，保存 ReportRecord | ReportCompositionReceipt、ReportRecord |
| Publish | 幂等更新 GitHub/PQL | PublicationReceipt |
| Finalize | 对账各 Outcome 和 repair backlog | RunSettlement |

### 9.1 Local State

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

任何已经拥有执行资源的失败、取消、超时或 Agent shutdown recovery 都必须进入 `cleaning_up_execution`。Evidence 完成 staging 后，执行资源 Cleanup 不等待云端上传成功；只有 sanitized staging 可以按独立 TTL 保留到 `uploading/finalizing_local`。Agent 重启不得自动重新执行测试；它只能恢复查询、对账 upload attempt，并清理 journal 中已知 owned resources。

### 9.2 资源所有权与 Cleanup

每个资源必须携带可验证的 `run_id` owner label 或等价 handle：

- workspace 和 staging directory。
- Compose project/container、network 和 volume。
- App/Middleware/test process。
- port reservation/proxy。
- Chrome process tree、temporary profile 和 downloads。
- artifact upload attempt。

Cleanup 只能作用于本 Run 的精确资源记录，不按模糊进程名、目录名或端口扫描删除其他资源。资源找不到、所有权不匹配和部分失败必须写入 CleanupReceipt，而不是被视为成功。

## 10. 容器、服务与浏览器边界

### 10.1 Container Environment

MVP 推荐一个 Run 一个 Compose project 或等价 container namespace：

- Workspace 只挂载固定 source 和本 Run 的可写目录。
- 禁止挂载用户 home、SSH、Keychain、个人浏览器目录、无关仓库和 Docker socket。
- App、数据库和 Middleware 位于 per-run network。
- 只向宿主发布 Plan 声明的 loopback ports。
- CPU、memory、disk、process 和 wall-clock 有显式上限。
- 依赖和 lifecycle scripts 仅在 trusted-input policy 允许时执行。

Container Provider 可以是 Docker/Compose、Podman 或未来 adapter，但同一 Profile 的 ownership、readiness、result 和 cleanup contracts 不变。

### 10.2 Host Chrome

Browser Run 使用本机安装的 Chrome executable，但必须：

- 每 Run 启动独立 process tree。
- 使用临时 Profile 和下载目录。
- 只通过 typed BrowserAction/control channel 操作。
- 默认访问本 Run 暴露的 loopback target；额外 origin 必须由 Plan 声明。
- 禁止附加用户现有 Chrome、读取个人 cookies/extensions 或暴露任意 CDP endpoint。
- screenshot、DOM、trace 和 download 在外传前进入 Evidence pipeline。

若未来必须复用用户登录状态，应引入独立的显式授权能力，例如 browser extension 的 per-tab approval 或用户导出的 storage state；不得作为 MVP 默认行为。

## 11. Hardened Untrusted-Code Profile

以下任一条件成立时，MVP Host 必须拒绝并要求 Hardened Profile：

- 外部 fork 或无法信任的仓库代码。
- 未审查的 dependency installer 或 project lifecycle script。
- 开放式 Shell、Codex/Agent Action 或动态扩权。
- 生产 Secret、私网、云账号或高价值本地数据。
- 需要强 crash recovery、fencing、跨重启 execution takeover 或外部审计证明。
- 需要 OS 级浏览器 egress 强制和 direct-socket denial。

Hardened Profile 保留现有设计：

- per-phase/per-generation VZ Linux VM。
- Design/Execution Approval Evidence 和 Grant。
- pre-Grant LocalLeaseBinding、generation/fence 和 replay protection。
- mediated EffectGate / Local PEP。
- single-writer authority ledger、effect/event outbox 和 uncertain reconciliation。
- Process Warden、Secret Broker、Browser network enforcement。
- Inventory seal、CleanupCapability successor 和 signed recovery。
- signed launcher、migration、anti-rollback 和 update recovery。

这些能力不再阻塞 MVP，但不得被删除、弱化或通过 Profile 名称混淆。

## 12. Evidence、云端报告、Quality 与 Publication

### 12.1 本地 Evidence Handoff

本地原始数据只进入 bounded quarantine。Redaction 成功后生成 EvidenceStagingManifest，包含 media type、post-redaction digest、size 和 policy version。Run 创建时只提供 `artifact_upload_policy_ref` 与 grant exchange capability；Agent 计算出 post-redaction digest 后才向 Hosted 申请 short-lived、per-object ArtifactUploadGrant。grant 不允许列举其他 Run、覆盖不同 digest 或读取原始 quarantine。

控制请求、Snapshot 和结构化结果经 NyxID route；Artifact bytes 使用短期 capability 由 Agent 直接上传 Hosted artifact ingestion endpoint，不占用 NyxID 的长代理响应。云端收到对象后验证 digest、size、media type 和 grant binding，生成 ArtifactIngestReceipt 和 durable ArtifactPointer。执行资源在 staging 完成后即可清理；Local Agent 收到 upload receipt 后删除 sanitized staging，响应丢失时按 object key/digest 对账，不重复创建逻辑 Artifact。

### 12.2 Cloud Report Pipeline

```text
CaseResult + EvidenceManifest + ArtifactIngestReceipt + CleanupReceipt
→ immutable ReportInputSet
→ QualityEvaluation
→ DeterministicReport core
→ optional NarrativeSupplement
→ ReportRecord + ReportCompositionReceipt
→ PublicationPlan
```

DeterministicReport 必须可由同一 input set digest、quality ruleset 和 report template version 重放。NarrativeSupplement 可以由 LLM 生成，但必须记录 generator、model、prompt policy 和 input digest，并且：

- 可以 `generated`、`skipped` 或 `failed`。
- 不能改变 Case Pass/Fail、Evidence refs、Quality classification、Final Quality Outcome 或 publication eligibility。
- 失败不能丢失 deterministic report，也不能要求重跑本地测试。

ReportRecord 是云端长期权威对象；MVP required renderer 为 JSON、HTML 和 Markdown，PDF 仅作为未来可选输出。GitHub/PQL Publication 只能消费 ReportRecord、QualityEvaluation 和已授权 ArtifactPointer。

### 12.3 Outcome

| Outcome | 说明 |
| --- | --- |
| `execution_outcome` | 测试执行 passed/failed/cancelled/timed_out/lost/blocked |
| `evidence_outcome` | Evidence sufficient/partial/insufficient/not_available |
| `upload_outcome` | sanitized artifact upload succeeded/partial/failed/not_required |
| `cleanup_outcome` | 本地资源 succeeded/partially_succeeded/failed/not_required |
| `report_outcome` | report composed/partially_composed/failed/skipped |
| `final_quality_outcome` | pass/fail/blocked/inconclusive |
| `publication_outcome` | published/partially_published/failed/skipped |

Quality 不因 Report narrative、Publication 或 Cleanup 失败被改写；但 Evidence/upload 不足可以使 Quality 为 inconclusive。Report/Publication repair 不重跑测试。

## 13. 可靠性、幂等与恢复

- `PUT /v1/runs/{run_id}` 使用稳定 idempotency key + canonical request digest；同 key 同 digest 返回原 Run，同 key 不同 digest 拒绝。
- Agent journal 至少保存 request/idempotency、run state、event sequence、resource ownership、upload 和 cleanup attempt。
- Agent restart 后不得自动重新执行 Case；允许恢复 Snapshot/event read、继续可证明安全的 upload reconciliation，并清理已知资源。
- Node 断线不改变本地 execution facts；Hosted 通过 `GET /v1/runs/{run_id}` 和 bounded cursor event read 重建投影。
- Artifact upload、report composition 和 publication 分别拥有稳定 dedup key。
- Cleanup 不依赖测试成功；cleanup partial failure 进入独立 repair backlog。
- Hosted state 与 LocalQARunState 不按名称直接映射，只根据 event、result 和 Receipt 推进。

## 14. 主要权衡

| 决策 | 获得 | 代价 |
| --- | --- | --- |
| 薄 Local QA Host | 更快实现三个核心需求，复用 NyxID 和 testing packages | 只能处理受信任输入，不提供 hostile-code 安全保证 |
| 容器运行 App/Middleware | 环境可重复、资源容易按 Run 清理 | 依赖本机 container engine，不能替代 VM 安全边界 |
| 宿主 Chrome 临时 Profile | 使用真实系统浏览器且不触碰个人状态 | 浏览器与容器跨边界，需要端口、下载和 Cleanup 关联 |
| 云端报告生成与存储 | 统一模板、Quality、访问、保留和 Publication；本地更轻 | 需要可靠 artifact upload 和离线/重试处理 |
| 小型 durable journal | 支持幂等、查询、restart cleanup 和 upload reconcile | 增加本地 schema/migration，但远小于 authority ledger |
| 保留 Hardened Profile | 不丢失不可信代码和高安全场景的设计资产 | 长期维护两个明确 Profile 和对应测试 Gate |

## 15. 实施阶段

### A0：Profile 与公共契约

- 冻结 Profile applicability、LocalQARunRequest/Snapshot/Event、Outcome 和 receipt。
- 复用 Source、Plan、CaseResult、EvidenceManifest、Quality 和 Publication contracts。
- 建立 Rust/TypeScript/hosted 或实际实现语言之间的 contract tests。

Exit Gate：相同 request bytes 产生相同 digest；strict union、unknown field/version、idempotency conflict 全部可预测。

### A1：NyxID + Local QA Host 最小纵向链路

- 用户级 Agent、生产本地认证和五个 REST endpoint。
- 专用 scoped NyxID identity、显式 node pin、Node 本地 credential、Hosted-signed request authorization 和三侧 audit correlation。
- per-run workspace 和 small journal。
- 复用 POC 的 system Chrome 路径，但改用 temporary profile、独立 downloads 和 owned process tree。
- bounded cursor event read、结构化结果和基本 CleanupSummary。

Exit Gate：Cloud → NyxID → Agent → Chrome/runner → result → Cleanup 端到端通过；Node offline fail closed；生产不存在 `auth_method=none`；同 key 冲突和重放符合契约。

### A2：Container Environment 与完整测试执行

- Container/Compose adapter、App/DB/Middleware、conditional readiness。
- testing-runner 和 Deterministic/Browser Backend 集成。
- 资源限制、run ownership、cancel/timeout 和 restart cleanup。

Exit Gate：正常、失败、取消、超时、Agent kill 后均不会遗留已登记容器、Chrome、端口或 staging。

### A3：Evidence、Cloud Report 与 Publication

- quarantine/redaction、post-redaction grant exchange、ArtifactUploadGrant/Receipt、cloud ingestion/storage。
- staging 后先清理执行资源，只保留 bounded sanitized staging 进行上传对账。
- ReportInputSet、QualityEvaluation、deterministic JSON/HTML/Markdown report、optional narrative、ReportRecord。
- GitHub/PQL Publication、repair 和 Run settlement。

Exit Gate：正常通过、测试失败、upload partial、cleanup partial、narrative failure 和 publication failure 都产生正确独立 Outcome，且不会改写 CaseResult 或 Quality。

### H0-H3：Future Hardened Profile

在 A0-A3 之后按风险需求推进现有 Runtime R0-R3：authority contracts/ledger → VZ/EffectGate/Secret/Browser enforcement → signed recovery/fencing/amendment → operations/update。Hardened Gate 不得被 MVP 通过状态替代。

## 16. 架构验收标准

- [ ] DESIGN、SPEC、Agent design、Hardened Runtime design 和三张 Mermaid 对 active MVP 与 future Hardened Profile 的术语一致。
- [ ] `apps/hosted-control-plane` 与 `apps/local-qa-agent` 独立构建和发布，packages 不依赖 apps。
- [ ] NyxID 只负责路由、认证、credential broker 和审计，不执行测试或报告逻辑。
- [ ] Local QA Host 只接受与目标 device、Run、Source、Plan、Profile、TTL 和 nonce 匹配的请求。
- [ ] MVP 明确限制为受信任输入；Hardened 请求不会被降级为 container-only 执行。
- [ ] per-run workspace/container/network/volume/port/process/Chrome/profile/download/staging 都有 owner record。
- [ ] Agent 只启动专用 host Chrome 和 temporary profile，不附加个人 Chrome，不暴露 arbitrary CDP。
- [ ] `testing-runner` 根据结构化 Assertion 决定 Case Pass/Fail，Backend/LLM 自报结论无效。
- [ ] raw Evidence 不进入普通 event、cloud storage 或 report；只有 post-redaction bytes 可上传。
- [ ] Local QA Host 不长期提供 Artifact read service；云端持有 durable ArtifactPointer 和 ReportRecord。
- [ ] ReportInputSet、QualityEvaluation、DeterministicReport 和 ReportRecord 可按 digest/version 重放。
- [ ] NarrativeSupplement 失败或变化不能改变测试事实、Quality 或 publication eligibility。
- [ ] success/failure/cancel/timeout/restart 都进入 Cleanup，execution 与 cleanup outcome 独立。
- [ ] upload、report、publication failure 可独立 repair，不重跑测试。
- [ ] terminal 只在必须 action settled 或进入明确 repair backlog 后出现。
- [ ] POC、历史资料和 Hardened Profile 不被误报为当前已实现能力。

满足这些标准后，当前系统是一条可由 NyxID 安全触达、能在用户设备启动可重复测试环境、使用真实宿主 Chrome、回传可信结构化结果，并在云端生成和保存报告的 Durable QA Loop。Hardened Profile 则为未来不可信代码和高价值凭据场景提供独立、更强的本地安全演进路径。
