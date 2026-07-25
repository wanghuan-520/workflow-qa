# FKST Host 经 NyxID 触发用户本地自动化 QA：目标架构设计

> 状态：目标架构，已锁定核心决策，尚未完整实现  
> 日期：2026-07-25  
> 对应规范：[SPEC.zh-CN.md](SPEC.zh-CN.md)（负责字段、接口、状态机和错误等规范性细节）

## 1. 文档状态、依据与证据等级

本文解释为什么采用当前架构、各组件负责什么、信任边界如何建立、一次 QA Run 如何完成，以及实现过程中接受哪些权衡。本文不定义完整字段级 Schema；契约对象的字段、枚举、接口和状态转换以 [SPEC.zh-CN.md](SPEC.zh-CN.md) 为准。

主要依据如下：

- [Mermaid 源图](fkst-host-nyxid-local-qa-flow.mmd)：架构语义基准，组件、边界、授权方向和生命周期语义以该源图为准。
- [架构图（SVG）](fkst-host-nyxid-local-qa-flow.svg)：与 Mermaid 语义同步的定制 presentation view，用于评审和展示；若标签、箭头或边界与 Mermaid 不一致，必须修正 SVG，而不是反向改变语义基准。
- [架构评审](FKST-NyxID-Local-QA-Architecture-Review.md)：给出 P0/P1 问题、职责边界和建议实施顺序。
- [NyxID 到本地 Chrome 最小闭环 POC](NyxID-Local-Chrome-Minimal-Loop-Validation.md)：提供 Cloud 到用户电脑、真实 Chrome 自动化和结构化结果回传的实证。
- [old/DESIGN.zh-CN.md](old/DESIGN.zh-CN.md)：仅用于了解历史方案的组织方式和已淘汰假设，不是当前设计依据。

本文采用三类证据等级：

| 等级 | 含义 | 本文中的例子 |
| --- | --- | --- |
| 已验证事实 | 已通过真实运行观察到 | NyxID Cloud 经 Node 到达已运行的本地 Runtime，Runtime 控制系统 Chrome 并回传结构化结果 |
| 锁定设计 | 已作出架构决策，但仍需实现和验收 | Hosted Authorization Authority 签发 Design Grant 与 Execution Grant；PR 默认使用固定 synthetic merge commit |
| 待定策略 | 不影响职责边界，但实现方式仍可选择 | macOS 上的 Container/VM Provider、Artifact 存储位置和保留期 |

当输入材料存在冲突时，本文采用以下优先级：本轮锁定决策高于流程图中的旧标签，Mermaid 语义基准高于定制 SVG presentation view，当前流程图高于评审前方案，POC 只证明它实际覆盖的链路。`old/` 下的文档全部视为历史资料，不能作为当前实现规范。

全文统一使用以下角色和边界术语：

| 术语 | 固定含义 |
| --- | --- |
| Hosted Authorization Authority | FKST 云端授权权威，验证 Approval Evidence 和策略结论，签发并撤销 Design Grant、Execution Grant |
| NyxID Approval/Device Provider | 提供用户身份、设备身份、在线性、DesignApprovalEvidence 和 ExecutionApprovalEvidence，不签发 FKST Grant |
| NyxID Transport | 传输命令、Grant、事件、Receipt、Checkpoint 摘要和 Artifact 指针，不解释或扩大业务授权 |
| Local Runtime Verifier | 在本地副作用发生前验证 Grant、绑定关系、generation、fence、撤销状态与防重放信息 |
| Local Policy Enforcement Point | 本地策略执行点，简称 Local PEP；拦截并执行文件、网络、进程、Secret、浏览器和资源限制，不等同于云端 Policy Gate |
| Local Design Sandbox | 只承载源码获取后的受限设计活动，生成 Structured Plan，不承载正式测试执行 |
| Local QA Sandbox | 承载获授权的依赖安装、服务、测试、Shell、浏览器和 Agent Action；与 Local Design Sandbox 生命周期和权限独立 |
| Secret Broker / CredentialLease | Secret Broker 根据批准 scope 向具体 Step 发放短期、可撤销的 CredentialLease；Secret 不直接进入 Plan、Grant、命令正文或长期磁盘 |
| CleanupCapability | 仅允许清理由本 Run、generation 和资源账本登记的对象；不依赖仍然有效的 Execution Grant，也不能创建新资源 |
| Browser Provider | Runtime 内部浏览器适配角色，管理 Browser Backend、browser process、临时 profile 和受限 control channel |

## 2. 背景、目标与非目标

### 2.1 背景

FKST 需要从云端创建和追踪 QA Run，同时利用用户电脑上的真实源码、设备能力和系统浏览器，在隔离的本地 QA 环境中复现项目运行条件。直接把测试放在云端 Sandbox 会失去本地设备真实性；让云端任意控制用户宿主环境又会扩大权限和审计风险。因此，系统必须同时解决四个问题：

1. 云端 Run 必须可持久化、可恢复、可取消、可审计。
2. Design 与 Execution 都必须有可验证的批准和授权；用户必须在看见实际 Structured Plan 后批准执行 scope，而不是批准某个 Grant 对象。
3. 未受信任的 PR 代码、Shell、浏览器和 Agent Action 必须限制在用户电脑上的 Local QA Sandbox 内。
4. 测试观察、证据、最终质量裁决和外部发布必须分层，不能让 Agent 自报结果直接成为产品结论。

### 2.2 目标

本设计的目标是建立一条完整的 Durable QA Run：

```text
Create
→ Source Acquisition
→ Design Approval
→ Design Authorization
→ Prepare Local Design Sandbox
→ Local Design
→ Design Cleanup
→ Policy Review
→ Execution Approval
→ Execution Authorization
→ Prepare Local QA Sandbox
→ Conditional Readiness
→ Execute
→ Evidence
→ Compensation Cleanup
→ Quality Evaluation
→ GitHub/PQL Routing
→ Finalize
```

系统应支持 PR、非 PR commit、手动入口和 API 入口；应支持 Deterministic、Browser 和 Codex Backend；应在失败、取消、超时、失联和 Runtime 重启后收敛到可解释终态。

### 2.3 非目标

本文不把以下能力归入当前设计：

- NyxID 不 Checkout 代码、不安装依赖、不启动服务、不控制浏览器、不运行测试，也不判断 Pass/Fail。
- PQL 不承担 Durable Orchestration、设备通道、本地进程管理或 GitHub 发布。
- `fkst-hosted/packages/*` 不作为独立部署目标；它们是由两个 app 组合使用的模块。
- Codex 不拥有最终测试裁决权，也不能在未经批准时扩大 Plan。
- 本文不承诺某一种 Container/VM 技术、不规定完整 Schema，也不把 POC Runtime 当成生产 Runtime。
- 本文不继续采用云端 OSB QA、单个 unrestricted Codex step、Issue 评论作为唯一状态总线或顺序式 Cleanup 等历史假设。

## 3. 已验证事实与能力缺口

### 3.1 POC 已经证明的事实

2026-07-24 的最小纵向 POC 已真实跑通以下链路：

```text
NyxID Cloud
→ 用户设备上的 NyxID Node
→ 已经运行的本地 Browser QA Runtime
→ 系统 Google Chrome（playwright-core）
→ 页面访问、点击、DOM 断言和截图
→ 结构化 Run Result
→ NyxID Node
→ 调用方
```

