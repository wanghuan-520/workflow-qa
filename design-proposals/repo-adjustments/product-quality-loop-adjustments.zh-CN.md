# product-quality-loop Repo 调整方案：测试资产治理与 Hosted 质量反馈

> **状态：** 目标调整方案（Draft for Review）
>
> **固定基线：** `YueZh127/product-quality-loop@e540127388981c0d3e3249f7a43aa569350abb5b`
>
> **审计日期：** 2026-08-14
>
> **范围：** 本文定义 PQL 对齐 Talos 有界 Testing Tool 和 Hosted QA 所需的 Repo 调整。本文不表示 proposed schema、adapter 或 Hosted feedback 链路已经实现。

关联文档：

- [Talos 有界 Testing Tool 总体设计](../talos-bounded-testing-tool-architecture.zh-CN.md)
- [fkst-hosted / Local QA Runtime 调整方案](fkst-hosted-local-qa-runtime-adjustments.zh-CN.md)
- [fkst-packages-testing 调整方案](fkst-packages-testing-adjustments.zh-CN.md)
- [跨 Repo 缺口总结](../../cross-repo-gap-analysis.zh-CN.md)

---

## 1. 文档状态、固定基线与证据边界

### 1.1 固定远端基线

本方案以远端 `main` 固定提交为实现事实：

