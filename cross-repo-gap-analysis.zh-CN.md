# Workflow QA 旧版三 Repo 缺口总结（已被 Talos Target 取代）

> **状态：Superseded direct-Host baseline / 历史参考。**
>
> 本文记录 2026-08-12 时以 `fkst-hosted -> Local QA Host` 为中心的三 Repo 方案。它不再是当前 `PQL -> NyxID -> Talos -> Local QA Runtime` Target 的实施清单，也不得用于分配 operational QARun、TestingTask、机器调度或 cancel/events 权威。
>
> 当前实施范围、固定基线和 owning repo 以 [Repo Gap 文档索引](repo-gaps/README.zh-CN.md)、[Talos Testing Tool 最小 MVP 设计](design-proposals/talos-testing-tool-mvp-design.zh-CN.md) 和 [Talos 详细缺口](repo-gaps/talos-gap-analysis.zh-CN.md) 为准。当前 Target 明确包含 `ChronoAIProject/talos`，由 Talos Testing Tool 拥有 operational QARun 的 submit/get/events/cancel；Hosted 只保留业务授权以及 Artifact、Quality、Report、Publication、Settlement 等下游领域。
>
> 以下“实施 repo”“生产链路”和阶段划分只描述旧 direct-Host baseline，保留用于迁移和历史差异核对。
>
> 审计日期：2026-08-12
>
> `workflow-qa` 是从需求到测试报告的完整测试流程名称，不是 repo、服务或模块。
>
> 实施 repo：`product-quality-loop`、`fkst-packages-testing`、`fkst-hosted`。
>
> `NyxID` 不修改代码，只复用现有 Cloud / Service / Node 通道。
>
> 详细文档：
> - [fkst-packages-testing 详细缺口](repo-gaps/fkst-packages-testing-gap-analysis.zh-CN.md)
> - [fkst-hosted 云端详细缺口](repo-gaps/fkst-hosted-gap-analysis.zh-CN.md)
> - [local-qa-runtime 分支详细缺口](repo-gaps/local-qa-runtime-gap-analysis.zh-CN.md)

## 1. 总体结论

目标生产链路是：

```text
需求 / PRD / PR 变更
→ product-quality-loop
  ProjectPackSnapshot / TestCaseAsset / Review / Promotion
→ fkst-packages-testing
  testing-design / StructuredPlan / testing-runner / CaseResult / EvidenceManifest
→ fkst-hosted
  Durable Run / 授权 / NyxID 调度 / Local QA Host / Artifact / Quality / Report
→ 测试报告
→ product-quality-loop
  CoverageGap / AssetChangeProposal / Review / PromotionReceipt
```

三个 repo 都已经有可复用的真实实现，但还没有共享一条完整、身份连续的生产契约：

- `product-quality-loop` 已有 Project Pack、测试映射、覆盖分析、测试资产设计和评审基础；缺少不可变 snapshot、正式资产版本、Hosted feedback ingestion 和 promotion receipt。
- `fkst-packages-testing` 已有生产级 `testing-design`、StructuredPlan 编译、CLI/HTTP 执行、Browser controller、replay、Local PEP、cleanup 和 publication；缺少统一的跨执行模式结果契约、EvidenceManifest、PQL 原生资产输入和 Hosted ingestion projection。
- `fkst-hosted` feature 分支已有 Host API、SQLite acceptance、Chrome adapter、Worker protocol 和 Evidence stager 等组件；缺少 Durable QA Run、业务授权、真实 Host coordinator、资源账本、Artifact ingestion、Quality、Report 和 Settlement。相关 Local QA 能力尚未进入 `origin/main`。
- NyxID 现有 Node 能作为传输通道，不需要增加 QA 业务逻辑。Hosted 必须独立拥有 Run、设备绑定和业务授权，Local QA Host 必须独立验签。

## 2. 当前分支和有效实现基线

