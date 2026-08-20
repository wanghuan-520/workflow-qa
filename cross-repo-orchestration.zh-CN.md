# FKST 本地 QA 跨 Repo 调度与模块关系

> 范围：`workflow-qa` 是整条测试流程的概念名称，不是 repo、服务或模块。本说明只描述参与这条流程的实际系统和实现 repo。
>
> 当前已冻结范围：`local_qa_agent_mvp` Browser-only；未来另有 `hardened_untrusted_code` 执行 Profile。Talos Testing Tool/Scheduler/worker 是目标调度提案，在 owning repo contract 冻结前不替代本文的 direct Host baseline。
>
> Talos 目标提案流程图：[Talos testing dispatch sequence](design-proposals/diagrams/pql-testing-simple-flow.mmd)。该图只覆盖调度与执行返回，不表示 Artifact、Quality、Report、Publication 或 Settlement 已闭合。

## 1. 结论

`workflow-qa` 不是参与方。下面列出当前 direct Host baseline 的四个系统/实现边界；Talos 目标调度边界见独立设计提案，不在 owning repo contract 冻结前冒充已交付路径：

| Repo / 系统 | 定位 | 主要模块 | 不负责 |
| --- | --- | --- | --- |
| `ChronoAIProject/fkst-hosted` | QA 工作流和执行器的目标实现 monorepo | Hosted Control Plane、Local QA Host、未来 Hardened Runtime、Testing Packages、Artifact/Quality/Report/Publication | NyxID 的设备传输实现、PQL 资产评审 |
| `ChronoAIProject/NyxID` | 从云端到指定用户设备的受认证通道 | NyxID Cloud、node-pinned Service、NyxID Node、local credential adapter | QA Run 状态、业务授权、测试执行、Pass/Fail、报告 |
| `YueZh127/product-quality-loop` | 测试策略和资产生命周期 | Project Pack、Coverage Gap、Asset Proposal、Review、Promotion | 设备选择、直接调用 Local QA Host、签发运行授权 |
| `ChronoAIProject/fkst-packages-testing` | Testing Packages 的可能迁移来源 | testing-design、testing-runner 及 standalone harness | 若已迁入 `fkst-hosted/packages/*`，不得继续维护第二套实现 |
主控制权分配如下：

- Hosted 创建 Durable Run、冻结输入、选择设备、签发业务授权，并拥有最终 settlement。
- NyxID 只解析目标 Service/Node 并传输请求。请求经过 NyxID 不等于业务上允许执行。
- Local QA Host 拥有本地 admission、执行事实、资源所有权、Evidence 处理、Cleanup 和 upload attempt。
- `testing-runner` 根据结构化 Assertion 决定 Case Pass/Fail。
- hosted `quality-evaluation` 决定最终 Quality Outcome。
- PQL 拥有测试资产的评审和 promotion，不直接调度设备。

## 2. 当前 direct Host baseline 的 Browser QA Run 调度

1. 用户、PR 或 API 在 Hosted 创建 `RunDraft`。
2. PQL 可以提供版本化 `ProjectPackSnapshot` 和已经批准的测试资产。
3. `testing-design` 生成 Structured Plan；Hosted 冻结 exact Source、Plan、Environment Profile 和执行 Profile。
4. Hosted 选择逻辑设备和执行 slot，签发绑定 caller、device、installation、Run、各输入 digest、TTL、nonce 和 operation 的授权。
5. Hosted 把 `signed submit_run` 发给 NyxID Cloud 的 node-pinned Service。
6. NyxID Cloud 验证 transport scope 并把请求路由到指定 NyxID Node；Node 注入安装级本地 credential，调用 loopback Local QA Host。
7. Local QA Host 在任何资源副作用前完成 local credential、strict parse、canonical digest、Hosted signature、idempotency、nonce 和 single-active-slot admission。
8. Acceptance、初始 Snapshot 和 sequence=1 Event 原子持久化后，Host 才 materialize exact Source，创建 per-run workspace 和受控 Compose 环境。
9. Readiness 通过后，Host 启动独立 System Chrome process、临时 Chrome Profile 和 downloads。
10. Testing Runner 发送 typed Browser Actions，消费 bounded Observations，并计算 AssertionResult 和 CaseResult。Chrome 或 Backend 不能自报 Pass。
11. Screenshot 和 bounded JSON 先进入本地 quarantine，经过 safe projection、redaction、media/size/schema/canary 校验后进入 sanitized staging。
12. Host 先精确清理 Chrome、Compose、端口、workspace 和 raw quarantine，再释放 execution slot。Cleanup 不等待 Hosted 恢复。
13. Host 为每个已验证对象申请短期 upload grant，把 sanitized bytes 直接上传 Hosted Artifact Ingestion。Artifact bytes 不经过 NyxID 长响应。
14. Hosted 以 ArtifactIngestReceipt、CaseResult、EvidenceManifest 和 CleanupReceipt 冻结 ReportInputSet，计算 Quality、生成 Report、执行 GitHub/PQL Publication，并持久化 RunSettlement。
15. Hosted 把 Coverage Gap、Proposal 或 PromotionReceipt 回传 PQL；报告和发布修复不得重跑本地 Browser Case。