这个结果证明：

- 用户电脑不需要开放公网入站端口；Node 通过主动建立的出站通道接收 Cloud 请求。
- Node 可以把请求转发给 loopback-only 的本地 Runtime。
- 已运行的本地 Runtime 可以在不依赖 IDE 的情况下控制真实 Google Chrome。
- 异步 `Submit + Poll` 形态可以返回 Run ID、终态、结构化结果和证据路径。
- NyxID Node 不需要执行浏览器动作或断言，它可以保持为传输和设备通道。

POC 还暴露了一个生产要求：即使临时服务声明无认证，Node 仍需要本地路由凭据条目。生产 Runtime 具备启动进程和浏览器的能力，不能沿用 `auth_method=none`；本地接口必须认证，并只监听 loopback 或受控本地 IPC。

### 3.2 POC 没有证明的能力

POC 没有证明以下生产能力：

- Runtime 的安装、签名校验、注册、launchd 自启动、升级和回滚。
- Local Design Sandbox 的创建、隔离、资源账本、清理以及它与 Local QA Sandbox 的独立性。
- Local Runtime Verifier 与 Local Policy Enforcement Point 的生产实现和不可绕过性。
- DesignApprovalEvidence、ExecutionApprovalEvidence、Design Grant、Execution Grant 的签发、撤销、绑定和防重放。
- Secret Broker、最小 scope CredentialLease、lease 撤销和 Secret 不落盘语义。
- hosted/local lease、generation 与 fencing 对重复执行、旧 Runtime 和延迟消息的隔离。
- PR synthetic merge commit、Run 专属 SourceAcquisition 和本地源码一致性。
- Environment Factory 启动真实 App/Middleware、执行 Readiness 和可靠 Cleanup。
- Local QA Sandbox 的文件、网络、Secret、资源和进程组隔离，以及所有本地副作用经 Local PEP 的强制路径。
- 生产 Chrome 边界，包括受限 Browser Provider、每 Run 临时 profile、宿主个人 profile/keychain 隔离和 control channel 限制。
- Codex CLI 的非交互执行、Action Envelope 限制和 Plan Amendment。
- Artifact 脱敏与存储、五类 Outcome、quality-evaluation、GitHub 发布和 PQL 学习回路。
- `workflow-qa` 的端到端持久编排、重试、断线恢复、副作用去重、terminal settlement 和 terminal 后 repair。

因此，POC 是关键传输与浏览器可行性证据，不是生产实现，也不能用来降低后续授权、隔离、恢复和质量验收要求。

## 4. 核心架构原则与不变量

以下原则是实现不得破坏的不变量：

1. **云端持久编排，本地受控执行。** `apps/hosted-control-plane` 保存 Durable Run 状态；源码设计发生在 Local Design Sandbox，PR 代码、构建、服务、Shell、浏览器和 Agent Action 发生在独立的 Local QA Sandbox。
2. **用户批准 scope 和 Plan，不批准 Grant。** Design Approval 批准设计所需的最小 scope；Execution Approval 批准 Structured Plan、Action Envelope、Secret 用途和资源预算。Grant 是 Hosted Authorization Authority 根据可验证 Evidence 签发的机器授权对象。
3. **Plan 先于执行批准。** 系统先取得 DesignApprovalEvidence 和 Design Grant，在 Local Design Sandbox 生成 Structured Plan，再由 Policy Gate 和用户审查执行范围并产生 ExecutionApprovalEvidence。
4. **签发权、批准证明与传输权分离。** Hosted Authorization Authority 签发并撤销两种 Grant；NyxID Approval/Device Provider 提供 Approval Evidence，NyxID Transport 负责传输，二者都不能签发 Grant 或扩大 scope。
5. **所有本地副作用必须经过 Local PEP。** Local Runtime Verifier 负责判断授权对象是否有效；Local Policy Enforcement Point 负责对每个文件、网络、进程、Secret、浏览器和资源动作实施约束。通过验证不等于允许绕过执行点。
6. **两个 Sandbox 独立。** Local Design Sandbox 与 Local QA Sandbox 分别创建、记账、清理和销毁；Design Grant 不能用于正式执行，Execution Grant 也不能复用旧 Local Design Sandbox 作为执行环境。
7. **Plan 不可静默变化。** 执行只能发生在已批准 Action Envelope 内。新增 Step、权限、文件范围、网络目的地、Secret 或显著预算时，必须进入 Plan Amendment。
8. **Secret 只通过 Broker lease 使用。** Secret Broker 只能在批准用途与 scope 内发放短期 CredentialLease；NyxID、Hosted Authorization Authority、Backend 和 Sandbox 都不能扩大 Secret scope，明文 Secret 不进入跨边界契约。
9. **Cleanup 权限独立且收窄。** CleanupCapability 不依赖有效的 Execution Grant；它只允许清理资源账本中绑定本 Run 和 generation 的对象，不能执行新测试、获取新 Secret 或创建新资源。
10. **恢复必须换代并隔离旧执行者。** 取消、失联、重试、Runtime 重启或控制权迁移后，恢复必须取得新的 generation 和 fence；旧 lease、旧命令、旧 Receipt 和旧进程不能提交新的有效副作用。
11. **Runner 决定测试结果。** Backend 产生观察和动作结果，`testing-runner` 用结构化断言决定 Case Pass/Fail；不采信 Codex 自报结论。
12. **质量裁决独立于测试执行和发布。** `quality-evaluation` 聚合 Case Result、Coverage 和 Evidence，分类失败并生成 Final Quality Outcome；Publication 只消费该结构化裁决，发布失败不能改变 Quality。
13. **Cleanup 是补偿阶段。** 成功、失败、取消、超时、失联和 Runtime 重启恢复都必须触发 Cleanup；Cleanup 幂等、可单独重试并输出 Receipt。
14. **Terminal 表示 settled，不表示全部成功。** 只有本 Run 所有必需 cleanup/publication action 都已成功、失败、跳过或转入明确 repair backlog 后，Run 才能 terminal；各 Outcome 可以保持失败、部分成功或 inconclusive。
15. **状态、结果与 settlement 分离。** Workflow state 表示流程位置；五类 Outcome 分别记录执行、清理、证据、发布和最终质量；action settlement 记录副作用是否已收敛，禁止压缩成单一 `Failed`。
16. **外部副作用幂等且带代际。** Prepare、Step、Cleanup、Artifact、GitHub Check/Comment/Issue 和 PQL Proposal 都必须可重试且不重复创建；所有 command、event、Receipt 和 Checkpoint 都绑定 run、generation 与 fence。
17. **契约版本化。** Plan、Grant、Receipt、Evidence 和 Quality 等跨边界对象必须可验证版本与内容摘要；完整规则由 [SPEC.zh-CN.md](SPEC.zh-CN.md) 定义。
18. **核心协议不绑定 NyxID 私有接口。** NyxID Transport 是首选传输 adapter；Local QA Runtime 的核心 Run 协议保持 transport-neutral，以便未来支持本机 CLI、企业 Device Agent 或自托管通道。

## 5. 仓库、模块与部署拓扑

目标代码结构采用 `fkst-hosted` monorepo，并把部署单元与可复用模块明确分开：