| Repo | 当前 checkout | 远端参考 | 判断 |
| --- | --- | --- | --- |
| `product-quality-loop` | `main`，本地落后 `origin/main` 31 commits | 以 `origin/main` 的 coverage、asset design、registry 等工作计入审计 | 上游有重要基础，但生命周期 identity 尚未闭合 |
| `fkst-packages-testing` | `fix/issue-626-after-627` | `origin/fkst-hosted-default` 与当前实现基本一致；`origin/dev` 明显落后 | CLI/HTTP 主链路成熟，Browser 和统一结果/证据仍有缺口 |
| `fkst-hosted` | `test/5879-local-evidence-digests`，跟踪 feature 且落后 35 commits | 同时审计 `origin/feat/local-qa-runtime` 和 `origin/main` | feature 有组件，main 尚无 Local QA 生产链路 |

本报告只把当前 checkout 和本地已有远端 refs 中可验证的实现计入结论。未合并 feature 不等于已经发布到主线。

## 3. `product-quality-loop` 还缺什么

### 3.1 已有能力

`origin/main` 已经提供：

- Project Pack 配置、产品模块映射、测试 scope 和质量 gate。
- PR/post-merge 变更分类和确定性测试选择。
- Test Case、Case Spec、Process Case、Real Case、case compiler 和 case registry 等资产前身。
- Coverage review，可发现缺失 scope、fallback-only coverage 和建议测试资产。
- Governed test asset design：risk、coverage、execution review 和 meta-judge。
- 本地 JSON/Markdown 测试报告和 FKST/governance handoff。

关键实现入口：

