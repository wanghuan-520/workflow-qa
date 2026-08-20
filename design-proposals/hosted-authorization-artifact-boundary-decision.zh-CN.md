# Hosted Authorization 与 MVP ArtifactStore 边界决策

> 状态：**Proposed / Decision pending**
>
> 日期：2026-08-20
>
> 决策范围：Browser-only Talos Testing MVP 的业务授权和 sanitized Evidence 交付
>
> 关联 Roadmap：[PQL Testing 跨仓实施 Roadmap](../ROADMAP.zh-CN.md)

## 1. 决策状态

本文是供 owning repo maintainers 接受或否决的正式决策提案，不是已经接受的 ADR。在 maintainer 通过 ADR、Decision Issue 或等价记录确认前：

- `fkst-hosted` 只是 Hosted Authorization Authority 和 MVP ArtifactStore 的 **proposed owning repo**。
- Authorization 和最小 ArtifactStore 只是 Browser MVP 的 **proposed dependency**，不得描述为已冻结的 Active implementation target。
- Talos、Local QA Runtime 和 PQL 可以冻结自己的接口需求与 negative fixtures，但不得据此假定 Hosted owner、storage provider 或 production endpoint 已确定。
- 若本提案被拒绝，Roadmap 和全部 Gap 文档必须在实施前改为被接受的 owner 和边界。

## 2. 待解决的问题

Talos 在 exact attempt reservation 后需要一个独立于调度权威的业务授权，Local QA Runtime 产生的 sanitized Evidence 也需要稳定、digest-bound、可对账的远端引用。当前设计尚未正式确定：

- 哪个 repo 拥有 `LocalQARequestAuthorization` 的签发、重放、吊销和 verifier key lifecycle。
- 哪个 repo 拥有 Artifact `prepare/commit/lookup`、grant、receipt、retention 和 lost-ack reconcile。
- 是否复用已有 object storage，以及复用的是 storage adapter/provider 还是现有 session-log 领域语义。
- Runtime、Talos、Authorization Authority 和 ArtifactStore 之间如何认证，才能避免 raw lease token、worker token 或 storage credential 越界。

## 3. 提议决策

### 3.1 Owning repo

提议由 `ChronoAIProject/fkst-hosted` 承载两个相互隔离的 Hosted domain：

| Domain | Proposed owner | 拥有 | 不拥有 |
| --- | --- | --- | --- |
| Hosted Authorization Authority | `fkst-hosted` | operation-specific `LocalQARequestAuthorization`、issue/replay/conflict、signing key、rotation/revocation、nonce/expiry、verifier key distribution | `QARun`、placement、lease/generation/fence、Talos current claim、raw lease token |
| Hosted MVP ArtifactStore | `fkst-hosted` | per-object grant、`prepare/commit/lookup`、digest/media/size validation、opaque pointer、upload/ingest receipt、retention/expiry、lost-ack reconcile | Case/Assertion 语义、Talos terminal state、raw local quarantine、本机 Cleanup |

Talos 继续拥有 `QARun`、`TestingTask`、`TestingAttempt`、placement、lease、generation、fence、cancel control 和 current-claim authority。Local QA Runtime 继续拥有本机 admission、effect、Evidence staging、Journal 和 Cleanup。Testing Packages 继续拥有 Case/Assertion/EvidenceManifest 语义。

### 3.2 Object storage

提议复用 `fkst-hosted` 已有 object-storage adapter/provider 基础，而不是新建一套 bytes backend。复用仅限 storage mechanism；现有 session log、environment object 或通用 URI 不能直接等同于 QA Artifact domain。

Hosted MVP ArtifactStore 必须在 storage provider 之上增加 QA-specific contract：

- `prepare` 校验 run/attempt/object identity、digest、media、size、role 和 policy，并签发单对象、短 TTL 的 upload grant。
- Runtime 使用 grant 将已经 sanitized、validated 的 bytes 直接上传到被允许的 object key；grant 不允许 list、cross-run read 或覆盖不同 digest。
- `commit` 验证 provider object identity、digest、media、size 和 EvidenceManifest binding，生成 immutable pointer 与 receipt。
- `lookup` 按 stable object key、digest 和 idempotency identity 返回原 pointer/receipt，用于 bytes stored/ack lost 收敛。
- ArtifactStore 拥有 retention/expiry/deletion policy 与 provider reconciliation；Runtime 只报告本次 upload outcome，不决定云端 retention。

具体 provider、bucket layout、KMS 和 retention duration 属于接受该决策时必须补齐的实施参数；在这些参数冻结前不得宣称 production ArtifactStore 已确定。

### 3.3 Runtime 与 Hosted 的认证边界

提议的 start/cancel/reconcile 链路为：

```text
Talos exact attempt reservation
-> Talos 请求 Hosted issue/replay operation-specific authorization
-> TestingExecutor 原样投影 signed authorization
-> Runtime 验证 local transport credential
   + Hosted signature/revocation/nonce/request tuple
   + Talos signed current claim/fence
```

约束：

- Hosted business authorization 与 Talos current claim 必须同时有效，任一不可验证时在新的本地 effect 前 fail closed。
- raw `lease_token`、worker token、Hosted signing key 和 provider-wide storage credential 不进入 Runtime request、Journal、Event、Artifact 或日志。
- Runtime 不直连 Talos public Tool API；current-claim verification 通过 bounded resolver/claim contract 完成。
- Artifact upload 使用单对象 grant，绑定 run/task/attempt、object key、digest、media、size、method/path 和 expiry；它不能替代 Runtime start/cancel/reconcile authorization。
- Artifact outage 不重新打开 execution，也不触发新的 TestingAttempt；Runtime/Talos 以独立 `upload_outcome` 和 lost-ack repair 收敛。

## 4. 接受 Gate

本决策变为 `Accepted` 前，至少需要 owning repo maintainers 确认：

1. `fkst-hosted` 是否接受两个 proposed domain；若拆到独立 repo，明确替代 owner 和迁移责任。
2. object-storage provider/adapter 的复用范围、production deployment owner、bucket/object-key isolation 和 KMS 边界。
3. Authorization 与 Artifact contract 的 schema owner、major version、canonicalization/digest profile 和 golden fixtures。
4. `prepare/commit/lookup`、receipt、retention、expiry、deletion 和 lost-ack reconcile 的 durable store/CAS 语义。
5. Runtime local credential、Hosted signature、Talos current claim 和 per-object grant 的独立验证与 fail-closed 测试。
6. Talos、Runtime、Hosted producer/consumer conformance gate 和真实 canary rollout owner。

接受结果必须记录在本文件状态、对应 Decision Issue/ADR 链接和 Roadmap `MVP-H` 状态中。只有三者一致后，Gap 文档才能把该边界从 `Proposed` 改为 `Active`。

## 5. 备选方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| Talos 同时拥有 business authorization 和 Artifact bytes | 不推荐 | 会把调度/current-claim authority 与业务许可、bytes authority 合并，扩大 Talos blast radius |
| Local QA Runtime 自签 authorization 并长期保存 Artifact | 不推荐 | 无法提供独立业务许可，且设备离线、lost-ack、retention 和跨消费者读取无法由本机权威收敛 |
| 新建独立 Hosted service/repo | 可接受替代 | 边界可以成立，但必须先确定 deployment、identity、storage 和运维 owner；当前没有已接受记录 |
| 首个 MVP 仅保留 local-only Evidence | 可用于更小 execution slice | 不能满足稳定 Evidence ref/receipt 的完整 Browser MVP 退出标准，必须明确降级 MVP 定义 |
