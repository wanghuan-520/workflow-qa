# FKST Local QA Host MVP 设计

> **一句话说明：** Local QA Host 是安装在用户电脑上的本地 QA 执行器。首发只打通一条 Browser 链路：接收经过授权的固定测试请求，在隔离的临时环境中启动项目和 Chrome，执行固定 Browser Case，清理资源，再上传经过处理的截图和 JSON 结果。
>
> **当前状态：** 本文描述 Target MVP，不代表这些能力已经实现。当前仓库只有 Browser Loop PoC。
>
> **跨 Repo 边界状态：** Talos Testing Tool / Scheduler 负责 QARun、placement、machine selection、lease、generation 和 fence。Hosted Authorization Authority 与最小 ArtifactStore 为 **Proposed / Decision pending**，详见 [Hosted Authorization 与 MVP ArtifactStore 边界决策](design-proposals/hosted-authorization-artifact-boundary-decision.zh-CN.md)。在该决策被接受前，本文中的 Hosted 授权和 Artifact 接口只能作为候选 consumer contract，不能作为已冻结 implementation target。
>
> **首发边界：** Browser-only；每台设备最多一个执行中的 Run；`secret_refs=[]`；只上传 screenshot 和 bounded sanitized JSON。
>
> **执行 Profile：** `local_qa_agent_mvp`
>
> **日期：** 2026-08-12
>
> **Talos 目标调度提案：** [Talos testing dispatch sequence](design-proposals/diagrams/pql-testing-simple-flow.mmd)。本文的 direct Host MVP 规范仍以内文状态、权威和数据流约束为准。

## 0. 先建立整体认识

### 0.1 为什么需要 Local QA Host

FKST 的云端服务无法直接访问用户电脑上的项目、Docker 和系统 Chrome。NyxID 可以把请求安全路由到指定电脑，但它不负责启动项目、执行测试或清理资源。

因此需要一个长期运行在用户电脑上的 Host：

```text
PQL / Agent
→ 经 NyxID 请求 Talos Testing Tool 创建 QARun 并完成 reservation/placement
→ Proposed Hosted Authorization（Decision pending）签发 operation-specific authorization
→ Local QA Host 在本地完成环境准备和 Browser 测试
→ Local QA Host 清理本地资源
→ Local QA Host 使用 Proposed Hosted ArtifactStore（Decision pending）上传允许离开设备的测试证据
→ Hosted 后续领域展示结果并完成报告
```

### 0.2 首发只做一条完整链路

首发不是通用远程执行器，而是一个范围固定的 Browser QA 产品切片：

```text
固定 Source
+ 固定 Browser Plan
+ 固定 Environment Profile
+ 明确绑定到设备和 Run 的授权

→ 创建 per-run workspace
→ 启动受控 Docker Compose 环境
→ 启动临时 Chrome Profile
→ 执行 typed Browser actions
→ 计算 Assertion / CaseResult
→ 生成截图和 bounded JSON
→ 清理 Chrome、容器、端口和 workspace
→ 上传 sanitized evidence
```

这条链路必须在成功、断言失败、取消、超时、Chrome 崩溃、Host 重启和 Hosted 暂时不可用时都能收敛，不留下无法解释的本地资源。

### 0.3 五个最重要的对象

| 对象 | 它回答的问题 | 由谁决定 |
| --- | --- | --- |
| Run | 这次 QA 工作的身份是什么？ | Talos Testing Tool 创建 `QARun`；Host 持久化本地执行事实 |
| Source | 测试哪一份代码？ | Hosted 冻结 exact object / digest，Host 只验证和 materialize |
| Plan | 要执行哪些 Browser Case 和 Assertion？ | Hosted 冻结，Host 只执行已批准的 typed actions |
| Environment Profile | 如何启动项目及判断 ready？ | 版本化配置，执行前以 digest 锁定 |
| Evidence | 哪些结果可以离开用户设备？ | MVP 只允许 screenshot 和 bounded sanitized JSON |

如果只记住一条规则，就是：**Host 只能执行接受前已经冻结并授权的内容，运行过程中不能动态扩大权限或动作范围。**

### 0.4 一个具体例子

假设用户在 FKST 中请求验证“登录按钮可正常进入首页”。Hosted 先准备：

- exact Source：某个不可变 commit；
- Browser Plan：打开 loopback URL、填写固定测试数据、点击登录、断言首页元素存在；
- Environment Profile：启动 Web、数据库和必要 Middleware，定义 readiness；
- authorization：绑定本次 `run_id`、目标设备、Source/Plan/Environment digest、TTL 和 nonce。

Host 接受后：

1. 创建本次 Run 的 workspace。
2. 启动独立 Compose project。
3. readiness 通过后启动独立 Chrome process 和临时 Profile。
4. 执行 Plan 中的 Browser actions。
5. 由 Assertion 规则计算 CaseResult，而不是让 Browser 或 LLM 自报成功。
6. 截图和结构化结果先进入本地隔离区，经过校验和处理。
7. 无论 Case 成功还是失败，都先清理 Chrome、Compose、端口和 workspace。
8. 再上传允许离开设备的证据；如果 Hosted 暂时不可用，只保留有 TTL 的 sanitized staging。

