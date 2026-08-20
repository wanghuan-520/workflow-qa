# fkst-hosted 云端补充领域缺口

> 状态：**Supplementary / Partially Superseded**
>
> Repo：[ChronoAIProject/fkst-hosted](https://github.com/ChronoAIProject/fkst-hosted)
>
> 最后边界校正：2026-08-20
>
> 本文保留 Hosted Artifact ingestion、Final Quality、Report、Publication 和 Settlement 的后续领域分析。它不是本轮四模块活动审计，也不再定义 Testing operational QARun、机器 placement、lease/fence 或 worker execution。
>
> 最新 Target 中：Talos 是 Testing Tool/QARun operational authority，详见 [talos 详细缺口](talos-gap-analysis.zh-CN.md)；PQL 产品侧运行投影见 [product-quality-loop 详细缺口](product-quality-loop-gap-analysis.zh-CN.md)；本机执行见 [local-qa-runtime 详细缺口](local-qa-runtime-gap-analysis.zh-CN.md)。
>
> 本文旧版依据了 Hosted-owned scheduler/direct NyxID dispatch 方案。涉及 Durable QARun、设备选择、QA scheduler、dispatch attempt 和 local event polling 的章节只保留为历史设计素材，不得作为最新 implementation target 或已交付事实。

## 0. 2026-08-20 fkst-hosted 全局边界校正

本轮同时核查了 `fkst-hosted develop@5af95163cbcdad5dcffac1cc17418bc5417ba98c` 和 `feat/local-qa-runtime@4b173897...`。结论是：`fkst-hosted` 已有可复用的 Hosted session/runtime 基础，但没有面向 Talos Testing 的 Hosted QA 控制面；Local QA feature branch 的 walking skeleton 不能外推为默认分支能力。

已具备且可复用：

- `SessionBackend`、Kubernetes/OpenSandbox lifecycle、execd transport、leader election、full resync/sweep、环境存储、对象存储和 bounded contract infrastructure。
- OpenSandbox 的 create guard、credential sentinel、补偿删除和 auth rejection probe，可作为隔离与恢复模式参考。

仍缺且不应归因给 Local QA app 单独解决：

- Hosted `Session/Job/Attempt/Artifact/Agent/Lease/RunSettlement/Publication` 公共 contracts、schema/version/content digest。
- durable Hosted run ledger、idempotent admission、attempt transition、settlement history 和可靠 job queue。当前 reconciler 的 bounded `mpsc::try_send` 在队列满时丢弃 hint，依赖 sweep/full resync，不能代替 durable Talos dispatch。
- Hosted Artifact grant/ingest/publication/quality/report contract；现有 `qa.local-evidence/v1` 明确是 `local-only:not-uploadable`，现有 chrono-storage session logs 也不等于 QA Artifact service。
- NyxID principal/agent/worker identity 的统一绑定；当前 Github user、webhook HMAC、storage service token 是三条边界，不能直接作为 QA Run authority。
- Talos adapter、Talos QARun/TestingTask/Attempt、worker placement/lease/fence 仍属于 Talos owning repo。

因此 Hosted 的正确方向是：使用 adapter 消费 Talos terminal refs、Testing Packages CaseResult/Evidence refs 和 Runtime Cleanup/Upload receipts，负责后续 Artifact ingestion、Quality、Report、Publication、Settlement；不要重新实现 Talos operational QARun 或把 GitHub session reconciler 当作 QA scheduler。

## 1. 最新 Target 下的 Hosted 职责

```text
Talos terminal refs + Runtime upload attempts
-> Artifact ingestion and receipts
-> immutable ReportInputSet
-> QualityEvaluation
-> ReportRecord
-> Publication
-> RunSettlement
-> optional Quality feedback to PQL
```

Hosted 应负责：

- sanitized Artifact bytes 的 per-object grant、digest/media/size validation、opaque refs 和 ingest receipts。
- 从 immutable inputs 计算 Final Quality。
- deterministic ReportRecord、publication effects 和 settlement/repair ledger。
- 在 delivery/report repair 时保持 execution facts 不变。

Hosted 不应负责：

- 创建或管理 Talos operational `QARun`。
- 选择 pool/machine、管理 lease/generation/fence 或调度 worker。
- 经 NyxID 直接调用 Local Runtime。
- 在云端执行 Browser Action。
- 让 NyxID 解释 QA Run 或决定 Pass/Fail。
- 复制 `testing-runner` 的 Assertion/CaseResult 逻辑。
- 在 Artifact/report/publication repair 时重跑本地测试。
- 直接修改 PQL TestCaseAsset；应通过 feedback/proposal/promotion contract。

## 2. 当前已经具备的可复用基础

### 2.1 通用控制面和身份基础

旧版审计记录（未按本轮固定 SHA 复核）指出：

- FKST control-plane 服务。
- auth/authz middleware。
- GitHub App/webhook/goal/session routes。
- worker placement、claim、reassign 和 fencing 基础。
- internal protocol 和 engine runner。
- metrics、health 和 OpenAPI。

这些能力可复用：

- stable ID 和 correlation。
- auth middleware。
- worker/device placement 思路。
- replay/fencing 思路。
- CAS/journal patterns。

但当前 claim authority 是 in-memory：

- 没有 durable lease store。
- 没有跨 pod atomic CAS。
- restart 依赖 worker self-report 重建 fence。

这不能直接作为 Durable QA Run authority。

证据：

- `backend/fkst-control-plane/src/controller/claims.rs`
- `backend/fkst-control-plane/src/controller/placement.rs`
- `backend/fkst-control-plane/src/controller/reassign.rs`

### 2.2 Generic NyxID client 已存在

旧版审计记录中的 shared client（未按本轮固定 SHA 复核）包含：

- generic `/api/v1/proxy/s/{slug}` 请求。
- forwarded user bearer。
- configurable service slug。
- buffered response。
- credential-safe error handling。
- NyxID status/body 透传。
- wiremock tests。

证据：

- `backend/fkst-shared/src/nyxid/mod.rs`

可以复用它建立 Local QA dispatch adapter。NyxID 不需要修改代码。

### 2.3 Generic storage 和 publication 基础

仓库不同 ref 中已有：

- generic object storage adapters。
- token cache 和 secret-safe error handling。
- GitHub publication/client。
- environment/session reconciliation。

这些可以作为 Artifact storage 和 publication adapter 的基础，但当前没有 QA-specific grant、receipt 和 ReportInputSet 语义。

### 2.4 Local QA feature 提供组件，但未形成云端链路

固定的 Local Runtime Baseline [`4b173897`](https://github.com/ChronoAIProject/fkst-hosted/commit/4b17389711fc420bfef56765d7d6af34e1702eb0) 已包含：

- `apps/local-qa-runtime`。
- `packages/qa-contracts` foundation/local lifecycle/local evidence/worker protocol。
- Local QA MVP 设计文档。

Hosted 云端仍没有调用这些组件形成 Durable QA Run。

## 3. 历史设计：Hosted-owned Durable QA Run（已被 Talos Target 取代）

> 本节的 aggregate/CAS/outbox 模式仍可供 Hosted settlement 参考，但 operational `QARun`、Snapshot、Events、Cancel 已迁到 Talos。不要在 Hosted 和 Talos 重复创建同名运行权威。

## 3.1 缺少 QA Run aggregate

需要新增云端权威对象，例如：

```text
QARun
  run_id
  tenant/project/actor
  source_ref/digest
  project_pack_snapshot_ref/digest
  structured_plan_ref/digest
  environment_profile_ref/digest
  execution_profile
  browser_capability_digest
  device_id
  nyxid_node_id
  host_installation_id
  local_state projection
  execution_outcome
  evidence_outcome
  upload_outcome
  cleanup_outcome
  quality_outcome
  report_outcome
  publication_outcome
  settlement_state
  trace/idempotency/correlation IDs
```

约束：

- cloud state 和 local state 分离。
- local terminal 不等于 Hosted settled。
- execution facts 一旦冻结，report/publication repair 不能修改。
- upload/report/publication outcomes 可在 local execution terminal 后继续推进。

## 3.2 缺少 durable persistence 和 CAS

当前 in-memory claims 不能满足：

- process/pod restart 后 Run 不丢失。
- 多副本并发调度。
- single-active device slot。
- exact attempt ownership。
- cancel/timeout 与 completion 的并发优先级。
- event cursor 和 settlement replay。

需要：

- Durable Run store。
- device slot/lease store。
- version/CAS。
- outbox/inbox。
- immutable Event sequence。
- idempotency table。
- repair queue。

### 验收标准

- Hosted restart 后 Run、slot、dispatch attempt 和 receipt projection 不丢失。
- 同一 device 同时只允许一个 execution-bearing Run。
- stale scheduler/worker 写入被 fence 拒绝。
- 相同 idempotency key/digest replay；冲突 digest 409/fail closed。

## 3.3 缺少输入冻结

当前 session dispatch 中存在 `git_ref = "HEAD"` 的动态源引用，不能用于 QA。

需要冻结：

- exact commit 或 synthetic merge object。
- ProjectPackSnapshot ref/digest。
- StructuredPlan ref/digest。
- Environment Profile ref/digest。
- execution Profile。
- Browser capability digest。
- package/runtime versions。
- policy/ruleset versions。

Run 接受后不能把 floating branch、latest image 或 mutable TestCaseAsset 解析为新内容。

## 4. 历史设计：Hosted-owned device/dispatch（已被 Talos Target 取代）

> machine/pool/worker identity、placement policy、lease/generation/fence 和 execution authorization 属于 Talos。Hosted 后续领域只需要验证来自 Talos/Runtime/Artifact plane 的稳定 refs、digests 和 receipts。

## 4.1 缺少 Device/Node/Host installation 模型

需要区分：

- FKST logical device。
- NyxID Node ID。
- Local QA Host installation ID。
- Host instance/version/capability digest。
- pairing epoch/credential epoch。

Node identity 只证明 NyxID transport endpoint；不能等同 Host installation identity。

需要存储：

- device ↔ node ↔ host installation binding。
- status、last seen、capabilities、supported profiles。
- single-active execution slot owner。
- binding revision/digest。

## 4.2 缺少 NyxID dispatch adapter

复用现有 `NyxIdClient::proxy_request`，新增 QA-specific adapter：

```text
submit_run
get_run
get_run_events
cancel_run
get_capabilities
```

adapter 必须：

- 使用专用 service slug。
- 将 Run 绑定到明确 Node/Device。
- 验证配置中的 service/node/host audience。
- 对 NyxID 4xx/5xx 和 Local Host application errors 分开编码。
- 不把 transport 200 当作 Run accepted。
- 支持 bounded retry，但不能在未知 acceptance 下重新执行有副作用 command。
- Artifact bytes 不通过 NyxID 长响应传输。

## 4.3 缺少 Hosted business authorization

NyxID transport auth 不能替代业务授权。Hosted 需要签发：

```text
LocalQARequestAuthorization
  issuer/key_id
  actor/caller
  operation
  method/path/body_digest
  run_id
  device_id
  nyxid_node_id
  host_installation_id
  execution_profile
  source_digest
  structured_plan_digest
  environment_profile_digest
  browser_capability_digest
  issued_at/not_before/expires_at
  nonce
  purpose
  idempotency_key
  signature
```

需要：

- key rotation/revocation。
- JCS canonical bytes 和 domain tag。
- nonce generation 和 expiry。
- audit correlation。
- Host verifier key distribution。

### 验收标准

- wrong device/node/installation/profile/digest 在本地任何副作用前拒绝。
- expired/revoked/unknown key 拒绝。
- NyxID request replay 不能绕过 Host authorization replay guard。
- Hosted 能区分 transport accepted 和 Host RunAcceptance。

## 5. 历史设计：Hosted-owned scheduler/reconcile（已被 Talos Target 取代）

> 本节中的 scheduler、slot reservation、submit/get/events/cancel 和 local Snapshot reconcile 应由 Talos gap 文档执行。Hosted 只保留 Artifact/Report/Publication delivery repair，不得通过 repair 创建新的 execution attempt。

## 5.1 缺少 QA scheduler

需要实现：

- capability/profile matching。
- device online/capacity check。
- execution slot reservation。
- authorization after reservation。
- dispatch attempt ledger。
- bounded retry/backoff。
- explicit offline/device_busy outcomes。

不能把 NyxID 的通用 failover 当作 QA scheduler。设备选择由 Hosted 完成。

## 5.2 缺少 Snapshot/Event reconcile

Hosted 需要：

- 保存 last event cursor/digest。
- at-least-once Event ingestion。
- duplicate event replay。
- same sequence/different digest integrity error。
- cursor expired → Snapshot resync。
- lost dispatch acknowledgement → 查询同一 Run。
- cancel ack 与 cleanup completion 分离。

## 5.3 缺少 recovery/repair workflow

需要独立 repair：

- dispatch repair。
- event sync repair。
- Artifact ingestion repair。
- report composition repair。
- publication repair。

任何 delivery/repair 都不能自动重跑 Browser Case。

## 6. P1：Artifact ingestion 缺口

## 6.1 缺少 per-object upload grant

Host 计算 post-redaction digest、media、size 后，向 Hosted 请求：

```text
ArtifactUploadGrant
  run_id
  object_key
  artifact_role
  digest
  media_type
  byte_size
  expiry
  allowed method/path
  idempotency key
```

要求：

- grant 不能列举其他 Run。
- 不能覆盖不同 digest。
- 不能读取 raw quarantine。
- 短 TTL、single object。

## 6.2 缺少 Artifact ingestion validator

云端需要验证：

- grant binding。
- digest/media/size。
- EvidenceManifest entry。
- run/case/assertion identity。
- redaction policy/version。
- artifact role allowlist。

产出：

- durable ArtifactPointer。
- `ArtifactUploadReceipt`。
- `ArtifactIngestReceipt`。

## 6.3 缺少 lost-ack reconcile

- stable object key + digest。
- 相同对象重试返回原 receipt。
- 同 object key 不同 digest conflict。
- bytes stored but response lost 时不能创建第二个 logical Artifact。
- TTL expiry 和 object retention 可解释。

## 7. P1：Quality 和 Report 缺口

## 7.1 缺少 immutable ReportInputSet

至少包含：

```text
RunSpec / frozen input refs
ProjectPackSnapshot / asset lineage
StructuredPlan
CaseResultSet
EvidenceManifest
ArtifactIngestReceipts
EnvironmentReceipt
CleanupReceipt
execution/evidence/upload/cleanup outcomes
ruleset/template versions
```

必须计算 input-set digest。报告只能消费这个 immutable set。

## 7.2 缺少 QualityEvaluation

Hosted 是 final Quality authority。需要输出：

- outcome：passed/failed/inconclusive/blocked 等闭合枚举。
- ruleset/version/digest。
- evidence sufficiency。
- coverage status。
- execution completeness。
- cleanup/upload effect on reportability。
- reasons/findings。
- source input-set digest。

runner 的 `product-defect` 只能作为输入信号，不能直接成为最终 Quality。

## 7.3 缺少 deterministic ReportRecord

需要：

- JSON 作为 canonical core。
- HTML/Markdown deterministic renderer。
- optional narrative 与 deterministic report 分离。
- ReportRecord 和 composition receipt。
- template/ruleset/generator versions。
- artifact links 和 access policy。
- report repair 不修改 execution facts。

## 7.4 `report_impossible` 权威

- Local Host 只能报告 upload outcome，例如 `upload_expired`。
- Hosted 根据 ReportInputSet 缺失和 policy 决定 `report_impossible`。
- report impossible 不能重新打开 local execution。

## 8. P1：Publication 和 Settlement 缺口

## 8.1 PublicationPlan/Receipt

需要支持：

- FKST UI。
- GitHub check/comment/issue。
- PQL quality feedback。

每个 effect 需要：

- stable dedup key。
- request digest。
- provider attempt。
- receipt/remote identity。
- lost response reconciliation。

## 8.2 RunSettlement

RunSettlement 固定：

- execution facts。
- Artifact set。
- QualityEvaluation。
- ReportRecord。
- publication outcomes。
- PQL feedback/promotion refs。
- residual/repair backlog。

Settlement 后不能修改 execution/evidence truth；只能追加 repair receipts 或 superseding report/publication record。

## 9. P1：PQL 和 Testing Packages 集成缺口

### 9.1 消费 Testing Packages projection

Hosted 应只消费稳定投影：

- StructuredPlan ref/digest。
- CaseResultSet ref/digest。
- EvidenceManifest ref/digest。
- environment/cleanup receipts。
- trace/dedup/idempotency identity。

不应读取 Testing Packages 内部 Lua artifact 结构或 GitHub comment shape。

### 9.2 发送 HostedQualityFeedback

发送给 PQL：

- run/report/event IDs。
- snapshot/asset identities。
- plan/result/evidence/quality/report refs/digests。
- cursor/delivery digest。
- retry/ack semantics。

PQL promotion 是当前报告之后的异步反馈闭环，不阻塞 ReportRecord。

## 10. P2：安全、运维和发布缺口

- Hosted authorization signing key lifecycle。
- per-tenant/device quotas。
- device revocation。
- audit correlation：Hosted/NyxID/Host/Worker/Artifact/Publication。
- redacted logs。
- metrics：queue、dispatch、device busy、event lag、artifact lag、report lag、repair backlog。
- failure injection。
- multi-pod durability。
- disaster recovery。
- Local QA feature 合入 main 的发布策略。

## 11. 建议实施顺序

### H1：Durable Run 和 contract

1. QARun aggregate/store/events/outbox。
2. frozen input contract。
3. Device/Node/Host binding。
4. business authorization。
5. Testing Packages projection ingestion。

### H2：Dispatch 和 local reconcile

1. QA NyxID adapter。
2. scheduler/slot reservation。
3. submit/get/events/cancel。
4. cursor/Snapshot reconcile。
5. repair queues。

### H3：Artifact 和 Report

1. upload grant。
2. Artifact ingestion/receipt。
3. ReportInputSet。
4. QualityEvaluation。
5. ReportRecord。

### H4：Publication 和 feedback

1. GitHub/FKST publication adapters。
2. PQL feedback delivery。
3. RunSettlement。
4. repair/reconcile。

### H5：production hardening

1. key/device lifecycle。
2. failure injection。
3. observability。
4. multi-pod/restart tests。
5. main branch release。

## 12. 完成标准

Hosted 后续领域完成时应满足：

- 只消费 Talos QARun、Testing Packages result/evidence 和 Runtime cleanup/upload 的稳定 refs/digests/receipts，不重复拥有 operational QARun。
- per-object Artifact grant 和 ingestion 在 restart/multi-pod 下可重放并验证 digest/media/size。
- bytes stored/ack lost 不重复创建 logical object。
- Quality 和 Report 可从同一 immutable `ReportInputSet` 重放。
- execution、evidence、upload、cleanup、quality、report、publication outcomes 可独立解释。
- Artifact/report/publication/feedback repair 不创建新的 Talos attempt，也不重跑本地测试。
- RunSettlement 固定 execution facts 和 Artifact set；后续只能追加 repair receipt 或 superseding report/publication record。