- Commit：[`e540127388981c0d3e3249f7a43aa569350abb5b`](https://github.com/YueZh127/product-quality-loop/commit/e540127388981c0d3e3249f7a43aa569350abb5b)
- 时间：2026-08-12T17:34:06Z
- 主题：`feat(pql): assess canonical host quality outcomes`
- PR：[#50](https://github.com/YueZh127/product-quality-loop/pull/50)

本地 checkout 的 `main=fe5864d`、`origin/main=376d0b7` 均落后，不作为本方案事实基线。

### 1.2 证据等级

| 标记 | 含义 |
| --- | --- |
| Baseline | 固定远端 SHA 中存在 |
| Formal-but-local | 已有 strict contract/builder，但未接真实 Hosted/Talos |
| Legacy runnable | 当前仍可执行的 Project Pack/planner/executor/report/Host 路径 |
| Proposed | 本方案建议新增的 schema/module/adapter |
| Deprecated target | consumer/canary Gate 通过后才删除 |

### 1.3 当前双轨结论

PQL 当前同时存在：

1. **Legacy runnable path**：YAML Project Pack、本地 planner/direct executor、HTTP/process/browser case、本地 report、FKST downstream Host、heartbeat/watcher 和本地 state。
2. **Formal contract path**：formal ProjectPack artifact、deterministic TestSelection、canonical digest、coverage gap、PQLFeedback v3 和 AssetProposal/review 基础。

两条路径尚未收敛：

- 没有独立不可变 `ProjectPackSnapshot`；
- 没有独立 `TestCaseAsset` 版本对象；
- 没有 `ReviewDecision`、`PromotionReceipt` 和 append-only lifecycle ledger；
- formal selection 未绑定 Snapshot 和逐项 Asset ref/digest；
- 没有 `pql.testing-design-input-set.v1`；
- 没有 Talos/Hosted Testing Tool adapter；
- 没有 `HostedQualityFeedback` ingestion/cursor/checkpoint；
- direct executor、local report、custom Host 和 formal contracts 并存。

---

## 2. 目标角色、唯一权威与非目标

### 2.1 调整后角色

PQL 负责：

- Project Pack 和产品知识；
- requirement/product map/journey/risk；
- changed-file/PR impact classification；
- deterministic TestSelection；
- ProjectPackSnapshot；
- TestCaseAsset version/lifecycle；
- CoverageGap；
- AssetChangeProposal；
- ReviewDecision；
- PromotionReceipt；
- HostedQualityFeedback ingestion；
- 产品策略、测试资产和治理 handoff。

### 2.2 唯一权威

| 事实 | 调整后权威 |
| --- | --- |
| Project Pack snapshot / governed test asset | PQL |
| TestSelection | PQL |
| final StructuredPlan | Testing Packages |
| machine/task/lease/fence | Talos |
| local execution/resource/cleanup | Local QA Runtime |
| Case Pass/Fail | Testing Packages |
| Final Quality/Report/Settlement | Hosted |
| transport identity/route/audit | NyxID |

### 2.3 非目标

PQL 不应：

- 选择 machine/device/pool；
- 签发运行授权；
- 管理 lease/generation/fence；
- checkout/build/启动被测服务；
- 直接调用 Local Runtime loopback；
- 生成最终 StructuredPlan；
- 保存完整 task/runtime ledger；
- 计算最终执行 Quality；
- 直接上传 Artifact bytes；
- 因 Hosted/Talos 不可用而自动 fallback 到 direct executor；
- 同一 logical Run 同时走 legacy 和 Talos 路径；
- 自动 promotion 测试资产。

---

## 3. 当前实现地图

| 范围 | 固定基线已有 | 目标差距 |
| --- | --- | --- |
| Project Pack | legacy `project.yml` 和 formal ProjectPack artifact | 缺不可变 Snapshot |
| TestSelection | stable sort、canonical digest、coverage/lifecycle filter | 未绑定 Snapshot/Asset refs |
| Test assets | case/spec/compiler/registry、design/review 基础 | 缺独立 immutable Asset 和 receipt-driven lifecycle |
| Planner | `test_planner.py` 本地生成执行计划 | PQL 只应表达 product-level selection |
| Executor | `test_executor.py`、`real_case.py`、HTTP/process/browser | 应由 Talos/Hosted adapter 替代 |
| Coverage | `coverage_review.py`、gap/report | 尚未消费 Hosted feedback |
| Asset governance | `test_asset_design.py`、`asset_proposal.py` | 缺 decision/promotion/append-only ledger |
| Feedback | PQLFeedback v3 builder、binding/dedupe | 缺 Hosted feedback event/cursor/checkpoint |
| Reporting | local JSON/Markdown、Quality Assessment、Release Gate | 与 Hosted Final Quality authority 冲突 |
| FKST | downstream Host、heartbeat、feedback consumer | execution 和 governance 仍混合 |
| Onboarding | read-only discovery、安全 case、disabled native commands | 缺 Snapshot/Asset lifecycle output |
| Scheduler | heartbeat/watcher local watermark/retry | durable execution scheduling 应迁 Hosted/Talos |
| Talos | 无 adapter/contract | 未接 `talos.testing.*` |

### 3.1 关键 baseline 路径

```text
skills/product-quality-loop/scripts/project_pack_selection.py
skills/product-quality-loop/scripts/test_planner.py
skills/product-quality-loop/scripts/test_executor.py
skills/product-quality-loop/scripts/real_case.py
skills/product-quality-loop/scripts/coverage_review.py
skills/product-quality-loop/scripts/test_asset_design.py
skills/product-quality-loop/scripts/asset_proposal.py
skills/product-quality-loop/scripts/feedback_builder.py
skills/product-quality-loop/scripts/project_onboarding.py
skills/product-quality-loop/scripts/report_writer.py
skills/product-quality-loop/scripts/fkst_handoff.py
skills/product-quality-loop/scripts/pql.py
skills/product-quality-loop/scripts/run_pql_skill.py
skills/product-quality-loop/scripts/pql_heartbeat.py
skills/product-quality-loop/scripts/pql_pr_watcher.py
fkst/testing-host/
```

---

## 4. 保留与复用

### 4.1 Project Pack 与 TestSelection

保留：

- formal Project Pack loader/artifact；
- changed-file classification；
- Product Map；
- Requirement/Journey/Risk；
- coverage policy；
- regression strategy；
- deterministic selection；
- stable sorting；
- canonical digest；
- lifecycle filtering；
- coverage gap。

### 4.2 测试资产能力

保留：

- `case_compiler.py`；
- `case_registry.py`；
- `test_asset_design.py`；
- `asset_proposal.py`；
- risk/coverage/execution review；
- candidate/design_only/reviewed/approved/executable/regression/deprecated 语义基础；
- onboarding 的 read-only discovery 和 disabled candidate policy。

### 4.3 Feedback 和治理

保留：

- `feedback_builder.py` 的 structured classification；
- source/run binding；
- dedupe；
- no-findings semantics；
- `fkst_handoff.py` 的治理意图；
- coverage/report projection；
- tracking issue 默认 dry-run 和不修改产品仓库边界。

但这些模块要消费 Hosted refs/receipts，而不是本地重新判执行和 Final Quality。

---

## 5. P0：资产身份、输入合同和 Tool 接入

### 5.1 先修复固定基线缺陷

进入跨 Repo 集成前，先把当前基线中的发布和验证缺陷作为独立 P0 修复：

1. `.github/workflows/ci.yml` 当前监听 `dev`，但仓库默认分支是 `main`；默认分支 push/PR 因此没有该 workflow 保护；
2. `fkst.workspace.toml` 固定的 Testing Packages 提交为 `58783c61ff628f11cc802a3137e20dcb0f4ef28a`，比本方案采用的 `dev@ac953ff0...` 落后 175 commits；
3. `codex/aevatar-workflow-vnext-e2e@bb36264df860547616e29d4ee6f9e2699713773e` 比 `main` 领先 11 commits，但尚未合并，不能作为发布实现事实；
4. README 仍把过渡性的 `docs/fkst-integration.md` 当完整集成合同，而该文档自身已声明被后续设计取代；
5. 当前 formal run intent 固定：

```text
host_intake_mode = generic-reference-fixture
production_intake = false
```

在 production contract 冻结前，不得把 formal-but-local fixture 描述为已接入 Talos/Hosted。

P0 基线修复要求：

- CI 明确覆盖实际受保护默认分支和 PR；
- Testing Packages pin 升级到经过兼容验证的 exact commit；
- vNext 分支先 rebase/re-audit，再按独立 PR 合并；
- README、集成文档和 schema 对 production/non-production 状态使用一致措辞；
- 固定 dependency lock、Python runtime 和可重复安装方式。

### 5.2 `ProjectPackSnapshot`

新增 **proposed**：

```text
skills/product-quality-loop/schemas/pql-project-pack-snapshot.schema.json
skills/product-quality-loop/scripts/project_pack_snapshot.py
```

`ProjectPackSnapshot` 是一次 selection 和后续 QA Run 使用的不可变产品知识输入，至少包含：

```text
schema_version
snapshot_id
project_id
project_pack_version
source_repository
source_exact_revision
included_paths
product_map_ref/digest
requirement_set_ref/digest
journey_set_ref/digest
risk_policy_ref/digest
quality_gate_ref/digest
asset_index_ref/digest
created_at
producer/version
content_digest
```

规则：

- Snapshot 生成后不可原地修改；
- 同 `snapshot_id` 同 digest 可以 replay；
- 同 `snapshot_id` 不同 digest 必须冲突；
- selection、proposal、feedback 和 promotion 都必须引用 exact Snapshot；
- 不能用当前工作树、floating branch、最新 Project Pack 或本地路径替代 Snapshot identity；
- Snapshot 中只保存 ref/digest 和 bounded metadata，不内联 credential、browser state 或大文件。

### 5.3 `TestCaseAsset` 与 append-only lifecycle

新增 **proposed**：

```text
skills/product-quality-loop/schemas/pql-test-case-asset.schema.json
skills/product-quality-loop/schemas/pql-asset-lifecycle-event.schema.json
skills/product-quality-loop/schemas/pql-review-decision.schema.json
skills/product-quality-loop/schemas/pql-promotion-receipt.schema.json
skills/product-quality-loop/scripts/asset_ledger.py
skills/product-quality-loop/scripts/asset_lifecycle.py
```

`TestCaseAsset` 至少绑定：

```text
asset_id
asset_version
asset_digest
project_id
snapshot_id
requirement_refs
journey_refs
risk_refs
case_kind
spec_ref/digest
asset_version_state
review_verdict
execution_eligibility
lifecycle_ledger_head_ref/digest
producer/version
created_at
supersedes_ref
```

现有 `candidate/design_only/reviewed/approved/executable/regression/deprecated` 混合了三个不同维度。目标合同必须拆成闭合枚举：

```text
asset_version_state = candidate | published | superseded | deprecated
review_verdict = pending | approved | rejected | revoked
execution_eligibility = design_only | blocked | executable | regression
```

唯一可执行 predicate：

```text
asset_version_state == published
AND review_verdict == approved
AND execution_eligibility IN {executable, regression}
AND PromotionReceipt binds the current version/digest/ledger head
```

状态变化只由 append-only event 驱动。`rejected`、`revoked`、`deprecated`、stale review 和缺 promotion 都有可表示且 fail-closed 的结果，不再使用未定义的 `unreviewed/unpromoted` 字符串作为 wire value。

治理 receipt 约束：

- `ReviewDecision` 记录 decision ID、authenticated reviewer subject/org、authorized role/scope、issuer/key ID、verdict、reviewed asset ref/digest、policy ref/digest、timestamp、nonce、bounded reason 和 canonical signature；
- `PromotionReceipt` 记录 promotion ID、authenticated actor subject/org、authorized role/scope、issuer/key ID、source state/version/digest/ledger head、target state/eligibility、policy ref/digest、timestamp、nonce 和 canonical signature；
- policy 必须定义 reviewer/promoter separation-of-duties、key rotation/revocation 和 revoked decision 对 eligibility 的影响；
- stale base、不同 digest、重复但不等价 decision、wrong project/org/role 全部拒绝；
- promotion 不修改旧对象，而是追加 lifecycle event 并产生新 version/receipt；
- agent、feedback 或测试失败只能创建 proposal，不能自动 review/promotion；
- deprecated/superseded/rejected/revoked asset 仍保留历史和反馈可追溯性。

### 5.4 Snapshot/Asset-bound TestSelection

修改现有 selection path：

```text
skills/product-quality-loop/scripts/project_pack_selection.py
skills/product-quality-loop/scripts/test_planner.py
skills/product-quality-loop/scripts/case_registry.py
```

`TestSelection` 必须绑定：

- exact `ProjectPackSnapshot` ref/digest；
- 每个 `TestCaseAsset` 的 ID/version/digest、三个状态维度、ledger head、ReviewDecision ref/digest 和 PromotionReceipt ref/digest；
- exact source revision；
- changed-file/PR input ref/digest；
- policy/ruleset ref/digest；
- selected/skipped/blocked reason；
- stable ordering 和 canonical selection digest。

以下输入不得进入 executable selection：

- `asset_version_state != published` 的 Asset；
- `review_verdict != approved`，包括 pending/rejected/revoked；
- `execution_eligibility` 不在 executable/regression；
- 缺失、过期、撤销、wrong-project/wrong-org 或未绑定当前 version/digest/ledger head 的 ReviewDecision/PromotionReceipt；
- asset version 相同但 digest 不同；
- Snapshot 不包含的 Asset；
- floating source ref；
- 缺 requirement/journey/risk provenance 的 executable Asset；
- local-only draft 未形成 immutable asset identity。

### 5.5 `pql.testing-design-input-set.v1`

新增 **proposed**：

```text
skills/product-quality-loop/schemas/pql-testing-design-input-set.schema.json
skills/product-quality-loop/scripts/testing_design_input.py
```

输出只包含 Testing Packages analyzer 所需的 approved refs：

```text
schema_version = pql.testing-design-input-set.v1
input_set_id
project_pack_snapshot_ref/digest
test_selection_ref/digest
selected_assets[]:
  asset_ref/digest
  asset_version_state
  review_verdict
  execution_eligibility
  lifecycle_ledger_head_ref/digest
  review_decision_ref/digest
  promotion_receipt_ref/digest
requirement_refs[]
journey_refs[]
risk_refs[]
source_exact_revision
approval_subject/org/purpose
producer/version
created_at
content_digest
```

不包含：

- machine/pool/profile selection；
- Talos task、lease、generation 或 fence；
- Runtime path、port、process 或 browser handle；
- raw test credential；
- 最终 StructuredPlan；
- Final Quality/Report。

PQL 生成 input set；Testing Packages adapter 必须验证每个 selected asset 的 Asset → ledger head → ReviewDecision → PromotionReceipt 完整链、签名/actor/policy/revocation 和 exact ref/digest，再映射 approved-input seam；Testing analyzer core 不解释 PQL lifecycle。缺任一治理 proof 时零 StructuredPlan 输出。

### 5.6 `TestingToolClient`

新增 provider-neutral client interface，建议路径：

```text
skills/product-quality-loop/scripts/testing_tool_client.py
```

逻辑操作只能是：

```text
get_capabilities()
submit(SubmitTestingRunRequest)
get(run_id)
events(run_id, opaque_cursor, limit)
cancel(CancelTestingRunRequest)
```

该 client 调用 Talos 服务中由 owner-controlled OpenAPI 暴露的有界 Testing Tool family。`talos.testing.*` 和 operationId 目前只是 proposed logical names；R0 在 Talos OpenAPI 正式发布 method/path/schema 前，PQL 不得硬编码 URL 或生成 production client。NyxID 会按最终 operation 投影为多个 agent tool；PQL 不应把五个状态操作压进一个同步长请求。

请求合同：

```text
SubmitTestingRunRequest:
  run_id
  idempotency_key
  request_ref/digest
  display_metadata

CancelTestingRunRequest:
  run_id
  idempotency_key
  optional bounded reason
```

幂等 scope 固定为 `(verified caller org, operation, run_id, idempotency_key)`；canonical request/cancel digest 必须进入 wire schema。same scope/key/digest replay 原 acceptance/CancelAck，same scope/key 不同 digest 返回稳定 `idempotency_conflict`。最终 OpenAPI 必须明确 key 位于 body 还是 `Idempotency-Key` header，不能同时支持两个未定义优先级的 carrier。

Client 约束：

- 只接收 immutable ref/digest 和 bounded display metadata；
- transport identity 由注入的 authenticated client/context 提供；
- 不调用 Talos worker claim/heartbeat/result API；
- 不选择 pool/machine，不解释 lease/fence；
- 不直连 Local Runtime loopback；
- 不因 Tool 不可用自动 fallback 到 `test_executor.py`；
- 不把 `Talos task completed` 解释为 Case passed 或 QARun settled；
- submit/get/events/cancel 的 transport error 与 application error 分层。

### 5.7 Credential isolation

当前 `credential_resolver.py` 可以：

- 读取 credential file；
- 读取 access token env/file；
- 调用 `nyxid login` 刷新；
- 把 credential material 注入本地 executor。

这不适合作为 Talos/Hosted service path。目标要求：

- PQL service mode 永不接收、刷新、保存或回显 NyxID bearer token；
- PQL request 只传 service refs、credential placement policy 或 opaque authorization refs；
- 下游 GitHub/产品 API 调用由 NyxID server-side proxy 或 node-local credential injection 完成；
- Talos task body、PQL artifacts、selection、feedback、log 和 error 不含 credential bytes；
- CLI legacy local mode 若暂时保留，必须显式标记 compatibility-only，且与 production service mode 使用不同 entrypoint/config；
- 每个 agent/service 使用独立 NyxID identity，不能共享一个通用 bearer 破坏审计隔离。

---

## 6. P1：Hosted 反馈和治理闭环

### 6.1 `hosted.quality-feedback/v1`

PQL 只消费 Hosted 已冻结的 pointer-only feedback：

```text
schema_version
feedback_event_id
cursor
dedup_key
qa_run_ref/digest
project_pack_snapshot_ref/digest
test_case_asset_refs/digests
structured_plan_ref/digest
case_result_set_ref/digest
evidence_manifest_ref/digest
quality_evaluation_ref/digest
report_record_ref/digest
coverage_signal
asset_change_seed
created_at
content_digest
```

禁止消费：

- raw Evidence；
- Local Runtime path/log；
- Talos lease/worker token；
- browser cookie/profile；
- 未 settlement 的可变 report projection；
- 未经 Hosted attribution 的自由文本 failure。

### 6.2 Feedback ingestion pipeline

修改：

```text
skills/product-quality-loop/scripts/feedback_builder.py
skills/product-quality-loop/scripts/coverage_review.py
skills/product-quality-loop/scripts/asset_proposal.py
skills/product-quality-loop/scripts/fkst_handoff.py
```

固定顺序：

```text
validate schema/ref/digest/provenance
→ verify cursor and dedup key
→ append immutable feedback event
→ derive CoverageGap / AssetChangeProposal
→ persist proposal refs
→ advance checkpoint atomically
→ return pql.feedback-ingestion-receipt.v1
```

`pql.feedback-ingestion-receipt.v1` 至少包含：

- accepted/replayed/rejected；
- feedback event/cursor/digest；
- generated CoverageGap/Proposal refs；
- previous/new checkpoint；
- bounded validation error；
- ingestion time。

规则：

- same event/cursor/digest replay 不产生 duplicate proposal；
- same event/cursor 不同 digest fail closed；
- checkpoint 必须在所有 append/derive 持久化成功后推进；
- out-of-order event 进入 repair/hold，不猜测丢弃；
- feedback repair 不重新触发 Talos task 或本地测试；
- no-findings 也是显式反馈事实，不能被解释成反馈缺失。

### 6.3 CoverageGap 和 AssetChangeProposal

复用现有 coverage 和 proposal 模块，但输出必须绑定：

- source feedback event；
- QARun/Report/Quality refs；
- ProjectPackSnapshot；
- affected Asset versions；
- requirement/journey/risk attribution；
- proposal policy/version；
- confidence/limitations；
- producer/version/digest。

PQL 只提出：

- add/update/deprecate asset；
- adjust coverage mapping；
- request human review；
- mark product knowledge gap。

不得自动：

- 修改产品代码；
- merge PR；
- promotion Asset；
- 重跑不确定 action；
- 覆盖 Hosted Final Quality。

### 6.4 本地 report 和 release gate 降级

现有 JSON/Markdown report、Quality Assessment 和 Release Gate 可以保留为：

- local diagnostic projection；
- compatibility export；
- dry-run planning output；
- Hosted ReportRecord 的只读展示 adapter。

它们不再是：

- Final Quality authority；
- QARun settlement；
- Artifact completeness authority；
- Talos task terminal state；
- release decision 的唯一系统记录。

同一 frozen Hosted ReportInputSet 的 PQL projection 必须可重复；PQL 不得重新读取 raw local files 计算另一份不同结论。

---

## 7. P2：兼容路径清理和运维

### 7.1 Direct execution 清理

以下模块先标记 compatibility path：

```text
skills/product-quality-loop/scripts/test_executor.py
skills/product-quality-loop/scripts/real_case.py
skills/product-quality-loop/scripts/test_planner.py  # execution-oriented parts
fkst/testing-host/
scripts/fkst-testing-host.sh
```

目标状态：

- PQL planner 只产生 product-level selection/input set；
- final StructuredPlan 由 Testing Packages 生成；
- execution 只通过 Talos Testing Tool → Local Runtime → Testing Packages；
- local executor 只用于 isolated unit/conformance fixture；
- 同一 logical Run 只能选择 legacy 或新路径，禁止 dual execution。

### 7.2 Heartbeat/watcher 清理

当前 heartbeat/watch-merged 的 watermark、retry 和本地状态不适合作为 multi-tenant durable scheduler。

迁移后：

- merged PR、nightly 和 heartbeat trigger 只创建 Hosted/Talos Testing Tool intent；
- durable schedule、task retry、cancel、lease 和 execution repair 由 Hosted/Talos owning modules 处理；
- PQL 只保存 product-specific selection/feedback cursor；
- watcher replay 必须使用 stable source event/idempotency key；
- watcher 不能在 Tool 超时后自行 direct execute。

### 7.3 Packaging、tenant 和 observability

增加：

- installable/locked Python package；
- exact PQL engine version/digest；
- project-pack/snapshot/asset schema compatibility matrix；
- task-scoped state root，不使用跨 tenant 的共享 `.pql` mutable state；
- per-project/org quota 和 bounded input/output；
- run/snapshot/selection/feedback/proposal correlation；
- secret-free structured logs；
- deprecation telemetry 和 consumer inventory。

### 7.4 Contract evolution

P0/P1 完成后再扩展：

- 多 Project Pack composition；
- cross-repo requirement graph；
- API/performance/mobile/security asset kinds；
- feedback aggregation 和 trend；
- policy-driven proposal prioritization。

所有扩展继续复用 immutable Snapshot/Asset/lifecycle/feedback 合同，不重新引入 direct execution authority。

---

## 8. Proposed contracts and interfaces

### 8.1 PQL-owned contracts

```text
pql.project-pack-snapshot/v1
pql.test-case-asset/v1
pql.asset-lifecycle-event/v1
pql.review-decision/v1
pql.promotion-receipt/v1
pql.test-selection/v1
pql.testing-design-input-set.v1
pql.feedback-ingestion-receipt/v1
```

### 8.2 Consumed contracts

```text
talos.testing-tool-request/v1
hosted.quality-feedback/v1
testing-case-result-set.v2
testing-evidence-manifest.v1
```

PQL 只消费 `hosted.quality-feedback/v1` 及其中列出的 opaque refs，不直接消费 Talos/Runtime → Hosted 的 terminal handoff contract 或 `hosted.talos-terminal-handoff-receipt/v1`。PQL 只验证和保存治理所需 projection/ref，不复制 Testing、Runtime、Talos 或 Hosted domain implementation。

### 8.3 `TestingToolClient`

```text
get_capabilities() -> bounded capability/version matrix
submit(SubmitTestingRunRequest) -> RunAcceptance
get(run_id) -> bounded QARun snapshot
events(run_id, opaque_cursor, limit) -> EventPage
cancel(CancelTestingRunRequest) -> CancelAck
```

Talos task ID 只能作为 opaque correlation；PQL 不基于 generic task findings/status 生成 Quality。`EventPage` 必须使用 opaque exclusive cursor，包含 `events[]`、`next_cursor`、`has_more` 和 bounded truncation metadata；PQL 不解析 `after_sequence` 或依赖 Talos internal sequence。invalid/stale/expired cursor 使用稳定 application error code。

### 8.4 Canonicalization

PQL-owned 持久对象统一：

- strict schema、`additionalProperties: false` 和 unknown-major fail closed；
- RFC 8785/JCS canonical JSON；
- lowercase `sha256:<64 hex>`；
- bounded strings/arrays/depth/payload；
- stable sort 和 digest-sensitive replay；
- timestamp 不参与需要 deterministic 的选择 projection，除非明确排除在 digest 外。

跨 Repo imported refs 按 owner registry 的 exact major/profile 验证：已发布 Testing majors 继续使用其 baseline canonicalization/裸 64-hex，新 major 才可切换 JCS/prefix。每个 ref 必须携带 `contract_id`、major、`canonicalization_profile` 和 digest encoding，PQL 不得静默重写外部 payload。

---

## 9. 删除、降级与废弃计划

### 9.1 立即标记为非 production authority

- local Final Quality/report；
- direct executor；
- local FKST Host；
- heartbeat/watcher execution retry；
- credential file/token resolver；
- `.pql` shared mutable scheduler state；
- `generic-reference-fixture` intake；
- unmerged vNext branch 中未进入 `main` 的能力。

### 9.2 新链路稳定后废弃

```text
direct product test execution
PQL-owned execution plan finalization
local QARun/task ledger
local artifact completeness decision
local release-settlement authority
nyxid login/token refresh in service mode
duplicate feedback/report translations
```

### 9.3 删除 Gate

只有满足以下条件才删除：

- Talos Testing Tool canary 稳定；
- Talos operational QARun 与 Hosted Artifact/Quality/Report downstream state 均可恢复；
- PQL Snapshot/Asset/feedback E2E 通过；
- legacy/new output equivalence fixture 通过；
- no dual execution telemetry 通过；
- known consumer inventory 完成；
- rollback 演练完成；
- 至少一个明确 deprecation window。

### 9.4 永久保留

- Project Pack/product knowledge；
- deterministic selection；
- stable canonical digest；
- coverage gap；
- asset design/review/promotion；
- explicit human governance；
- dry-run/no-product-repo-mutation 默认值；
- feedback provenance/dedup/cursor。

---

## 10. 跨 Repo 依赖与实施顺序

### 10.1 外部依赖

| 依赖 | Owner | PQL 需要什么 |
| --- | --- | --- |
| Talos Testing Tool facade | Talos/Hosted | capabilities、submit/get/events/cancel、RunAcceptance、bounded errors |
| Talos task/worker | Talos | 只作为 opaque execution projection，不向 PQL 暴露 lease/token |
| StructuredPlan/canonical result | Testing Packages | stable input adapter、CaseResultSet/EvidenceManifest refs |
| Local execution | Local QA Runtime | execution/delivery/cleanup facts 通过 Hosted projection 返回 |
| QARun/Quality/Report | Hosted | immutable run/report/feedback refs 和 settlement |
| identity/approval/audit | NyxID | 注入 authenticated client/context，不向 PQL 传 bearer |

Talos owning repo 还需要实现 `testing` task discriminator、TestingExecutor、atomic claim/capacity、stale-attempt fencing、running deadline、cancel acknowledgement、Artifact provenance、capability attestation 和 real-machine E2E。这些不属于 PQL 工作包。

### 10.2 实施顺序

```text
1. 修复 CI/default branch、Testing Packages pin 和 baseline 文档
2. 冻结 Snapshot/Asset/lifecycle/digest contracts
3. 完成 Snapshot-bound TestSelection 和 pql.testing-design-input-set.v1
4. 冻结 Talos Testing Tool/Hosted QA client contract
5. 接入 TestingToolClient，保持 legacy path feature-flagged
6. 接入 hosted.quality-feedback/v1 和 checkpoint ledger
7. 完成 CoverageGap/Proposal/Review/Promotion 闭环
8. 运行 canary merged-PR loop
9. consumer inventory、rollback、telemetry
10. 逐步废弃 direct execution/local report authority
```

### 10.3 可并行与不可并行

可并行：

- Snapshot/Asset schema 与 Testing Packages PQL adapter；
- feedback schema 与 Hosted Quality/Report contract；
- packaging/CI 修复与 lifecycle ledger。

不可并行发布：

- Snapshot identity 未冻结前启用 production selection；
- Testing Tool client 未冻结前删除 local compatibility path；
- Hosted feedback receipt 未冻结前推进 cursor；
- human review/promotion Gate 未完成前自动应用 proposal；
- no-dual-execution Gate 未通过前同时启用 legacy/new executor。

---

## 11. 验收门槛

### G0 Baseline Gate

- `main` push/PR CI 实际触发；
- FKST pin 指向经过验证的 exact commit；
- vNext branch 未合并能力不写成 baseline；
- dependency/runtime 可重复安装；
- README/集成文档/schema 的 production 状态一致。

### G1 Snapshot/Asset Contract Gate

- strict unknown field/major；
- JCS/digest golden vectors；
- same ID/same digest replay；
- same ID/different digest conflict；
- stale-base promotion rejection；
- authenticated reviewer/promoter subject/org/role/scope、issuer/key ID、signature、nonce、purpose 和 policy binding；
- revoked key/decision、wrong project/org/role、separation-of-duties violation 拒绝；
- 三个正交状态维度及 allowed-transition/eligibility table 全覆盖；
- append-only ledger replay/recovery；
- old version/history 不可被原地覆盖。

### G2 Selection Gate

- selection 绑定 exact Snapshot 和 Asset refs/digests；
- stable sort/digest；
- version state、review verdict、execution eligibility 不满足唯一 predicate 的 Asset 不进入 executable selection；
- 每个 selected asset 的 ledger head、ReviewDecision、PromotionReceipt 完整且绑定当前 version/digest；
- missing/stale/rejected/revoked/wrong-project governance proof 拒绝；
- changed-file/requirement/journey/risk provenance 完整；
- same logical input 产生相同 selection digest。

### G3 Tool Client Gate

- 只使用 capabilities/submit/get/events/cancel；
- 不调用 worker/lease API；
- 不选择 machine/pool；
- 不直连 Runtime；
- Tool 不可用时无 silent fallback；
- submit/cancel scope-key-digest replay 与 conflict 语义通过；
- repeated cancel、same key different reason/digest 和 wrong caller org 被覆盖；
- opaque EventPage cursor 的 first/next/stale/expired/limit/truncation case 通过；
- `Talos completed` 不推断 Quality；
- transport/application error 正确分层。

### G4 Credential Gate

- service path 零 token file/env read；
- 不执行 `nyxid login`；
- task/artifact/log/error 无 NyxID bearer/downstream secret；
- credential placement 只传 refs/policy；
- audit 可区分 caller/agent/service identity。

### G5 Feedback Gate

- provenance/ref/digest 校验；
- cursor/dedup replay；
- same event different digest 拒绝；
- checkpoint crash recovery；
- duplicate delivery 不产生 duplicate proposal；
- no-findings 显式保存；
- feedback repair 不触发测试重跑。

### G6 Governance Gate

- proposal 不能自动 promotion；
- review decision 绑定 exact asset version/digest；
- stale review/promotion CAS 冲突；
- deprecated history 可追溯；
- product repo 默认零修改；
- dry-run tracking issue 保持默认。

### G7 End-to-End Gate

```text
approved ProjectPackSnapshot/TestCaseAsset
→ deterministic TestSelection
→ pql.testing-design-input-set.v1
→ Talos Testing Tool
→ Local Runtime / Testing Packages
→ Hosted Quality/Report/Settlement
→ hosted.quality-feedback/v1
→ PQL CoverageGap/AssetChangeProposal
→ human ReviewDecision/PromotionReceipt
```

覆盖 pass、fail、blocked、cancel、lost/inconclusive、upload pending/expired、cleanup residual、duplicate feedback 和 out-of-order cursor。

---

## 12. 风险与开放决策

1. `ProjectPackSnapshot` 和 `TestCaseAsset` 的持久化/发布位置。
2. PQL contract registry 与 Testing/Hosted registry 的发布和 compatibility ownership。
3. 当前 lifecycle vocabulary 是否需要拆分 review state 与 execution eligibility。
4. promotion signing/actor identity 和 revocation。
5. private repository/source materialization 如何只传 ref，不把 GitHub credential 交给 worker/PQL。
6. `credential_resolver.py` legacy CLI 的保留期限。
7. PQL `main` 与 vNext branch 的合并顺序和 re-audit 范围。
8. Testing Packages pin 升级后的 breaking contract migration。
9. watcher/heartbeat trigger 的 durable event source 和 idempotency key。
10. Hosted feedback retention、cursor compaction 和 reprocessing policy。
11. local report/export 的 consumer inventory。
12. 首发是否仅支持 Aevatar Project Pack，还是同时冻结通用多项目约束。

---

## 13. 永久证据链接

### 13.1 固定基线

- [固定提交](https://github.com/YueZh127/product-quality-loop/commit/e540127388981c0d3e3249f7a43aa569350abb5b)
- [PR #50](https://github.com/YueZh127/product-quality-loop/pull/50)
- [vNext 未合并分支](https://github.com/YueZh127/product-quality-loop/tree/codex/aevatar-workflow-vnext-e2e)

### 13.2 当前入口和缺陷证据

- [README](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/README.md)
- [当前 CI branch 配置](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/.github/workflows/ci.yml#L3-L7)
- [FKST workspace pin](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/fkst.workspace.toml#L11-L26)
- [Formal run intent](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/skills/product-quality-loop/schemas/pql-qa-run-intent.schema.json)
- [Credential resolver](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/skills/product-quality-loop/scripts/credential_resolver.py)

### 13.3 可复用模块

- [Selection](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/skills/product-quality-loop/scripts/project_pack_selection.py)
- [Case compiler](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/skills/product-quality-loop/scripts/case_compiler.py)
- [Case registry](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/skills/product-quality-loop/scripts/case_registry.py)
- [Asset design](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/skills/product-quality-loop/scripts/test_asset_design.py)
- [Asset proposal](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/skills/product-quality-loop/scripts/asset_proposal.py)
- [Feedback builder](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/skills/product-quality-loop/scripts/feedback_builder.py)
- [FKST handoff](https://github.com/YueZh127/product-quality-loop/blob/e540127388981c0d3e3249f7a43aa569350abb5b/skills/product-quality-loop/scripts/fkst_handoff.py)

### 13.4 本仓库参考

- [总体 Talos Testing Tool 设计](../talos-bounded-testing-tool-architecture.zh-CN.md)
- [跨 Repo 缺口总结](../../cross-repo-gap-analysis.zh-CN.md)
- [Testing Packages 调整方案](fkst-packages-testing-adjustments.zh-CN.md)
- [Hosted/Local Runtime 调整方案](fkst-hosted-local-qa-runtime-adjustments.zh-CN.md)

本次审计为只读仓库分析，未运行 product-quality-loop test suite。本文中的 P0/P1/P2 和 Gate 是后续实施要求，不表示当前已经通过。