## 1. 产品范围

### 1.1 首发交付

- 输入只来自组织明确批准的项目和固定 Browser Plan。
- 每台设备同一时间最多有一个 execution-bearing Run。
- Source、Plan、Environment Profile、执行 Profile 和 Browser actions 在接受前冻结。
- 使用受控 Docker Compose 环境启动 App、数据库和 Middleware。
- 使用本机 Chrome executable，但每个 Run 使用独立 process、Chrome Profile 和 downloads。
- 只执行版本化、类型化的 Browser actions，不开放任意 CDP。
- 只生成 screenshot 和 bounded sanitized JSON Evidence。
- 首发固定 `secret_refs=[]`。
- Host 重启后不自动重跑中断的 Case，只恢复查询、上传对账和资源清理。
- Hosted 不可用时，本地执行和清理仍可以结束。

### 1.2 首发拒绝

Host 必须在创建 workspace、容器、进程、Chrome 或 staging 之前拒绝：

- `hardened_untrusted_code` 或未知执行 Profile；
- 非空 `secret_refs`；
- 任意 Shell、URL、`cwd`、`env`、Compose、CDP endpoint 或动态动作；
- floating Source ref、floating image tag、未绑定 build input 或未知 Environment digest；
- 外部 fork、未知依赖脚本或不受信任代码；
- 需要个人 Chrome、Cookie、SSH、Keychain、Home、Docker socket 或高价值本地数据的请求；
- 设备已有 execution-bearing Run 时提交的第二个 Run。

需要这些能力的请求必须进入后续版本或独立的 `hardened_untrusted_code` 执行 Profile，不能降级到 MVP 执行。

### 1.3 首发不做

- CLI、API 或 Codex backend；
- 通用远程 Shell 或任意本地进程执行；
- 项目 Secret、私网凭据或云账号 materialization；
- DOM、trace、network body、download content 等扩展 Evidence；
- Host 内最终 Quality、长期 Artifact/Report 或 GitHub/PQL Publication；
- Host restart 后自动 Resume 旧 Case；
- Hardened Grant、Fence、EffectGate、authority ledger、VZ VM、Secret Broker 或 signed RecoveryDecision。

### 1.4 PoC 已证明和未证明的内容

当前实际运行过的是 [Browser Loop PoC](poc/nyxid-browser-loop/server.mjs)：

```text
NyxID Cloud
→ NyxID Node
→ 人工启动的 loopback PoC service
→ playwright-core 启动系统 Chrome
→ 固定 fixture 点击和 DOM 断言
→ 内存结果和本机截图路径
```

它证明了 NyxID 能到达 loopback service、本地服务能启动 Chrome、结构化结果能返回调用方。

它没有证明正式 MCP contract、生产认证、安装和 pairing、Source、Compose、Journal、取消、重启恢复、Evidence 处理、上传或 Cleanup。因此 PoC 不能被描述为 MVP 已完成。

## 2. MVP 规范性契约

> 本节是 MVP-A0 的规范性入口。实现必须把这些规则落成 JSON Schema、Rust/TypeScript 类型、shared fixtures 和自动化测试。当前仓库内的 MVP fixture 只是标记为 `draft` 的 seed corpus，在 `MVP-A0` 冻结 bounds、signed-binding negative cases 和 versioned delivery transitions 前不得作为 conformance gate。解释性章节不得放宽本节约束。

### 2.1 请求在接受前必须冻结什么

一个合法的 `submit_run` 至少绑定：

- `run_id`、目标 `device_id` 和 Host installation；
- `profile=local_qa_agent_mvp`；
- exact Source ref 和 digest；
- exact Structured Plan ref 和 digest；
- exact Environment Profile ref 和 digest；
- exact 执行 Profile；
- Browser capability digest；
- `secret_refs=[]`；
- authorization issuer、caller、operation、method、path、body digest、TTL、nonce 和 purpose；
- start authorization 的 Talos task/attempt/lease/machine/worker/generation/fence 与可解析 signed lease claim ref；
- idempotency key。

任何绑定不一致都必须在本地副作用前失败。

### 2.2 JSON、canonical digest 和签名

所有外部 payload 必须是 bounded UTF-8 JSON object：

- `schema_version` 必须是已知的 `qa.*/v1`；
- 拒绝未知字段、未知 discriminator、mixed union 和重复 object member；
- 限制字符串长度、数组长度、对象深度和总 payload 大小；
- digest 只从 contract 定义的 canonical projection 计算，不从原始传输 bytes 随意计算。

MVP-A0 还必须把下列 bounds 固定为 machine-readable 常量并加入 fixture：payload bytes、字符串长度、数组长度、对象深度、Event page size、SafeError size、每 Run screenshot 数量与单张大小、JSON Evidence 单对象大小、总 staging 大小和 staging TTL。在这些数值冻结前，A0 不能完成；实现不得各自选择默认值。

MVP v1 固定：