```text
ChronoAIProject/fkst-hosted
├── apps/hosted-control-plane     # 云端部署目标
├── apps/local-qa-runtime         # 用户电脑部署目标
└── packages/                     # 构建期/运行期模块，不是部署目标
    ├── qa-contracts
    ├── workflow-qa
    ├── testing-design
    ├── testing-runner
    ├── backend-contract
    ├── environment-factory
    ├── test-artifacts
    ├── quality-evaluation
    └── test-publication

ChronoAIProject/NyxID             # 独立产品与设备通道
YueZh127/product-quality-loop     # 独立 PQL 测试资产系统
```

### 5.1 独立部署目标

| 部署目标 | 运行位置 | 主要目的 |
| --- | --- | --- |
| `apps/hosted-control-plane` | FKST 云端 | Durable Run、调度、Checkpoint、Policy Gate 协调、Hosted Authorization Authority、结果裁决与外部 adapter |
| `apps/local-qa-runtime` | 用户电脑 | Local Runtime Verifier、Local PEP、Local Design Sandbox、Local QA Sandbox、Secret Broker、Browser Provider、进程生命周期、Receipt 和 Artifact 指针回传 |
| NyxID Cloud/Node | 云端与用户电脑 | NyxID Approval/Device Provider、NyxID Transport、凭据来源 adapter 与审计 |
| PQL | 独立服务/仓库 | 版本化测试策略、Project Pack、用例资产和学习闭环 |

`apps/hosted-control-plane` 与 `apps/local-qa-runtime` 必须独立构建、版本化、发布和升级。它们共享 packages 和契约，但不能被打包成必须同步部署的单一进程。Hosted Authorization Authority、Local Runtime Verifier、Local Policy Enforcement Point、Secret Broker 和 Browser Provider 都是上述 app 内部角色或可替换 adapter，不是新增的服务、Daemon 或部署目标。

### 5.2 Packages 的约束

`packages/*` 是可组合模块，不是服务或 Daemon。它们不得被文档、CI 或部署系统描述为独立部署目标。testing packages 不得依赖 `apps/*` 的实现；app 负责提供数据库、队列、网络、文件系统、浏览器、凭据和日志等具体适配。

这种结构保留 monorepo 的原子变更和契约一致性，同时阻止“共享代码等于共享部署”的耦合。

## 6. 组件职责与边界

### 6.1 两个 app

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| `apps/hosted-control-plane` | Run 持久状态、Durable Orchestration、RunDraft/SourceAcquisition/RunSpec、调度、Checkpoint、hosted lease/generation/fence、取消与恢复、Policy Gate 协调、Hosted Authorization Authority、NyxID Transport adapter、Quality/Settlement、GitHub/PQL adapter | 直接执行 PR 代码、Shell、浏览器动作、本地进程管理，或把 Policy Gate 当作本地副作用执行点 |
| `apps/local-qa-runtime` | Local Runtime Verifier、本地 lease/fence、Run Ledger、Local Design Sandbox、Local QA Sandbox、Local PEP、Secret Broker/CredentialLease、Browser Provider、端口/进程组/超时/取消、Runner Backend、Checkpoint、CleanupCapability、事件/Receipt/Artifact 指针回传 | 签发 Grant、替用户批准、扩大 Plan 或 Secret scope、决定最终 Quality Outcome、直接发布 GitHub Issue |

### 6.2 app 内部角色与 adapter

| 角色或 adapter | 所属 app | 责任边界 |
| --- | --- | --- |
| Hosted Authorization Authority | `apps/hosted-control-plane` | 验证 Policy Decision、DesignApprovalEvidence、ExecutionApprovalEvidence，签发/撤销 Design Grant 和 Execution Grant；不接管 NyxID Transport |
| Local Runtime Verifier | `apps/local-qa-runtime` | 验证签名、scope、RunSpec/Plan 摘要、设备、generation、fence、TTL、nonce 和撤销状态；不执行资源策略 |
| Local Policy Enforcement Point | `apps/local-qa-runtime` | 对所有本地副作用执行文件、网络、进程、Secret、browser control 和资源限制；不签发或解释 Grant |
| Secret Broker | `apps/local-qa-runtime` | 通过凭据来源 adapter 换取并发放短期 CredentialLease，限制用途、Step、generation 和生命周期；不把明文 Secret 暴露给 Hosted 或 NyxID Transport |
| Browser Provider | `apps/local-qa-runtime` | 按 Plan 创建 browser process、每 Run 临时 profile 和受限 control channel；不开放个人 profile、keychain 或任意 CDP |

这些角色可以在 app 内拆成模块、进程内 adapter 或受控 helper process，但它们不改变部署拓扑，也不能通过内部拆分绕过 app 的信任边界。

### 6.3 Testing packages

| Module | 负责 | 不负责 |
| --- | --- | --- |
| `qa-contracts` | 跨 app、NyxID Adapter、PQL Adapter 的公共契约与兼容规则 | 持久化、传输或业务编排 |
| `workflow-qa` | 完整 QA Run 的 workflow 定义、阶段依赖、补偿关系和 effect 语义 | 作为独立进程运行或直接管理本地进程 |
| `testing-design` | 根据源码、项目配置和 PQL 资产生成 Structured Plan | 批准 Plan、签发 Grant 或执行测试 |
| `testing-runner` | 选择 Backend、推进 Step、执行结构化断言并决定 Case Pass/Fail | 擅自扩大 Action Envelope 或生成最终发布策略 |
| `backend-contract` | 统一 Deterministic、Browser、Codex Backend 的执行与取消边界 | 规定具体浏览器、Agent 或 Shell 实现 |
| `environment-factory` | Prepare、条件 Readiness、资源登记和补偿 Cleanup 的接口与领域逻辑 | 作为独立部署服务；具体宿主能力由 local app 注入 |
| `test-artifacts` | Case Result、EvidenceManifest、脱敏、摘要、访问范围和保留策略 | 最终质量裁决或 GitHub 路由 |
| `quality-evaluation` | 聚合结果、Coverage、Evidence，分类失败并生成 Final Quality Outcome 与稳定去重依据 | 执行测试、修改 PQL 资产或直接调用 GitHub |
| `test-publication` | 根据 QualityEvaluation 生成幂等 Publication Plan | 自行重新解释原始日志或绕过 QualityEvaluation |

### 6.4 NyxID 与 PQL

NyxID Approval/Device Provider 负责用户身份、设备身份、在线性和 Approval Evidence；NyxID Transport 负责安全反向连接、命令、Grant、事件与 Receipt 传输；凭据来源 adapter 可参与 Secret Broker 的 lease 获取。NyxID 不拥有 FKST Run 状态，不签发任何 FKST Grant，不修改 Grant 或 Plan，不扩大 CredentialLease 的 Secret scope，不执行测试，也不判断测试质量。

PQL 负责 Product Map、Test Catalog、Project Pack、Regression Suite、Fixture、Selector、Scope Policy、Coverage Gap 和 Asset Change Proposal。它向 `testing-design` 提供版本化输入，并消费经质量裁决后的测试资产反馈；它不调度设备、不管理 Sandbox，也不发布产品仓库状态。

## 7. 信任模型与双阶段授权

系统跨越云端、设备通道、宿主 Runtime 和不受信任代码，不能把“用户点了批准”或“组织策略允许”简化成一个可转发布尔值。Policy Gate 负责云端策略判断，Local PEP 负责本地逐动作强制执行；两者处于不同边界，缺一不可。信任链包含以下角色：