## 3. `fkst-hosted` 内部模块关系

### 3.1 Apps

| App | 部署位置 | 责任 |
| --- | --- | --- |
| `apps/hosted-control-plane` | FKST 云端 | Durable Run、输入冻结、设备/profile 调度、业务授权、Artifact ingestion、Quality、Report、Publication、repair、settlement |
| `apps/local-qa-host` | 用户电脑 | 当前 MVP 的 admission、Journal、Source/Compose/Chrome、runner adapter、Evidence、Cleanup、Upload |
| `apps/local-qa-runtime` | 用户电脑 | 未来 Hardened Profile 的 Rust Supervisor、Ledger、EffectGate、VZ VM、Warden、Secret Broker 和 signed recovery |

三个名称表达两个本地执行 Profile：

- `apps/local-qa-host` 对应当前 `local_qa_agent_mvp`。
- `apps/local-qa-runtime` 对应未来 `hardened_untrusted_code`。
- Hardened 请求不能因设备能力不足而降级到 MVP。

### 3.2 Packages

| Package | 关系 |
| --- | --- |
| `qa-contracts` | Hosted 和两个本地 app 共享的 wire、state、receipt、error 与 canonical digest 契约 |
| `testing-design` | 从批准的测试资产生成 Structured Plan；不直接调度设备 |
| `testing-runner` | 消费 Plan 和 Observation，计算 AssertionResult / CaseResult；不管理本地资源 |
| `environment-factory` | 描述和准备版本化测试环境能力；具体本地资源仍由执行器拥有 |
| `test-artifacts` | Evidence manifest、redaction、artifact contract 与适配逻辑 |
| `quality-evaluation` | Hosted 侧最终 Quality 分类，不在 Local QA Host 中运行最终裁决 |
| `test-publication` | 消费 QualityEvaluation 和 ReportRecord，生成幂等 publication effect |

`packages/*` 是可组合库，不是独立 daemon，也不得依赖 app 的内部实现。两个 app 独立构建和发布。

## 4. 数据流与控制流必须分开

| 流 | 路径 | 内容 |
| --- | --- | --- |
| 控制请求 | Hosted → NyxID Cloud → Node → Local QA Host | submit/cancel/get/events，签名授权，bounded Snapshot/Event/Receipt |
| 本地执行 | Host → Workspace/Compose/Runner/Chrome | exact Source、typed readiness、typed Browser Actions、bounded Observations |
| Artifact 数据 | Local QA Host → Hosted Artifact Ingestion | per-object grant、post-redaction digest、sanitized screenshot/JSON |
| 报告和反馈 | Hosted Quality/Report → 用户、GitHub、PQL | QualityEvaluation、ReportRecord、PublicationReceipt、CoverageGap、PromotionReceipt |
| 代码和契约依赖 | `fkst-hosted/packages/*` → apps | 编译期库依赖，不是运行时网络调用 |

## 5. 权威边界

| 事实 | 唯一权威 |
| --- | --- |
| 云端 workflow state、设备选择、最终 settlement | Hosted Control Plane |
| 业务运行授权 | Hosted Authorization Authority |
| 设备 identity、service/node route、transport audit | NyxID |
| 本地 acceptance、state、resource ownership、attempt、cleanup | Local QA Host Journal；Hardened 时为 Runtime Ledger |
| Case Pass/Fail | `testing-runner` |
| Final Quality Outcome | hosted `quality-evaluation` |
| 测试资产 Review / Promotion | PQL |
| 长期 Artifact 和 Report | Hosted Artifact/Report plane |

## 6. 当前需要继续锁定的事项

1. 本地 MVP app 在目标架构旧稿中叫 `apps/local-qa-agent`，当前 issue drafts 使用 `apps/local-qa-host`。本说明采用后者，实施前应冻结最终目录名。
2. Testing Packages 可能仍位于 `ChronoAIProject/fkst-packages-testing`，也可能迁入 `fkst-hosted/packages/*`。迁移期间必须指定唯一 source of truth，禁止复制两套实现。
3. Source 的来源尚需明确：Hosted 必须冻结并提供 exact digest-bound Source Object，但不能把用户原 checkout 当执行 workspace，也不能修改用户原 repo。
4. Hosted 的“调度”目前是职责描述，尚未冻结独立 Scheduler queue/worker contract。实现时可内部拆分，但不能把设备选择权下放给 NyxID。
5. `report_impossible` 应由 Hosted 根据 ReportInputSet 完整性决定；Local QA Host 只记录并镜像 delivery disposition。
6. `browser.after_action_before_assertion` 崩溃应保持 execution uncertainty，不能简单当作 assertion failure；对应 failpoint fixture 与 recovery 语义需要统一。

## 7. 读图规则

- 蓝色：`fkst-hosted` 云端或共享 package。
- 绿色：用户电脑上的本地执行模块。
- 青色：NyxID 设备通道。
- 橙色：PQL 测试资产生命周期。
- 紫色：Testing Packages 及其契约边界。
- 灰色虚线：未来能力或编译期/设计期关系，不表示当前运行时调用。