- canonical JSON：RFC 8785 / JCS；
- hash：SHA-256；
- domain tag：`qa.local-host-mvp/v1`；
- digest 编码：小写 `sha256:<64 hex>`；
- 数字只接受 I-JSON / IEEE-754 binary64 可互操作范围；
- 拒绝 non-finite、文本 `-0`、unsafe integer、invalid UTF-8 和 lone surrogate；
- object key 按 RFC 8785 UTF-16 code-unit 排序，不做 Unicode normalization；
- operation authorization 使用 Ed25519，通过 `key_id` 选择安装时配置的可信公钥，并支持 rotation 和 revocation。

### 2.3 对外只有五个控制操作

| MCP tool | Internal endpoint | 是否改变状态 | 返回内容 |
| --- | --- | --- | --- |
| `workflow_qa.get_capabilities` | authenticated `GET /v1/health` | 否 | bounded capabilities |
| `workflow_qa.submit_run` | `PUT /v1/runs/{run_id}` | 是 | `RunAcceptance` + initial `Snapshot` |
| `workflow_qa.get_run` | `GET /v1/runs/{run_id}` | 否 | 当前 `Snapshot` |
| `workflow_qa.get_run_events` | `GET /v1/runs/{run_id}/events?after_sequence=N&limit=M` | 否 | bounded event batch |
| `workflow_qa.cancel_run` | `POST /v1/runs/{run_id}:cancel` | 是 | `CancelAck` |

补充约束：

- NyxID 只负责路由、身份和传输，不解释 QA state，也不产生 Pass/Fail。
- Public health 只暴露非敏感 liveness 和 version。
- `submit_run` 接受后异步执行，不能把完整 Browser 测试塞进一个长时间 NyxID response。
- Artifact bytes 不经 NyxID response 返回，而是使用单对象 upload grant 直接上传 Hosted ingestion。
- start、read 和 cancel 分别使用 `mvp_local_request/v1`、`mvp_local_read/v1` 和 `mvp_local_cancel/v1`；read cursor/limit 与 cancel reason/deadline 都属于 authorization digest，不能在验签后改写。
- `cancel_run` 首次接受时必须把 CancelIntent 和 `cancel_requested` Event 原子写入 Journal；`CancelAck` 返回 `accepted`、`idempotent_replay` 或 `already_terminal`，并引用 durable intent 或 terminal snapshot。只返回当前 Snapshot 不算取消确认。

### 2.4 Admission 顺序不可调整

Host 必须按以下顺序处理 `submit_run`：

1. 验证 Node → Host local credential 和 transport context。
2. bounded strict parse，拒绝 duplicate、unknown、mixed 和 invalid profile。
3. 验证 schema、大小和 digest 字段格式。
4. canonicalize request projection，计算 `request_digest`。
5. 验证 Ed25519 authorization 及 caller、node、device、Run、执行 Profile、Source、Plan、Environment Profile、purpose、TTL 等绑定；通过安装时配置的 Talos current-claim resolver 解析 signed lease claim ref，并验证 lease、generation、fence 未 supersede。resolver 不可用时 fail closed。
6. 在 single-writer Journal 中查询 idempotency key、`run_id` 和 request digest。
7. 只有新请求才在同一个 transaction 中消费 nonce、占用设备 active slot、写 request/provenance、写 `accepted` state，并追加 `sequence=1` Event。
8. transaction commit 后，才允许创建 workspace、Compose、process、Chrome Profile、Evidence 或 upload attempt。

这里的核心原则是：**先形成可恢复、可查询的接受事实，再产生任何本地资源。**

### 2.5 幂等和冲突

| 输入关系 | Host 行为 | 是否消费新 nonce | 是否创建资源 |
| --- | --- | --- | --- |
| 同 scope/key/digest | 返回原 acceptance 和当前 Snapshot | 否 | 否 |
| 同 scope/key、不同 digest | `idempotency_conflict` | 否 | 否 |
| 同 `run_id`、不同 digest | `run_identity_conflict` | 否 | 否 |
| 首次合法请求 | 原子接受并异步执行 | 是 | commit 后才可以 |
| nonce 已写入未提交 transaction、acceptance 也未提交 | transaction 整体回滚；同一请求可按原 nonce 重试 | 否 | 不允许猜测执行 |

每台设备的 single-active slot 也在 acceptance transaction 中占用。第二个 execution-bearing Run 返回 `device_busy`，且没有资源副作用。

对应 seed fixture 见 [MVP contract corpus](fixtures/local-qa-host-mvp-contract-v1.json)。它在 `MVP-A0` 完成前不是已冻结的完整 corpus；下列常见结果码和无副作用约束必须在正式 fixture 中保持稳定：

| 场景 | 结果码或返回 |
| --- | --- |
| 同 key、同 digest | `original_acceptance` |
| 同 key、不同 digest | `idempotency_conflict` |
| 同 `run_id`、不同 digest | `run_identity_conflict` |
| 未知字段 | `unknown_field` |
| 未知或 Hardened 执行 Profile | `unsupported_profile` |
| 非空 `secret_refs` | `secret_refs_unsupported` |
| authorization 过期 | `authorization_expired` |
| caller/node/device/Run 等绑定错误 | `authorization_binding_mismatch` |
| Environment digest 错误 | `environment_binding_mismatch` |
| nonce 已使用 | `nonce_replay` |
| 设备已有 execution-bearing Run | `device_busy` |

### 2.6 本地状态和 Outcome 必须分开