| 角色 | 信任职责 |
| --- | --- |
| Policy Gate | 分别检查 Design scope 和 Execution Plan 请求的命令、文件、网络、Secret、资源和目标设备，产生可审计 Policy Decision |
| NyxID Approval/Device Provider | 证明哪个用户或哪条预批准策略，在什么设备上下文中批准了哪个 scope/Plan，并提供设备身份与在线性证明 |
| Hosted Authorization Authority | 验证 Policy Decision 与 Approval Evidence，签发、撤销 Design Grant 和 Execution Grant，维护 nonce、TTL、audience、generation、fence 与审计关联 |
| NyxID Transport | 将不可篡改的 Grant 和 Run 命令送达目标 Node，并持续回传事件、Receipt、Checkpoint 摘要和 Artifact 指针 |
| Local Runtime Verifier | 在任何本地副作用前验证签发者、设备、RunSpec、source revision、Plan 摘要、scope、有效期、generation、fence、撤销与重放状态 |
| Local Policy Enforcement Point | 对已经通过验证的具体动作再次实施本地文件、网络、进程、Secret、browser control 和资源限制 |

### 7.1 Design Approval Evidence 与 Design Grant

Design 阶段必须先产生 `DesignApprovalEvidence`。Evidence 绑定用户或预批准策略主体、目标设备、RunDraft/SourceAcquisition、允许读取的 source revision 与目录、PQL 资产、网络和资源上限、有效期及 nonce。即使组织策略允许低风险 Design 预批准，也必须由 NyxID Approval/Device Provider 产生可验证 Evidence，不能以“默认允许”绕过审计链。

Hosted Authorization Authority 同时验证 Design Policy Decision 与 `DesignApprovalEvidence`，随后签发 Design Grant。Design Grant 只允许在新的 Local Design Sandbox 中获得生成 Plan 所需的最小能力，例如读取固定 source revision、静态分析、读取批准范围内的项目元数据和 PQL 资产。它不允许启动被测服务、执行正式测试、访问长期 Secret、扩大网络访问、写入被测仓库或复用 Local QA Sandbox。

### 7.2 Execution Approval Evidence 与 Execution Grant

Structured Plan 生成并完成 Design Cleanup 后，Policy Gate 对 Plan、Action Envelope、Secret 用途、资源预算和目标设备产生 Execution Policy Decision。NyxID Approval/Device Provider 收集用户对该 Plan 的批准并生成 `ExecutionApprovalEvidence`；Evidence 必须绑定 `run_id`、`effective_sha`、`plan_digest`、`policy_digest`、设备、批准 scope、generation 候选和有效期。

Hosted Authorization Authority 验证 Execution Policy Decision 与 `ExecutionApprovalEvidence`，再签发绑定本次 RunSpec、固定 source revision、Plan、目标设备、generation、fence 和批准范围的 Execution Grant。用户批准的是 Plan 与 scope，Execution Grant 是 Authority 据此签发的机器授权结果。

NyxID Transport 只传输两种 Grant，不能重写 scope、延长 TTL、换绑设备或 generation，也不能扩大 Secret Broker 最终发放的 CredentialLease。Local Runtime 只信任 Hosted Authorization Authority 的签名和已配置的信任根，不因为请求来自 NyxID 通道就自动执行。

这种分离避免把设备通道变成业务授权中心：NyxID 可以替换或扩展，FKST 的授权语义、撤销规则、fencing 和审计责任仍由 FKST 控制。

## 8. Source Revision 与 PR 默认语义

测试结论必须对应一个固定、可重放的代码状态。源对象按 `RunDraft → SourceAcquisition → RunSpec` 演进：RunDraft 只记录触发输入和候选设备；SourceAcquisition 解析或生成不可变 Git 对象并记录获取方式、内容摘要与保留信息；只有 SourceAcquisition 完成后才冻结 RunSpec，作为 Approval Evidence、Grant、Plan、generation、Evidence 和 Quality 的共同绑定对象。RunSpec 冻结后不得继续跟随可变分支名。

### 8.1 PR Run

PR 默认测试固定的 synthetic merge commit：

1. RunDraft 记录精确的 base SHA、head SHA、repo、触发信息、profile、policy 和候选设备，但此时还不是可授权执行规范。
2. Hosted Source Resolver 完成 SourceAcquisition：使用 base/head 对象创建 synthetic merge commit，把不可变 Git 对象保存在 Runtime 可获取的受控 ref 或 bundle 中，并记录内容摘要与 effective SHA。
3. 系统用 SourceAcquisition 结果冻结 RunSpec；Local Design Sandbox 只获取并校验该 effective SHA，不在设备端重新生成 merge commit。
4. 后续 DesignApprovalEvidence、ExecutionApprovalEvidence、Design Grant、Execution Grant、Plan、Evidence、QualityEvaluation 和 Publication 全部绑定该 RunSpec 与 effective SHA；同一 Run 的合法重试和恢复复用既有对象，不重新按最新 base 生成。

选择 synthetic merge commit，是为了默认验证“PR 合入目标分支后的集成结果”，同时避免依赖可能变化或过期的临时 merge ref。代价是需要明确处理 merge conflict、对象保留和生成元数据；如果无法创建 merge commit，Run 应进入可解释的 Blocked 状态，不得静默退回仅测试 head SHA。

### 8.2 非 PR Run

非 PR Run 使用 exact commit SHA。分支名、标签或 Issue 中的文本只能用于解析入口，不能成为执行期 source identity。

### 8.3 变更后的重新运行

PR head、base 或任何 effective revision 变化时，必须创建新的 `run_id`，重新执行 SourceAcquisition、冻结新 RunSpec，并重新完成 Design Approval/Authorization。禁止在原 Run 内创建 revision attempt，也禁止通过 Plan Amendment 改变 `effective_sha`；revision 变化会使旧 DesignApprovalEvidence、ExecutionApprovalEvidence、Design Grant、Execution Grant、Plan 绑定和所有待提交 Evidence 全部失效，因为用户批准的是旧代码、旧 scope 与旧 Plan 的组合。

## 9. 完整 QA Run 生命周期

一次正常 Run 按以下阶段推进：