- [PQL README](https://github.com/YueZh127/product-quality-loop/blob/376d0b7979d3e5c2bdea03bbacd9e47276098e2e/README.md)
- [Project Pack loader](https://github.com/YueZh127/product-quality-loop/blob/376d0b7979d3e5c2bdea03bbacd9e47276098e2e/skills/product-quality-loop/scripts/project_pack.py)
- [Coverage review](https://github.com/YueZh127/product-quality-loop/blob/376d0b7979d3e5c2bdea03bbacd9e47276098e2e/skills/product-quality-loop/scripts/coverage_review.py)
- [Test Case schema](https://github.com/YueZh127/product-quality-loop/blob/376d0b7979d3e5c2bdea03bbacd9e47276098e2e/skills/product-quality-loop/schemas/test-case.schema.json)
- [Test Plan schema](https://github.com/YueZh127/product-quality-loop/blob/376d0b7979d3e5c2bdea03bbacd9e47276098e2e/skills/product-quality-loop/schemas/test-plan.schema.json)

### 3.2 P0 缺口：不可变需求和资产身份

目前 `ProjectPack` 仍是多个 YAML/路径的运行时包装，不是一个可签名、可引用的不可变对象。需要增加：

#### `ProjectPackSnapshot`

至少包含：

- `snapshot_id`、schema version、project/repository identity。
- exact source revision。
- requirements/product map/test selection/quality policy 的 constituent digests。
- approved TestCaseAsset refs。
- parent snapshot 和生成时间。
- aggregate canonical digest。

#### `TestCaseAsset`

现有 Test Case 需要升级为长期资产：

- stable `asset_id`、asset version、content digest。
- requirement/capability references。
- typed preconditions、steps、assertions、fixtures、cleanup 和 evidence policy。
- source snapshot、predecessor/supersession links。
- lifecycle state：candidate、reviewed、promoted、deprecated、rejected、quarantined。

没有这两个对象，无法证明“执行的用例就是用户评审和 promotion 的那个版本”。

### 3.3 P0 缺口：正式治理对象

现有 review chain 和 test-design handoff 是很好的基础，但还不是稳定跨 repo 合同。需要增加：

- `AssetChangeProposal`：绑定 originating gap、base snapshot、当前资产版本、具体变更操作、预期新 digest、证据和幂等键。
- `ReviewDecision`：绑定 proposal digest、candidate asset digests、reviewer role、policy version、verdict 和 findings。
- `PromotionReceipt`：绑定 proposal/decision、promoted asset versions/digests、目标 snapshot/commit、actor、timestamp 和 conflict outcome。
- append-only lifecycle ledger：不能只依赖可覆盖的 registry status 文件。

Promotion 仍可由外部治理系统合并；PQL 需要负责接收、验证和 reconcile PromotionReceipt，而不是自己直接 merge。

### 3.4 P0 缺口：Hosted 质量反馈入口

当前 coverage gap 主要来自本地 classification、scope、route 和 diff，不消费 Hosted 的真实执行/质量报告。需要实现：

```text
Hosted Quality/Report Feedback
→ validate provenance and digest
→ deduplicate event
→ persist checkpoint
→ derive attributed CoverageGap
→ create AssetChangeProposal
```

输入必须能引用：

- Hosted run ID。
- ProjectPackSnapshot / TestCaseAsset versions。
- StructuredPlan digest。
- CaseResult / EvidenceManifest / ReportRecord refs。
- Quality ruleset 和 outcome。
- feedback event ID、cursor、digest、retry semantics。

### 3.5 P1 缺口：完整 schema 校验

当前部分主流程仍使用只检查顶层 required/const 的轻量 validator。所有持久资产和生命周期对象需要统一使用完整 Draft 2020-12 校验，并覆盖：

- nested types 和 enums。
- `additionalProperties: false`。
- bounds、Unicode 和 number domain。
- canonicalization 和 digest verification。
- replay、stale-base、conflict 和 tamper tests。

## 4. `fkst-packages-testing` 还缺什么

### 4.1 已有能力

当前主实现已具备：

- `testing-design`：验证 approval subject、检查 exact Git object、解析 requirements/design/API/tests，输出 repository analysis、requirements index 和 traceability seed。
- reviewed `testing-runner.module-test-plan.v1`。
- Host-authorized `testing-structured-plan.v2` 编译，绑定 case catalog、Environment receipt、browser readiness 和 residual risk。
- production CLI/HTTP execution：direct argv、positive capabilities、single-use replay claim、Local PEP、effect receipt 和 durable recovery。
- agentic browser controller：sanitized observation、selector-free typed actions、Host-authoritative completion。
- Environment Factory、cleanup、artifact summary、GitHub/filesystem publication 和 terminal replay。
- generic-host E2E tests 和 CI。

关键实现入口：

- [Testing Design contract](https://github.com/ChronoAIProject/fkst-packages-testing/blob/121fe09e12af3158fab85856bf8ef928d5121d6f/contracts/testing-design.v1.md)
- [Structured Execution contract](https://github.com/ChronoAIProject/fkst-packages-testing/blob/121fe09e12af3158fab85856bf8ef928d5121d6f/contracts/structured-execution.v2.md)
- [Structured plan compiler](https://github.com/ChronoAIProject/fkst-packages-testing/blob/121fe09e12af3158fab85856bf8ef928d5121d6f/packages/testing-runner/structured_planning.lua)
- [Structured executor](https://github.com/ChronoAIProject/fkst-packages-testing/blob/121fe09e12af3158fab85856bf8ef928d5121d6f/packages/testing-runner/structured_execution.lua)
- [Browser controller](https://github.com/ChronoAIProject/fkst-packages-testing/blob/121fe09e12af3158fab85856bf8ef928d5121d6f/packages/testing-runner/ai_browser_control.lua)

### 4.2 P0 缺口：统一执行结果契约

当前存在两代执行契约和多种结果形状：

- revised CLI/HTTP executor 的 assertion 接近 `{type, passed}`。
- 旧 `testing_execution` contract 使用 `{type, status, observation, evidence_pointer}`。
- agentic browser route 的 case result 没有完整 assertion entries。
- publication 自己维护了一份 case-result validator。

需要建立唯一公共模块：

- `TestingObservation`
- `TestingAssertionResult`
- `TestingCaseResult`
- `TestingCaseResultSet`

所有 CLI、HTTP、Browser route 必须输出同一字段集合：

- case/asset/requirement identity。
- execution mode。
- execution status 和 classification。
- observations。
- assertion results。
- evidence refs。
- timing、bounded error 和 non-execution reason。

publication、Hosted projection 和 PQL feedback 都必须消费这个公共模块，不能各自解释结果。

### 4.3 P0 缺口：统一 `EvidenceManifest`

现有 per-case evidence 和 `test-artifacts.summary.v1` 还不能表达完整证据链。需要新增 canonical manifest：

- run/repository/plan identity。
- `evidence_id`、case ID、optional assertion ID。
- role、pointer、SHA-256、media type、size。
- producer、created time。
- sensitivity/redaction classification。
- provenance 和 evidence policy version。

runner result 必须 digest-bind 这个 manifest。缺失、篡改或不匹配的 evidence 必须 fail closed。

### 4.4 P0 缺口：Browser route 完整化

Browser controller 已有安全设计，但还缺：

- 把 Host-authoritative completion 转换为 canonical AssertionResult。
- 将 sanitized observations 按 digest 引用，而不是只引用 aggregate browser receipt。
- 完整 durable workflow：plan、grant、controller、result normalization、manifest、cleanup、publication、restart recovery。
- revised agentic-browser route 的自动化真实 Chrome acceptance；现有 live smoke 仍偏旧 contract 且是手动 workflow。
- CLI/HTTP/Browser 结果归一化一致性 fixture。

### 4.5 P0 缺口：PQL 原生输入适配

当前 `testing-design` 接受通用 approved inputs，尚未识别 PQL snapshot/asset identity。应在 analyzer 外增加 adapter，消费：

```text
PQL ProjectPackSnapshot
+ approved TestCaseAsset set
+ approval/review/promotion receipts
→ testing-design approved input set
```

adapter 必须保持 pointer-only，并绑定：

- snapshot ID/digest。
- asset ID/version/digest。
- requirement refs。
- exact repository commit。
- approval subject 和 consumer purpose。

不要把 PQL 业务模型直接写入 analyzer 内部。

### 4.6 P1 缺口：Hosted ingestion projection

需要输出稳定、pointer-only 的 Hosted projection：

- projection ID、trace/dedup/idempotency keys。
- repository and exact commit。
- StructuredPlan ref/digest。
- CaseResultSet ref/digest。
- EvidenceManifest ref/digest。
- environment/cleanup receipts。
- aggregate report ref/digest。
- residual risks and defect publication refs。

Hosted 返回 digest-sensitive ingestion receipt：相同 key/相同 digest replay；相同 key/不同 digest fail closed。

### 4.7 P1 缺口：清理重复契约

将旧 `contract.testing_execution` 中可复用的 assertion 和 manifest 语义迁入 canonical modules，适配仍需保留的旧 runtime，然后删除：

- executor 私有结果 shape。
- publication 私有 validator。
- 重复 schema 和第三层 translation。

## 5. `fkst-hosted` 还缺什么

### 5.1 已有能力

`origin/feat/local-qa-runtime` 已有真实组件：

- Local QA Host loopback API 和 SQLite WAL acceptance/replay/events。
- Browser adapter：系统 Chrome 发现、临时 profile/download、独立 process group、deadline、kill/cleanup。
- framed Worker capability protocol。
- bounded atomic Evidence stager：size/digest、temp file、fsync、atomic rename。
- coordinator 和 execution-attempt claim 基础。
- generic NyxID client 和对象存储基础。

但这些 Local QA 路径尚未进入 `origin/main`，而且 production Host 没有把组件组装成真实 Run。

关键实现入口：

- [Local QA Host README](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/apps/local-qa-runtime/README.md)
- [Local QA contracts registry](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/packages/qa-contracts/contracts/registry.json)
- [Hosted router](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/backend/src/router.rs)
- [Local QA feature design](https://github.com/ChronoAIProject/fkst-hosted/blob/7df95034557ef751172b12e1cb5300e3565e311e/docs/local-qa-runtime/mvp/LOCAL-QA-HOST-DESIGN.zh-CN.md)

### 5.2 P0 缺口：Hosted Durable QA Run

需要建立云端权威 Run aggregate，持久化：

- Run ID、actor、tenant/project。
- exact Source、StructuredPlan、Environment/Profile digests。
- ProjectPackSnapshot / TestCaseAsset lineage。
- device、NyxID Node、Host installation binding。
- lifecycle state 和独立 execution/evidence/upload/cleanup/report/publication outcomes。
- trace/correlation/idempotency keys。
- ReportInputSet 和 RunSettlement refs。

当前 GitHub/Kubernetes session controller 不能代替 QA Run store；main 中的 in-memory claim 也不能作为 durable authority。

### 5.3 P0 缺口：业务授权和 NyxID dispatch

NyxID 不改代码。Hosted 需要实现自己的业务授权：

- Ed25519 或等价签名。
- 绑定 method、canonical path、body digest。
- Run、device、Node、Host installation、Profile。
- Source/Plan/Environment/Browser capability digests。
- issuer、audience、purpose、TTL、nonce、idempotency key。

然后通过现有 NyxID service slug / Node route 传输。必须区分：

- NyxID transport/approval success。
- Local QA Host authentication success。
- FKST Run admission success。

Node 离线或 binding 不匹配必须 fail closed，不能把 direct fallback 当作 QA 成功路径。

### 5.4 P0 缺口：真实 Local QA Host coordinator

feature Host 当前仍接受 inert request 并使用 fixed passing executor。需要接通：

```text
Admission commit
→ exact Source acquisition
→ workspace
→ Compose/readiness
→ Chrome adapter
→ Worker / testing-runner
→ canonical CaseResultSet
→ Evidence staging
→ exact cleanup
→ upload
```

要求：

- production Host 调用真实 Worker 和 `fkst-packages-testing` adapter。
- Event sequence 事务化分配，不能固定编号。
- cancel/timeout 在 effect 前持久化，并真正停止 worker、Chrome 和 services。
- executor error 必须进入 compensation/cleanup，不可悬挂。

### 5.5 P0 缺口：资源 ownership 和 restart recovery

Journal 需要增加：

- workspace、process tree、Chrome profile/download。
- Compose project/container/network/volume。
- ports、Evidence directories 和 sanitized staging。
- effect/resource intent、provider identity、stable key。
- cleanup attempts、residuals 和 receipts。

启动恢复必须：

- 先关闭 admission。
- 标记和处理 stranded execution attempts。
- 只对 exact matching ownership 执行 reconcile/cleanup。
- interrupted Browser Case 进入 `lost`/inconclusive，绝不自动重跑。

### 5.6 P1 缺口：Artifact、Quality 和 Report

需要新增完整云端交付链路：

```text
EvidenceManifest
→ per-object upload grant
→ sanitized upload
→ ArtifactIngestReceipt
→ immutable ReportInputSet
→ QualityEvaluation
→ deterministic ReportRecord
→ PublicationReceipt
→ RunSettlement
```

具体缺口：

- raw quarantine 和 sanitized boundary。
- redaction/media/size/schema/canary validation。
- stable object key + digest lost-ack reconcile。
- cleanup-before-upload。
- ReportInputSet completeness 和 `report_impossible` 权威。
- deterministic JSON/HTML/Markdown report。
- publication repair 不重跑本地测试。
- PQL feedback event 和 promotion receipt linkage。

### 5.7 P1 缺口：发布和运维

- 将 Local QA feature 收敛并合入 main，而不是长期停留在高度分叉 feature。
- signed/notarized macOS installer、pairing、credential rotation/revoke/reset、update/rollback/uninstall。
- failpoint matrix：admission、effect uncertainty、Chrome crash、Host crash、cleanup、upload lost ack、TTL expiry。
- Hosted/NyxID/Host/Worker/Artifact/Publication correlation 和 operator metrics。

## 6. 三个 repo 之间必须先冻结的契约

### 6.1 PQL → Testing Packages

`PQLTestingDesignInputSet`：

- snapshot ID/digest。
- repository ID/exact commit。
- approved asset refs：asset ID/version/digest/kind/media type。
- requirement refs。
- ReviewDecision / PromotionReceipt refs。
- consumer=`testing-design`，purpose=`test-design`。

### 6.2 Testing Packages → Hosted

`HostedQARunProjection`：

- projection ID 和 idempotency key。
- StructuredPlan ref/digest。
- CaseResultSet ref/digest。
- EvidenceManifest ref/digest。
- environment/cleanup receipts。
- aggregate report projection。
- asset and requirement lineage。

Hosted 返回 `HostedQARunIngestionReceipt`，必须 digest-sensitive replay。

### 6.3 Hosted → PQL

`HostedQualityFeedback`：

- event/report/run IDs。
- ProjectPackSnapshot 和 TestCaseAsset identities。
- Plan/CaseResult/Evidence/Quality/Report refs and digests。
- delivery cursor、event digest、retry/ack semantics。

PQL 返回 proposal/review/promotion refs，Hosted 可把最终 PromotionReceipt 记录到 RunSettlement，但 promotion 不阻塞当前测试报告生成。

## 7. 建议实施顺序

### 阶段 1：契约闭合

1. PQL 实现 ProjectPackSnapshot 和 TestCaseAsset。
2. Testing Packages 统一 Observation/AssertionResult/CaseResult/EvidenceManifest。
3. 三 repo 冻结 PQL input、Hosted projection、Quality feedback 三条边界。
4. 统一 canonical JSON、digest、strict schema、version negotiation、idempotency 和 replay 规则。

### 阶段 2：需求到可执行结果

1. PQL 产出 approved snapshot/asset set。
2. testing-design adapter 生成带 lineage 的 StructuredPlan。
3. testing-runner 完成 Browser canonical result 和 EvidenceManifest。
4. Hosted 实现 Durable Run、business authorization 和 NyxID dispatch。
5. Local QA Host 接通 Source、Compose、Chrome、Worker、Result 和 Cleanup。

### 阶段 3：结果到报告和资产反馈

1. Host 完成 sanitized Evidence upload。
2. Hosted 完成 Artifact ingestion、Quality、Report、Publication、Settlement。
3. Hosted 发送 Quality feedback 给 PQL。
4. PQL 生成 CoverageGap、Proposal、ReviewDecision 和 PromotionReceipt。
5. Promotion 更新下一版 ProjectPackSnapshot，不阻塞当前报告。

### 阶段 4：可靠性和发布

- durable browser recovery/no-rerun。
- duplicate、stale-base、tamper、lost-ack、partial failure 测试。
- macOS signed distribution 和 credential lifecycle。
- cross-repo conformance CI 和真实 NyxID Node E2E。

## 8. 最小可交付判定

不能只以“能启动 Chrome”或“能生成本地报告”判定完成。MVP 至少必须证明：

1. 一个 approved TestCaseAsset 可追溯到需求和 snapshot。
2. testing-design 生成 digest-bound StructuredPlan。
3. Hosted 创建并持久化 Run，签发绑定设备和输入摘要的授权。
4. 请求通过现有 NyxID Node 到达指定 Local QA Host。
5. Host 执行 Browser Case，testing-runner 产生 canonical AssertionResult/CaseResult。
6. success/failure/cancel/timeout/restart 都形成 CleanupReceipt，且不自动重跑不确定动作。
7. 只有 sanitized Evidence 上传并产生 ArtifactIngestReceipt。
8. Hosted 从 immutable ReportInputSet 生成 QualityEvaluation 和 ReportRecord。
9. 报告反馈能生成 PQL CoverageGap，并通过 Review/Promotion 更新下一版资产。
10. 相同 idempotency key/digest 全链路 replay；冲突 digest fail closed。