`LocalQARunState` 只表示流程走到哪里：

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

Host 另行记录四个互相独立的结果：

- `execution_outcome`：Browser Case 是否执行、通过、失败、取消或丢失；
- `evidence_outcome`：证据是否完整、部分、不可用或被安全策略阻断；
- `upload_outcome`：是否无需上传、待上传、已上传或过期；
- `cleanup_outcome`：是否全部释放、存在可重试 residual 或被 identity mismatch 阻断。

不能用一个 `status=failed` 同时覆盖测试失败、证据失败、上传失败和清理失败。

`terminal` 的含义也必须精确：

- 本地执行不会再次打开；
- 本地必须执行的 Cleanup 已完成或形成明确 residual；
- `upload_outcome` 允许在本地执行事实冻结后按单调版本继续更新；fixture 将这一性质记为 `upload_outcome_mutable`，具体结果可从 pending 继续变为 `uploaded` 或 `upload_expired`，但不能修改 execution、cleanup 或 resource ownership facts；
- `report_impossible` 只能由 Hosted 根据冻结的 ReportInputSet 完整性决定；Host 最多镜像带 Hosted authority/version 的 disposition，不能自行推导；
- Hosted Report/Quality 状态不能修改本地执行事实，也不能触发本地重跑。

### 2.7 Snapshot、Event 和 cursor

- 每个 Run 有当前 Snapshot，供断线后重新建立整体视图。
- Event 使用从 1 开始的稳定 sequence。
- 相同 sequence 可以完全相同地重放；相同 sequence 出现不同 digest 是 `event_integrity_error`。
- Event 查询必须 bounded，并使用 `after_sequence` cursor。
- cursor 超出本地保留窗口时返回 `cursor_expired`，调用方必须先读取 Snapshot 再从可用位置恢复，不能静默跳过事件。
- Snapshot 和 Event 不得包含 raw Evidence、Secret、cookie、header、argv 或本地绝对路径。

### 2.8 资源所有权和 uncertain create

所有本地资源都必须属于一个 Run：

- workspace；
- Compose project、container、network、volume 和 loopback port；
- runner/process tree；
- Chrome process、Chrome Profile 和 downloads；
- raw quarantine 和 sanitized staging。

每个 `OwnedHandle` 至少记录：

- resource intent；
- stable provider key；
- Run/执行 Profile/Environment Profile ownership label；
- exact provider identity；
- generation / deadline；
- lifecycle state 和 residual classification。

创建资源前先持久化 intent。若 provider 已完成创建但 Host 在写回 identity 前崩溃，重启后只能使用 stable key 和 ownership label 对账。identity mismatch 或未知 ownership 必须成为 blocking residual，不能猜测删除。

### 2.9 Browser 执行契约

- 只接受已批准 Structured Plan 中的 strict Browser actions。
- 使用本机 Chrome executable，但每个 Run 创建独立 process tree、temporary Chrome Profile 和 downloads。
- 默认只访问本 Run 的 loopback target；额外 origin 必须在 Plan 中声明。
- 不暴露 arbitrary CDP endpoint、token 或 debugging port。
- Browser action 成功不等于 Case passed。
- `BackendObservation → AssertionResult → CaseResult` 的计算由版本化 testing contract 完成。
- 缺失、截断、未知版本或互相矛盾的结果必须 fail closed，不能推断为 passed。

### 2.10 Evidence 和上传契约

MVP 只允许两类 Evidence：

- `image/png` screenshot；
- contract 指定 media type 和大小上限的 bounded sanitized JSON。

Evidence 顺序固定：

```text
raw observation
→ bounded local quarantine
→ safe projection / redaction
→ media、size、canary 和 schema validation
→ post-redaction digest
→ EvidenceStagingManifest
→ cleanup execution resources
→ request per-object upload grant
→ upload or reconcile by object key + digest
```

约束：

- raw observation 只能存在于 bounded quarantine，不进入 Journal、Event、NyxID、object storage 或 Hosted report；
- redaction、validation、size、media、canary 或 digest 失败时，不得产生可上传 Artifact；
- grant 只能在 post-redaction digest、media type 和 size 已知后签发；
- 上传响应丢失时重试或查询同一 object key/digest，不创建第二个 logical Artifact；
- execution Cleanup 不等待 Hosted 恢复；只允许 sanitized staging 在 bounded TTL 内等待；
- TTL 到期由 Host 记录 `upload_expired`；如果 Hosted 无法形成完整 ReportInputSet，只能由 Hosted 记录 `report_impossible`，Host 可镜像该版本化 disposition。

### 2.11 安全错误

外部错误只允许 bounded：

- `code`；
- `message`；
- `field_path`；
- `retryable`；
- `request_id`。

错误不得回显 raw payload、绝对路径、header、cookie、argv、credential 或 Secret。

### 2.12 故障点必须有确定结果

实现需要覆盖 [MVP failpoint matrix](fixtures/local-qa-host-mvp-failpoint-matrix-v1.json) 中的稳定 failpoint，包括：

- acceptance commit 前后崩溃；
- resource create 前后崩溃；
- readiness timeout；
- Chrome action 和 assertion 之间崩溃；
- evidence capture、redaction 和 upload acknowledgement 丢失；
- cleanup 中断；
- Host crash 和 restart discovery；
- staging TTL 到期。