| 阶段 | 核心行为 | 主要责任方 |
| --- | --- | --- |
| Create | 创建 RunDraft，记录 repo、触发信息、base/head 或 exact commit 输入、profile、policy 和候选设备 | hosted-control-plane |
| Source Acquisition | 生成或解析固定 effective SHA，持久化 synthetic merge 对象、受控 ref/bundle、摘要和保留信息 | hosted-control-plane |
| Freeze RunSpec | 用 SourceAcquisition 结果冻结 RunSpec，建立后续 Evidence、Grant、Plan 和 generation 的共同绑定 | hosted-control-plane |
| Design Approval | Policy Gate 检查最小 Design scope；NyxID Approval/Device Provider 产生可验证 DesignApprovalEvidence，包括预批准场景 | hosted-control-plane + NyxID |
| Design Authorization | Hosted Authorization Authority 验证 Evidence 与 Policy Decision，签发 Design Grant | hosted-control-plane |
| Prepare Local Design Sandbox | Local Runtime Verifier 验证 Design Grant，取得 local lease/fence，经 Local PEP 创建独立 Local Design Sandbox 和资源账本 | local-qa-runtime |
| Local Design | 获取并校验 effective SHA，读取批准的 PQL 资产，生成 Plan v1 与摘要 | local-qa-runtime + testing-design |
| Design Cleanup | 用 CleanupCapability 撤销 Design CredentialLease，清理 Design 进程、挂载和 Local Design Sandbox，输出 Cleanup Receipt | local-qa-runtime + environment-factory |
| Policy Review | Policy Gate 检查 Plan 的 Action Envelope、资源、网络、browser control 与 Secret 请求 | hosted-control-plane / Policy Gate |
| Execution Approval | NyxID Approval/Device Provider 收集针对 Plan/scope 的用户批准与设备证明，产生 ExecutionApprovalEvidence | NyxID |
| Execution Authorization | Hosted Authorization Authority 验证 Evidence 与 Policy Decision，签发 Execution Grant | hosted-control-plane |
| Dispatch | 经 NyxID Transport 发送 RunSpec、Plan、Grant、generation/fence 和幂等 command | hosted-control-plane + NyxID |
| Prepare Local QA Sandbox | Local Runtime Verifier 验证 Execution Grant，取得 local lease，经 Local PEP 创建新的 Local QA Sandbox、Environment 和资源账本 | local-qa-runtime + environment-factory |
| Readiness | 只执行 Plan 声明的条件检查；API/CLI/单元测试不强制准备 Browser Provider | environment-factory |
| Execute | runner 选择 Backend，所有动作经 Local PEP 执行，并用结构化断言决定 Case Pass/Fail | testing-runner + local-qa-runtime |
| Evidence | 生成脱敏后的 Case Result、日志、截图、Trace 与 EvidenceManifest | test-artifacts |
| Cleanup | 用 CleanupCapability 对本 generation 登记的进程、端口、Local QA Sandbox、临时 profile、文件和 CredentialLease 执行补偿清理 | environment-factory + local-qa-runtime |
| Return（全程） | 从 Design Approval 开始持续经 NyxID Transport 回传带 generation/fence 的事件、Receipt、Checkpoint 摘要、Outcome 和 Artifact 指针，而不是末尾一次性返回 | local-qa-runtime + NyxID |
| Quality | 聚合 Case、Coverage、Evidence，分类失败并生成固定 source revision 的最终质量结论 | quality-evaluation |
| Publish | 幂等发布 GitHub Check/Comment/Summary，并按规则创建 Issue 或 PQL Proposal；每个 action 独立 settlement | test-publication + hosted adapters |
| Finalize | 对账所有 command/effect、Receipt、Checkpoint、cleanup/publication action 和 repair backlog；全部 settled 后关闭 Durable Run | workflow-qa / hosted-control-plane |

### 9.1 拒绝、取消与 Policy Block

用户拒绝或 Policy Gate 拒绝时，Run 进入 Blocked，并记录原因和审计事件。Design Approval 被拒绝时尚未创建 Local Design Sandbox；Execution Approval 被拒绝时必须确认 Design Cleanup 已 settled。若拒绝发生在任何本地资源创建之后，Runtime 都必须用 CleanupCapability 清理该 generation 已登记资源。

取消请求由 hosted-control-plane 持久化，先撤销 hosted lease、推进 generation/fence，再经 NyxID Transport 传播带新 fence 的 Cancel command。取消不是“停止等待”：Runtime 收到有效 fence 后必须停止接收旧 generation 动作、撤销 CredentialLease、quiesce/终止进程组，并进入补偿式 Cleanup。晚到的旧 command、event 或 Receipt 只能用于审计，不能改变当前 generation 状态。

### 9.2 失联、lease 与恢复

Hosted control plane 持有每个 active generation 的 hosted lease，Local Runtime 持有与其绑定的 local lease 和 fence token；两者都保存可重放 Checkpoint、effect ledger 与最近接受的 fence。网络失联不能让 Hosted 假定本地已经停止，也不能让 Runtime 无限持有执行权。lease 到期后 Runtime 必须停止创建新副作用，quiesce 当前工作，并保留 CleanupCapability 完成收敛。

恢复不能直接续用旧 lease。Hosted 对账事件、Receipt 和 Checkpoint 后创建新 generation/fence，撤销旧 Grant 与 lease，再决定重新 Dispatch、从确认过的幂等 Checkpoint 继续，或仅发起 Cleanup/repair。Runtime 重启后根据本地 Run Ledger 识别未完成资源，只接受高于本地 fence 的恢复命令；旧 Runtime 实例或延迟消息无法越过 fencing 提交副作用。

CleanupCapability 不能因普通 Execution Grant、Design Grant 或 lease 到期而失效。它由本地资源所有权记录约束，只能处理本 Run、本 generation 已登记的资源，且不能借此创建新资源、获取新 CredentialLease 或执行新测试。

## 10. Local QA Runtime 与 Local QA Sandbox

### 10.1 Runtime v1 形态

`apps/local-qa-runtime` v1 是 macOS-first 的签名本地 Daemon，由 launchd 管理。它是长期存在的本地控制宿主，不是每次 Run 临时下载的 POC 脚本。

v1 设计需要覆盖：

- 签名分发、安装与卸载。
- launchd 注册、开机/登录启动和崩溃恢复。
- Runtime 版本、健康状态和能力报告。
- loopback 或本地 IPC 接口的强认证。
- NyxID Node Adapter 的本地路由与最小权限凭据。
- 原子升级、失败回滚和版本兼容窗口。
- 本地 Run Lock、Ledger、Checkpoint 和残留资源扫描。

Linux 和 Windows Runtime 属于后续阶段。公共 contracts 和 backend interfaces 不应写死 macOS，但 v1 验收、发布和安全基线以 macOS 为准。

### 10.2 四个本地边界

Runtime 在宿主系统上运行并负责控制，但不受信任代码不能与 Runtime 合并成一个不受限制的本地进程。本地实现必须保留四个可独立审计的边界：

| 边界 | 承载内容 | 强制约束 |
| --- | --- | --- |
| Local Design Sandbox | 固定 source checkout、静态分析、批准的项目元数据与 PQL 资产、Structured Plan 生成 | 仅接受 Design Grant；独立资源账本和 Cleanup Receipt；不得启动正式测试环境 |
| Local QA Sandbox + Local PEP | 依赖安装、被测 App/Middleware、测试进程、Shell、Browser Backend 和 Agent Action | 仅接受 Execution Grant；所有副作用逐动作经过 Local PEP；不得复用 Local Design Sandbox |
| Secret Broker | 凭据来源 adapter、CredentialLease 发放/续租/撤销与使用审计 | 只按批准用途、Step、generation 和 TTL 发放；明文不进入 Hosted、NyxID Transport、Plan、Grant 或 Artifact |
| Browser Provider | Browser Backend 到宿主浏览器能力的受限适配 | 管理 browser process、临时 profile 与 control channel；不得暴露宿主个人浏览器状态或通用控制接口 |

本文对 `Workspace`、`Sandbox` 和 `Environment` 作严格区分：Workspace 只指某个固定 source revision 的文件视图或 checkout；Sandbox 是承载代码并实施隔离与策略的安全边界；Environment 是 Sandbox 内为测试创建的 App、Middleware、端口、数据库、浏览器等运行资源集合。三者不能作为同义词，也不能用“创建 Workspace”代替创建 Sandbox 或准备 Environment。