所有 failpoint 都必须验证：不重复执行、不跨 Run 清理、事件序列稳定、Outcome 一致、错误 bounded、没有 raw 或 Secret 输出。

## 3. 系统边界和内部组件

### 3.1 谁负责什么

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| Talos Testing Tool / Scheduler | 创建和管理 `QARun`；执行 reservation、placement、lease、generation、fence 和 machine selection | 解释 Plan、计算 CaseResult、拥有本机 Chrome、容器和 Cleanup |
| Proposed Hosted Authorization/Artifact（Decision pending） | operation-specific business authorization；Artifact grant、ingest 和 receipt | QARun、设备选择、placement、lease/generation/fence、本地 Chrome、容器和 Cleanup |
| NyxID | 调用方身份、service/node 路由、传输保护和审计 | QA 业务授权、测试判定和 Run state |
| NyxID Node | 维护到 Cloud 的连接；注入本地 Host credential；调用 loopback Host | 解释 Plan、启动 Chrome、判断 Pass/Fail |
| Local QA Host | admission、Journal、本地资源、Browser 执行、Evidence、Upload 和 Cleanup | 最终 Quality、长期 Report、Publication |
| Testing Packages | Browser runner、Observation、Assertion 和 CaseResult 领域逻辑 | 设备 admission、NyxID transport、本地资源所有权 |
| Hosted Quality/Report（Post-MVP） | 后续报告输入、Quality、Report 和 Publication | raw local quarantine、本地执行资源和 MVP owner 决策 |

### 3.2 Host 内部结构

Local QA Host 内部语义结构如下。

```text
Ingress/Auth Adapter
        │
        ▼
Run Coordinator ↔ Small SQLite Journal
        │
        ├→ Source + Workspace Manager
        ├→ Container + Readiness Controller
        ├→ Testing Packages Adapter
        ├→ Host Chrome Controller
        ├→ Evidence Stager
        ├→ Cleanup Manager
        └→ Upload Client
```

| Module | 主要职责 | 禁止承担 |
| --- | --- | --- |
| Ingress/Auth Adapter | 五个 endpoint；local credential + signed authorization；strict parse | 把“来自 NyxID”当作业务授权 |
| Run Coordinator | 推进 state 和 Outcomes；协调 Prepare、Execute、Stage、Cleanup、Upload | 生成 Hosted Quality 或 terminal |
| Small Journal | request、run、event、resource、runner/upload/cleanup attempt | 演化为 Hardened authority ledger |
| Source/Workspace Manager | 获取 exact Source；创建 per-run workspace | 执行 floating branch；修改用户原仓库 |
| Container/Readiness Controller | 受控 Compose 生命周期和 typed readiness | 执行任意 YAML 或任意 command |
| Testing Packages Adapter | 提供受控 capabilities；消费版本化结果 | 复制 testing domain logic |
| Browser Controller | 独立 Chrome process、Chrome Profile 和 downloads | 连接个人 Chrome 或暴露 CDP |
| Evidence Stager | quarantine、safe projection、validation、digest | 把 raw bytes 写入普通日志或 Event |
| Cleanup Manager | 按 exact ownership 释放资源并记录 residual | 模糊扫描并删除宿主资源 |
| Upload Client | grant exchange、upload、lost-ack reconcile | 使用未知 digest 的预签 grant |

### 3.3 为什么必须有 Journal

Journal 不是为了保存完整日志，而是为了在进程崩溃后回答四个问题：

1. 这个 Run 是否已经被接受？
2. 哪些本地资源可能已经创建？
3. 哪些 Browser、Evidence、Upload 或 Cleanup 动作已经发生？
4. 重启后哪些动作允许对账或清理，哪些动作绝不能重跑？

最小逻辑表：

| 表 | 保存内容 |
| --- | --- |
| `run_requests` | request/idempotency key、digest、authorization digest、acceptance |
| `runs` | local state、四类 Outcome、冻结 refs、last safe error |
| `events` | sequence、type、safe payload ref、snapshot digest |
| `resources` | intent、stable key、ownership、provider identity、state |
| `runner_attempts` | runner identity、attempt、deadline、result ref、outcome |
| `upload_attempts` | artifact key/digest、grant/object ref、attempt、outcome |
| `cleanup_attempts` | resource set digest、released/residual refs、outcome |

Journal 不保存 Secret 明文、raw Artifact bytes、个人路径或 Node credential。

## 4. 一次 Run 的完整主流程