Local Design Sandbox 与 Local QA Sandbox 至少应保证：

- 只挂载本次 Run 的固定 effective SHA、明确批准目录和必要的只读输入。
- 默认不能读取用户主目录、其他仓库、浏览器个人 profile、keychain 或未批准文件。
- 网络目的地、文件读写、Secret、CPU、内存、磁盘、进程数和总时长同时受 Plan/Grant 与 Local PEP 约束。
- Secret 只以 CredentialLease 按 Step 或最小生命周期提供，不进入日志、任务正文、Artifact 或长期磁盘。
- Runtime 统一管理 Sandbox、Environment、子进程组、端口 lease、CredentialLease、浏览器临时 profile、超时和取消。
- 外部 Fork PR 默认没有长期凭据、生产环境访问或用户真实浏览器 profile。
- Cleanup 只操作资源账本中精确绑定本 Run 和 generation 的对象，不能按模糊名称清理其他 Run 或用户进程。

Container、轻量 VM 或两者组合仍是 Sandbox Provider 策略。无论选择哪种实现，安全语义和 Receipt 必须通过 `environment-factory` 契约保持一致。

### 10.3 生产 Chrome 边界

Browser Backend 是 `testing-runner` 选择的测试动作实现；browser process 是 Browser Provider 实际创建或受控连接的 Chrome 进程；browser profile 是该 process 使用的每 Run 临时数据目录；control channel 是 Runtime 向该 process 发出允许动作的受限通道。四者必须分别建模和审计。

当测试需要宿主系统 Chrome 的真实性时，只能由 Browser Provider 创建专用 browser process，并为每个 Run/generation 使用新的临时 profile。Provider 必须禁用宿主个人 profile、个人 cookies、登录态、扩展、下载目录和 keychain 继承；Cleanup 必须终止 process 并清理临时 profile。Local QA Sandbox 不得直接枚举或附加任意宿主 Chrome，不得访问任意 CDP endpoint，也不得取得可控制用户其他标签页或浏览器实例的通用 control channel。

POC 中由本地 Node.js Runtime 直接启动 Chrome 只证明 browser process 可达和动作可回传，没有证明上述 Browser Provider、Local PEP、profile 隔离或 control channel 限制，不能作为生产边界。

## 11. Structured Plan、Action Envelope 与 Plan Amendment

Structured Plan 是执行授权的可审查对象。它表达要运行哪些 Step、使用哪类 Backend、需要哪些依赖和能力、采用哪些结构化断言，以及每个动作允许触及的文件、网络、Secret 与资源范围。完整对象定义由 [SPEC.zh-CN.md](SPEC.zh-CN.md) 维护。

Action Envelope 是 Plan 中可执行权限的边界。Backend 可以在 envelope 内做受限探索，例如在批准目录中读取额外日志，或在已批准域名与预算内重试请求；它不能自行把“诊断需要”解释为新增权限。

以下变化必须触发 Plan Amendment：

- 新增、删除或改变会产生不同副作用的测试 Step。
- 扩大文件读写或挂载范围。
- 增加网络目的地或改变网络访问级别。
- 引入新的 Secret、凭据用途或更长暴露周期。
- 提升 Shell、浏览器、Agent 或宿主权限。
- 明显提高 CPU、内存、磁盘、进程数或总时长预算。
- 改变断言语义或会影响用户批准含义的 Backend。Source revision 变化禁止走 Amendment，必须创建新 Run。

Amendment 采用 hard-revoke 和新 generation 模型，完整顺序如下：

1. Local PEP 发现动作超出当前 Action Envelope，阻断该动作并回传 `amendment_required` 事件；Backend 不能先执行再补审批。
2. Runtime 在幂等边界 quiesce 当前执行，撤销当前 CredentialLease，保存带 generation/fence 的 Checkpoint、Artifact 摘要和精确资源账本。
3. Hosted Authorization Authority 撤销旧 Execution Grant，Hosted 推进 generation 并签发更高 fence，使旧 command、旧 Runtime 实例和延迟 Receipt 不能继续产生有效副作用。
4. Runtime 使用 CleanupCapability 以 `amendment_pause` 原因清理旧 Local QA Sandbox、Environment、browser process、browser profile、端口、进程和 CredentialLease；Cleanup 不依赖旧 Execution Grant 仍有效。
5. Policy Gate 检查 amendment design scope，NyxID Approval/Device Provider 产生新的 DesignApprovalEvidence，Hosted Authorization Authority 完成 amendment Design Authorization 并签发新的 Design Grant。
6. Runtime 创建全新的 Local Design Sandbox，在原 RunSpec 和固定 effective SHA 上读取已批准的 Checkpoint/Evidence，生成 Plan vN 与相对 Plan vN-1 的结构化 Diff，然后执行 Design Cleanup。
7. Policy Gate 审查新 Plan 与 Diff；NyxID Approval/Device Provider 生成新的 ExecutionApprovalEvidence。Hosted Authorization Authority 验证后签发绑定新 `plan_digest`、generation 和 fence 的 Execution Grant。
8. Runtime 创建全新的 Local QA Sandbox 和 Environment，只复用 Checkpoint 中已通过 Receipt 确认、在新 Plan 下仍有效且无需重跑的 Step；所有后续动作经 Local PEP 执行。

禁止在旧 Grant 撤销后直接恢复旧 Local QA Sandbox，禁止复用旧 CredentialLease 或 browser profile，也不能重复已完成的外部副作用。Source revision 变化不属于 Amendment，必须创建新 Run，并使现有 Approval Evidence、Grant 和 Plan 绑定全部失效。

不可变 Plan 会增加交互等待，但它把 Agent 的开放式能力限制在用户真正看过的范围内。对高权限本地执行而言，这个等待成本低于静默扩权的风险。

## 12. Evidence、质量裁决、Outcome 与路由

### 12.1 Runner 与 Quality Evaluation 的分工

`testing-runner` 对每个 Case 的结构化断言负责，并产出 Pass/Fail 或无法完成的执行结果。Backend 只提供观察、日志、页面状态、命令退出状态和动作结果，Codex 的自然语言结论不构成测试 Oracle。

`quality-evaluation` 不重新执行断言。它聚合 Case Result、计划覆盖、Evidence 充分性和失败上下文，区分产品缺陷、测试资产问题、覆盖缺口、环境失败、Flaky、Policy Block 和 Evidence 不足，并生成 Final Quality Outcome。`test-publication` 只能消费 QualityEvaluation，不能直接根据原始日志创建产品 Issue。

### 12.2 五类 Outcome

Workflow state 与以下五类 Outcome 独立记录：

| Outcome | 回答的问题 |
| --- | --- |
| `execution_outcome` | 测试执行本身是 passed、failed、cancelled、timed_out 还是 lost |
| `cleanup_outcome` | 资源是否全部释放，是否部分成功或仍有残留 |
| `evidence_outcome` | 证据是否 sufficient、partial 或 insufficient |
| `publication_outcome` | 外部发布是 published、partially_published、failed 还是 skipped |
| `final_quality_outcome` | 对本次固定 source revision 的最终质量结论是 pass、fail、blocked 还是 inconclusive |

例如，测试可以通过但 Cleanup 部分失败；测试可以失败但 Evidence 不足，从而最终质量为 inconclusive；GitHub Publication 失败只能改变 `publication_outcome` 和对应 action settlement，不能改写已经完成的测试断言、`execution_outcome` 或 `final_quality_outcome`。分离 Outcome 能让重试和 repair 针对正确阶段进行。

### 12.3 GitHub 与 PQL 路由

| 分类或结论 | GitHub 路由 | PQL 路由 |
| --- | --- | --- |
| 所有可发布 Run | 幂等更新 PR Check、Comment 或 Run Summary | 无需默认创建资产变更 |
| `product_defect` | 只有可复现、Evidence 充分且已排除环境/测试资产问题时，才在被测仓库创建或更新 Issue | 不创建 PQL 产品缺陷 Issue |
| `test_failure` | 在 Run Summary 中说明测试资产问题；不误报产品 Issue | 创建/更新测试资产问题或 Asset Change Proposal |
| `coverage_gap` | 可在 Check/Summary 中说明未覆盖范围 | 创建 Coverage Gap，经 Review 形成 Asset Change Proposal |
| `environment_failure` | 保留 Run 记录；重复或平台性故障可进入 FKST 平台 Issue | 仅在测试资产需要环境声明修正时反馈 |
| `flaky` | Check 标记不稳定，不直接创建产品缺陷 | 更新 Flaky 记录并触发稳定性改进提案 |
| `policy_blocked` | 记录 Blocked 原因和审计引用，不创建产品 Issue | 通常不创建 PQL Proposal，除非资产持续请求不允许的能力 |
| `insufficient_evidence` | 标记结论不充分，避免发布确定性产品缺陷 | 创建 Evidence/Coverage Gap，推动补充日志、Trace、截图或断言 |

自动生成的新用例或资产修改必须先保持 `design_only`，经过 PQL Review 后才能进入新 Project Pack，并只影响后续 Run。任何反馈都不能在当前 Run 中绕过 Plan Amendment 自动变成可执行 Step。

### 12.4 Settlement、Terminal 与 Repair

Cleanup 与 Publication 都由一组可枚举 action 构成，每个 action 必须进入 `succeeded`、`failed`、`skipped` 或 `repair_queued` 之一，才算 settled。`failed` 和 `repair_queued` 不是成功，但它们表示本次 Durable Run 已记录确定结果、重试上限、责任方和稳定 repair key，不再处于含糊的进行中状态。

Run 只有在执行与质量计算完成，所有必需 cleanup/publication action 均 settled，并且最后接受的 Receipt、Checkpoint 与 effect ledger 已对账后才能进入 terminal。Terminal 因而表示“本次编排已收敛”，不表示测试、清理、证据或发布全部成功。

Terminal 后允许独立 Repair Worker 按稳定 repair key 重试 Cleanup 或 Publication。Repair 必须使用新的 repair attempt/generation 和 fence，追加不可变 Repair Receipt，并更新 cleanup/publication 的派生投影视图；它不重开原 Run，不重新执行测试，不改变固定的 Final Quality Outcome，也不能让旧 command 或旧 lease 恢复有效。

## 13. 可靠性、安全、兼容性与权衡

### 13.1 可靠性、幂等与 settlement

Durable Orchestration 必须把每个外部副作用作为可识别 effect。Hosted 重试不应重复创建本地 Run，Runtime 重试不应重复启动服务，Artifact 重试不应重复上传内容，Publication 重试不应重复创建 Check、Comment 或 Issue。每个 effect 同时绑定 `run_id`、phase、action key、generation 和 fence；幂等键相同但 generation 过旧的请求必须被拒绝，而不是被当作当前重试。

Receipt 是阶段或 action 完成的证据，不只是日志。Prepare、Readiness、Step、Cleanup、Artifact、Publication 和 Repair 应通过稳定标识、输入/输出摘要、generation/fence 与 Checkpoint 对齐。Runtime 或 Hosted 崩溃后，系统先对账再决定重试、推进 generation、settle failure 或进入 repair，不能仅根据“最后一个状态名称”推断副作用是否发生。

所有跨 Hosted、NyxID Transport 与 Runtime 的 command、event、Receipt 和 Checkpoint 都必须显式绑定 generation 与 fence。接收方只能让当前或更高合法 fence 推进状态；旧 generation 的消息可以作为审计事实留存，但不能覆盖新 Checkpoint、延长 lease、提交新 Evidence、确认 Cleanup 或改变 settlement。

### 13.2 安全与契约兼容

跨边界对象需要版本、内容摘要、RunSpec 关联、generation、fence 和生产者版本，以便拒绝篡改、错误绑定、延迟重放和不兼容消息。签名 Grant 需要防重放、短有效期、目标设备和 audience 约束；撤销状态、hosted/local lease、fencing 和 Runtime 本地 nonce 记录共同阻止重复执行。

Artifact 默认先脱敏再离开设备。存储位置、加密方式、访问范围和保留期是待定策略，但必须在上传前可审查，并允许对敏感项目选择仅保留本地指针或完全不上传原始内容。

### 13.3 主要权衡

| 决策 | 获得 | 代价 |
| --- | --- | --- |
| 用户本地执行 | 真实依赖、浏览器和开发环境；无需把全部源码与 Secret 迁到云端 | 设备异构、离线、升级和资源争用更难处理 |
| 两个 app 独立部署 | 云端与本地可独立扩缩、升级和设置信任边界 | 需要严格契约兼容和跨版本测试 |
| Hosted Authorization Authority 与 NyxID 分离 | FKST 保有业务授权语义，NyxID 可替换，审计责任清晰 | 增加证明验证、撤销和密钥管理组件 |
| PR synthetic merge commit | 默认验证合入结果并锁定可重放 revision | 需要处理冲突、对象保留和 merge 元数据 |
| Immutable Plan + Amendment | 用户批准与实际动作一致，Agent 不可静默扩权 | 复杂诊断可能需要再次等待批准 |
| macOS-first Daemon | 先覆盖已验证平台，提供稳定 launchd 生命周期 | 初期不覆盖 Linux/Windows，需要签名与升级基础设施 |
| Packages 留在 monorepo | 原子更新契约与模块，减少跨仓库漂移 | 必须用依赖规则防止 apps 与 packages 反向耦合 |
| 独立 Quality Evaluation | 产品缺陷、测试问题和环境问题不会混为一谈 | 发布前多一个需要版本化和测试的裁决阶段 |

仍需在 SPEC 或实现 ADR 中锁定的策略包括：macOS Sandbox Provider、Artifact Store 与保留期、离线设备等待上限、Runtime 自动升级节奏，以及哪些低风险 Design 权限可以由组织策略预批准。

## 14. 实施阶段与架构验收标准

### 14.1 实施阶段