| 阶段 | Host 做什么 | 持久化什么 | 失败时去哪里 |
| --- | --- | --- | --- |
| 1. Admit | 双层认证、strict parse、digest、authorization、幂等和 single-active gate | acceptance、`accepted`、sequence=1 | 拒绝且零资源副作用 |
| 2. Materialize | 获取 exact Source，验证 digest，创建 per-run workspace | source/workspace handle | Cleanup |
| 3. Prepare | 创建 Compose project/network/volume/port，执行 typed readiness | environment handles、ReadinessReceipt | environment failure → Cleanup |
| 4. Execute | 启动临时 Chrome，执行 fixed Browser Case，计算 Assertion/CaseResult | Browser/runner attempts、safe result refs | test failure/cancel/timeout → Cleanup |
| 5. Stage | 收集 screenshot/JSON，quarantine、处理、校验和 digest | staging manifest、RedactionReceipt | evidence blocked → Cleanup |
| 6. Cleanup execution | 关闭 Chrome、runner、services，删除容器和 workspace；必要 Cleanup settled 后释放 execution slot | CleanupReceipt、residuals | retry Cleanup，不重跑 Case |
| 7. Upload | 为每个对象申请 grant，上传或按 digest 对账 | UploadReceipt / pending outcome | bounded retry 或 TTL expiry |
| 8. Finalize local | 删除 staging 或保留至 TTL，固定本地执行事实 | final Snapshot、四类 Outcome、`terminal` | repair delivery only |

### 4.1 为什么 Cleanup 在 Upload 前

Hosted 可能暂时离线。如果 Host 为了等待上传一直保留 Chrome、容器、端口和 workspace，用户设备会积累长期运行资源。

因此顺序必须是：

```text
证据处理完成
→ 先释放执行资源
→ 再等待或重试上传
```

上传期间本地最多保留 sanitized bytes、object key/digest、upload attempt 和必要 Journal metadata，并且都受 size limit 和 TTL 约束。

### 4.2 为什么 Browser 不能决定 Pass/Fail

Browser Controller 只能报告动作和观察，例如“点击成功”“元素文本为 X”“截图已捕获”。最终结果来自版本化 Assertion：

```text
Browser Observation
→ Assertion evaluation
→ AssertionResult
→ CaseResult
```

所以以下事实都不能单独表示 passed：

- Chrome 没崩溃；
- click action 返回成功；
- 页面返回 200；
- process exit code 为 0；
- 某个文本结果声称测试成功。

## 5. 失败、取消和重启

### 5.1 断言失败

断言失败是正常测试结果，不是 Host 基础设施故障：

- 保存 failed CaseResult；
- 尽可能生成允许的失败截图和 bounded JSON；
- 进入 Cleanup；
- 上传可用证据；
- `execution_outcome` 保留测试失败事实。

### 5.2 Readiness 失败

Readiness timeout 表示环境没有准备好，不应伪装成 Browser Case failed：

- 不启动或继续 Browser Case；
- 记录 environment/preparation failure；
- 清理已经创建的 Compose、port 和 workspace；
- 为每个未执行 Case 给出 bounded non-execution reason。

### 5.3 Cancel 和 timeout

1. 先在 Journal 中持久化 cancel/timeout intent。
2. 停止接纳新的 Browser action。
3. 终止 owned Chrome、runner 和 service process tree。
4. 清理环境和 workspace。
5. 已完成处理的 Evidence 可以继续上传；raw quarantine 必须本地删除或按契约处置。
6. 重复 cancel 不得造成重复副作用。

`CancelAck` 只表示取消意图已接受，不表示所有资源已经释放。

### 5.4 Host 崩溃或重启

Host 启动时必须：

1. 关闭 admission。
2. 打开并迁移 Journal。
3. 枚举未终态 Run 和 pending attempts。
4. 使用 stable key、exact identity 和 ownership label 发现本地资源。
5. 对 upload、cleanup 和允许重放的对账动作执行 reconcile。
6. 将无法确认 ownership 的项目标记为 residual/recovery-required。
7. migration、discovery 和 health check 完成后再开放 admission。

重启后允许：

- `get_run` 和 Event cursor read；
- 已知 object key/digest 的 upload reconcile；
- Journal 中已知资源的 cleanup/reconcile。

重启后禁止：

- 自动重新执行旧 Browser Case；
- 猜测某个 Browser action 是否应该继续；
- 因为名称相似而删除未知容器、进程或文件。

### 5.5 Hosted 暂时不可用

- 本地 Browser 执行和 Cleanup 继续完成。
- Run 可以进入 local `terminal`。
- sanitized staging 在 bounded TTL 内等待上传。
- Hosted 恢复后使用同一 object key/digest 对账。
- TTL 到期后明确记录 `upload_expired`，不无限保留本地数据。

## 6. 本地安全边界

### 6.1 双层授权

每个非 public-health 请求都必须同时通过：

1. Node → Host local credential：证明请求来自已经 pairing 的本地 Node Adapter；
2. Hosted signed authorization：证明这个具体 Run、设备、请求和 operation 获得业务授权。

Loopback、Unix socket、相同 UID、PID、端口或“请求来自 NyxID”都不能替代这两层验证。

### 6.2 Browser 隔离边界

MVP 的 Chrome 隔离目标是避免污染或读取用户个人浏览器状态：

- 独立 process tree；
- temporary Chrome Profile；
- isolated downloads；
- 只访问已批准 origin；
- Cleanup 覆盖 crash、cancel、timeout 和 Host restart。

MVP 不承诺抵御 hostile page 的 OS 级 direct-socket 绕过，也不提供强 Browser egress enforcement。需要这些保证时必须使用 Hardened 执行 Profile。

### 6.3 Docker Compose 边界

Compose 在 MVP 中用于可重复环境和生命周期隔离，不是 hostile-code sandbox：