| 阶段 | 目标 | 主要产物 |
| --- | --- | --- |
| M0：契约、Source 与信任根 | 锁定跨边界语言、RunDraft→SourceAcquisition→RunSpec、批准 Evidence、签发责任和代际协议 | `qa-contracts`、synthetic merge 规则、DesignApprovalEvidence、ExecutionApprovalEvidence、Hosted Authorization Authority、Design Grant、Execution Grant、command/event/Receipt/Checkpoint 的 generation/fence 绑定 |
| M1：macOS 本地策略与隔离边界 | 建立可安装、可认证、不可绕过策略且 Design/Execution 分离的本地 Runtime | 签名 Daemon、launchd、本地认证、NyxID Transport adapter、Local Runtime Verifier、Local PEP、Local Design Sandbox、Local QA Sandbox、Secret Broker/CredentialLease、CleanupCapability、Browser Provider |
| M2：可恢复生命周期与 Amendment | 让 Design、Execution、Cleanup 在失败、取消、失联、重启和扩权请求后可收敛 | `workflow-qa` 全生命周期、hosted/local lease、generation/fencing、Checkpoint/effect ledger、完整 Plan Amendment、Design Cleanup、QA Cleanup、五类 Outcome、settlement 与 terminal 后 repair |
| M3：证据、质量与发布 settlement | 从固定 revision 的执行结果得到独立 Quality，并让外部副作用可去重、可修复 | `test-artifacts`、`quality-evaluation`、GitHub Publication actions、故障分类、Artifact 策略、Publication Receipt/repair，验证发布失败不改变 Quality |
| M4：PQL 学习闭环 | 把测试缺口转化为经过 Review 的下一版资产，且不反向改变当前 Run | Coverage Gap、Asset Change Proposal、Review Gate、新 Project Pack、稳定去重和后续 Run 回归验证 |

M1 应复用 Chrome POC 的传输结论，但不能复用其无认证服务、内置 fixture、直接宿主执行、个人 profile 或开放 control channel 作为生产安全模型。M0 到 M2 是进入真实项目试运行的前置条件；M3 完成前不得把所有失败自动发布为产品 Issue，也不得把 Publication 成功当作 Quality 成功；M4 完成前只允许人工维护 PQL 反馈。

### 14.2 架构验收标准

实现进入生产前，至少必须满足以下条件：

- Mermaid 是架构语义基准；定制 SVG 是同步 presentation view，自动或人工检查能发现两者的标签、边界和授权方向漂移。
- PR 默认生成固定 synthetic merge commit；非 PR Run 使用 exact commit SHA；系统按 RunDraft→SourceAcquisition→RunSpec 冻结身份，Plan、Approval Evidence、Grant、Evidence 和发布结论绑定同一 effective SHA。
- revision 变化创建新 Run，并使旧 DesignApprovalEvidence、ExecutionApprovalEvidence、Design Grant、Execution Grant、Plan 绑定和待提交 Evidence 失效。
- Design 预批准也产生可验证 DesignApprovalEvidence；Hosted Authorization Authority 验证 Evidence 和 Policy Decision 后分别签发 Design Grant 与 Execution Grant。
- 用户批准的是 Design scope 或 Structured Plan/Execution scope；NyxID Approval/Device Provider 只提供批准/设备证明，NyxID Transport 只传输，二者都不签发 Grant、不修改 scope、不扩大 Secret 权限。
- Policy Gate 与 Local PEP 分别完成云端策略判断和本地逐动作强制执行；Local Runtime Verifier 只验证授权有效性，不能替代 Local PEP。
- `apps/hosted-control-plane` 与 `apps/local-qa-runtime` 独立构建和发布；Hosted Authorization Authority、Local Runtime Verifier、Local PEP、Secret Broker、Browser Provider 是 app 内角色或 adapter；`packages/*` 不是部署目标且不依赖 apps 实现。
- Runtime v1 以签名 macOS Daemon 交付，由 launchd 管理，并具备本地认证、健康检查、升级/回滚、本地 Run Ledger 和重启恢复能力。
- Local Design Sandbox 与 Local QA Sandbox 独立创建、授权、记账、清理和销毁；Design Grant 不能启动正式测试，Execution Grant 不能复用旧 Design Sandbox。
- Workspace 仅表示固定 source 文件视图，Sandbox 表示隔离边界，Environment 表示 Sandbox 内运行资源；实现、Schema 和日志不混用三者。
- 所有本地文件、网络、进程、Secret、浏览器和资源副作用都经过 Local PEP；默认不能读取用户主目录、其他仓库、未批准文件或宿主个人浏览器状态。
- Secret 只由 Secret Broker 以最小 scope CredentialLease 提供；明文不进入 Plan、Grant、命令正文、NyxID Transport、Artifact 或长期磁盘，NyxID 不能扩大 lease scope。
- Browser Provider 只创建受控 browser process，每 Run/generation 使用临时 profile 和受限 control channel；不能使用个人 profile/keychain、附加任意宿主 Chrome 或开放任意 CDP。
- `testing-runner` 根据结构化断言决定 Case Pass/Fail；Codex 只能在批准的 Action Envelope 内执行，超出范围的动作由 Local PEP 在副作用前阻断。
- Amendment 完整执行 quiesce/checkpoint、旧 Execution Grant 撤销、CleanupCapability 清理、amendment Design Authorization、新 Local Design Sandbox、Plan vN/diff、Policy Review、Execution Approval、新 Execution Grant、新 Local QA Sandbox 和新 Environment。
- Readiness 按 Plan 条件执行，不把浏览器准备强加给 API、CLI 或单元测试。
- 成功、失败、取消、超时、失联和 Runtime 重启恢复都触发补偿 Cleanup；CleanupCapability 不依赖有效 Execution Grant，且只能清理本 Run/generation 资源账本中的对象。
- hosted/local lease、generation 和 fencing 能阻止旧 Runtime、旧 lease、延迟 command/event/Receipt 和重放消息提交新副作用；所有 command、event、Receipt、Checkpoint 都绑定 generation/fence。
- Return 是贯穿 Design、Execution、Cleanup、Quality 和 Publication 的事件/Receipt 回传流，不是末尾一次性结果返回。
- `execution_outcome`、`cleanup_outcome`、`evidence_outcome`、`publication_outcome` 和 `final_quality_outcome` 独立记录，不与 workflow state 或 action settlement 混用。
- `quality-evaluation` 位于 Artifacts 与 Publication 之间，能区分产品、测试资产、覆盖、环境、Flaky、Policy 和 Evidence 问题；Publication 失败不改变 Final Quality Outcome。
- Run 只有在所有必需 cleanup/publication action 已 settled 后才 terminal；terminal 可包含失败或 repair backlog，不要求全部成功。
- Terminal 后 repair 使用新 attempt/generation/fence，追加 Repair Receipt 并更新派生投影，不重开 Run、不重跑测试、不改变 Final Quality Outcome。
- GitHub Check/Comment/Issue 与 PQL Gap/Proposal 使用稳定去重和 repair key；重放同一 Run 不重复启动服务、上传 Artifact 或创建外部对象。
- 产品缺陷只在可复现且 Evidence 充分时进入被测仓库；测试失败、覆盖缺口、Flaky 和 Evidence 不足按规则进入 PQL Review Loop。
- POC 只作为 Cloud → Node → 已运行 Runtime → Chrome → 结构化结果回传的证据；Local Design Sandbox、Local PEP、CredentialLease、lease/fencing、生产 Chrome boundary 和 terminal settlement 必须通过 M0-M4 实现与故障注入后才能声明生产可用。

满足这些标准后，系统才是一条批准可证明、授权可验证、本地副作用可强制约束、状态可恢复、结果可裁决、外部发布可去重且可修复、测试资产可学习的长期 QA Loop，而不是一次远程触发本地脚本的演示链路。