- 只运行 digest-bound Environment Profile；
- 禁止 floating image tag 和未绑定 build input；
- 禁止挂载 Home、SSH、Keychain、个人 Chrome、其他 repo 和 Docker socket；
- 只暴露 loopback ports；
- 配置 CPU、memory、disk、process count 和 wall-clock budget；
- 只有 trusted-input policy 允许时才执行依赖安装或 lifecycle script。

### 6.4 数据边界

不得出现在 Snapshot、Event、外部错误、Artifact 或 Hosted report input 中：

- raw DOM、trace、network body 或 download content；
- cookie、authorization header 和浏览器 credential；
- argv、环境变量和 Secret；
- 本地绝对路径；
- Node → Host credential；
- 未经 safe projection 的 provider error 或 raw payload。

## 7. 实施顺序 A0-A3

### A0：规范性契约和测试语料

交付：

- 本文第 2 节对应的 wire/state/error contract；
- [contract fixtures](fixtures/local-qa-host-mvp-contract-v1.json)；
- [failpoint matrix](fixtures/local-qa-host-mvp-failpoint-matrix-v1.json)；
- strict schema、canonical digest、状态迁移和 Outcome 测试。

Exit Gate：合法、重复、冲突、过期、错误绑定、未知字段或执行 Profile、cursor、upload expiry 和全部 failpoint 都有确定 mutation、error、Outcome 和 side-effect 结果。

### A1：安装、pairing、admission 和 Browser skeleton

交付：

- macOS 用户级签名 Host artifact；
- install/update/rollback/uninstall；
- 显式 Node pairing、credential rotation/revoke/reset；
- 五个控制 endpoint；
- SQLite Journal、single-active gate；
- 独立 Chrome Profile 的固定 Browser walking skeleton。

Exit Gate：Hosted 经 node-pinned NyxID service 到达 Host；错误绑定和离线 fail closed；acceptance 原子提交；重复 submit 不启动第二个 Browser；restart 关闭 admission 且不重跑 Case。

### A2：Source、Environment、Browser runner 和 reconcile

交付：

- immutable Source acquisition 和 digest verification；
- versioned Environment Profile；
- 受控 Compose/readiness；
- Testing Packages Browser Adapter；
- OwnedHandle、cancel/timeout、restart discovery 和 cleanup reconcile。

Exit Gate：一个真实项目完成环境启动、Browser pass/failure/crash/timeout/cancel/Host-kill 场景；每条路径都有 bounded Outcome 和 CleanupReceipt；identity mismatch 不触发猜测删除。

### A3：Evidence、upload reconcile 和报告交接

交付：

- screenshot + bounded JSON；
- raw quarantine、safe projection、validation 和 RedactionReceipt；
- Cleanup-before-upload；
- per-object grant、lost-ack reconcile；
- Local `upload_expired` 和 Hosted-owned `report_impossible` 交接。

Exit Gate：只上传已验证 media；没有 raw 或 Secret 输出；Hosted 离线时本地仍可 terminal；恢复后不重复创建 Artifact；TTL 到期后有明确结果。

对应实施草案：

- [MVP-A0](TODOS.md#mvp-a0-normative-contract-and-failpoint-corpus)
- [MVP-A1](TODOS.md#mvp-a1-signed-installer-pairing-admission-and-browser-skeleton)
- [MVP-A2](TODOS.md#mvp-a2-source-environment-profile-browser-runner-and-reconcile)
- [MVP-A3](TODOS.md#mvp-a3-bounded-evidence-upload-reconcile-and-report-handoff)

## 8. MVP 验收清单

### 8.1 Admission

- [ ] 所有非 public-health 请求同时验证 local credential 和 Hosted authorization。
- [ ] exact Source、Plan、Environment Profile、执行 Profile 和 device binding 在副作用前验证。
- [ ] 同 key/digest 返回原 acceptance；冲突 digest 零副作用。
- [ ] nonce consumption、active slot、acceptance、initial state 和 first Event 原子提交。
- [ ] 第二个 execution-bearing Run 返回 `device_busy`，且不创建资源。
- [ ] unknown field、mixed union、duplicate key、invalid UTF-8 和 unsafe number 被拒绝。
- [ ] Hardened 执行 Profile 和非空 `secret_refs` 被拒绝，不降级执行。

### 8.2 Browser execution

- [ ] 只执行已批准的 strict Browser actions。
- [ ] 每个 Run 使用独立 Chrome process、Chrome Profile 和 downloads。
- [ ] Browser action 不直接决定 Pass/Fail。
- [ ] 每个已声明 Case 都有 CaseResult 或 bounded non-execution reason。
- [ ] readiness failure、assertion failure、Chrome crash、cancel 和 timeout 保持不同结果语义。
- [ ] Host restart 不自动重跑 Case。

### 8.3 Resources and Cleanup

- [ ] 每个 workspace、Compose resource、port、process、Chrome 和 staging 对象都有 OwnedHandle。
- [ ] resource create 前持久化 intent；uncertain create 可按 stable key reconcile。
- [ ] Cleanup 只作用于 exact matching ownership。
- [ ] identity mismatch 和 unknown resource 形成 blocking residual，不猜测删除。
- [ ] success、failure、cancel、timeout 和 restart 都产生 CleanupReceipt 或 residual disposition。
- [ ] active slot 只在执行和必要 Cleanup settled 后释放。

### 8.4 Evidence and Upload

- [ ] 成功或允许取证的失败 Case 只产生 screenshot 和 bounded JSON candidate。
- [ ] raw Evidence 不进入 Journal、Event、NyxID、cloud 或普通日志。
- [ ] redaction、canary、media、size、schema 或 digest 失败时不上传。
- [ ] execution resources 在等待 Hosted/upload 前已经 Cleanup。
- [ ] lost acknowledgement 使用同一 object key/digest 对账。
- [ ] staging TTL 到期由 Host 记录 `upload_expired`；缺失报告输入时由 Hosted 记录 `report_impossible`，Host 只镜像其版本化 disposition。

### 8.5 Contract and Failpoints

- [ ] Contract fixture 中每个 case 都断言 Journal mutation、nonce 和 side effects。
- [ ] Failpoint matrix 中每个稳定 id 都有自动化测试。
- [ ] 同 sequence 不同 Event digest 产生 integrity error。
- [ ] `cursor_expired` 强制 Snapshot resync，不静默跳过。
- [ ] 所有外部错误 bounded 且不泄露 raw、path、credential 或 Secret。
- [ ] execution、evidence、upload 和 cleanup Outcomes 可以独立解释。

## 9. 文档关系和术语

### 9.1 文档关系

| 文档 | 用途 |
| --- | --- |
| [Cross-repo orchestration](cross-repo-orchestration.zh-CN.md) | 整体 Hosted、NyxID、Host、Testing Packages 和报告边界 |
| [MVP contract fixture](fixtures/local-qa-host-mvp-contract-v1.json) | admission、幂等、绑定、游标和 delivery 结果样例 |
| [MVP failpoint matrix](fixtures/local-qa-host-mvp-failpoint-matrix-v1.json) | admission、resource、execution、cleanup、upload 和 restart 故障点 |
| 本文 | `local_qa_agent_mvp` 的范围、规范性约束、实现顺序和验收 |
| [本文 3.2 节](#32-host-内部结构) | Host 内部组件和数据流语义结构 |
| [Hardened Runtime design](hardened-local-qa-runtime-design.zh-CN.md) | 未来不可信代码、强隔离、fencing 和 signed recovery |

若跨文档出现冲突：

- MVP 的首发范围和拒绝条件以本文为准；
- shared wire type 和 canonical contract 以已冻结的 machine-readable schema/fixture 为准；
- Hardened 对象不得被引入 MVP 作为“简化实现”。

### 9.2 术语

| 术语 | 本文含义 |
| --- | --- |
| Hosted | FKST 云端控制、Artifact ingestion 和后续报告侧 |
| Host | 用户电脑上的 Local QA Host 进程 |
| Run | 一次有稳定 `run_id` 的本地 QA 执行 |
| 执行 Profile | 选择安全和能力边界的顶层模式；MVP 固定为 `local_qa_agent_mvp` |
| Environment Profile | 描述受控 Compose、readiness、预算和允许服务的版本化配置 |
| Chrome Profile | 每个 Run 单独创建的临时浏览器用户数据目录，不是执行 Profile |
| Admission | Host 在产生任何资源前完成的认证、校验、幂等和原子接受 |
| Journal | Host 的最小本地执行事实数据库，不是 Hardened authority ledger |
| Outcome | 某一结果维度，如 execution、evidence、upload 或 cleanup |
| OwnedHandle | 可用于精确发现、对账和清理本地资源的所有权记录 |
| Raw quarantine | 只在本地短期保存原始观察的隔离区 |
| Sanitized staging | 已通过 safe projection/validation、可以等待上传的数据 |
| Residual | 不能安全自动清理、需要重试或人工处置的本地资源事实 |
| Reconcile | 使用稳定 identity/digest 判断动作是否已经发生，而不是直接重复执行 |

## 10. 最终完成标准

当以下陈述都成立时，才可以称为 Local QA Host MVP：

1. Hosted 能经 NyxID 把一个绑定到指定设备的 Browser Run 提交给已安装、已 pairing 的 Host。
2. Host 在任何副作用前完成 strict parse、digest、authorization、idempotency 和 single-active admission。
3. Host 能在 exact Source 和 versioned Environment Profile 上启动受控 Compose 和临时 Chrome。
4. Host 只执行固定 Browser Plan，并由版本化 Assertion 产生 CaseResult。
5. success、failure、cancel、timeout、Chrome crash 和 Host restart 都不会重复执行 Case，也不会跨 Run 清理资源。
6. 每条路径都形成可解释的 execution、evidence、upload 和 cleanup Outcomes。
7. Raw Evidence 不离开设备；上传内容只有经过验证的 screenshot 和 bounded sanitized JSON。
8. Hosted 离线不阻塞本地 Cleanup；恢复后按稳定 object key/digest 对账；TTL 到期有明确 closure。
9. Contract fixtures 和 failpoint matrix 全部通过。
10. 文档、Schema、实现和测试对“Browser-only、one active Run、no Secrets、no Hardened downgrade”给出同一答案。
