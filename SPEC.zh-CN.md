# FKST Host → NyxID → 用户本地自动化 QA 实现规范

> **文档状态：** 目标实现规范，尚未表示完整系统已经实现。  
> **适用版本：** v1，macOS-first Local QA Runtime。  
> **最后校准日期：** 2026-07-25。  
> **配套设计：** [DESIGN.zh-CN.md](./DESIGN.zh-CN.md)。  
> **架构图：** [SVG](./fkst-host-nyxid-local-qa-flow.svg) / [Mermaid](./fkst-host-nyxid-local-qa-flow.mmd)。  
> **评审依据：** [FKST-NyxID-Local-QA-Architecture-Review.md](./FKST-NyxID-Local-QA-Architecture-Review.md)。  
> **已验证 POC：** [NyxID-Local-Chrome-Minimal-Loop-Validation.md](./NyxID-Local-Chrome-Minimal-Loop-Validation.md)。

---

## 0. 规范语言、证据边界与阅读方式

本文中的规范词含义如下：

| 中文 | RFC 风格 | 含义 |
|---|---|---|
| **必须** | **MUST** | 实现不满足即视为不符合本规范。 |
| **禁止** | **MUST NOT** | 实现出现该行为即视为不符合本规范。 |
| **应该** | **SHOULD** | 除非有记录充分的例外理由，否则必须满足。 |
| **不应该** | **SHOULD NOT** | 除非有记录充分的例外理由，否则不得采用。 |
| **可以** | **MAY** | 可选能力，不影响基础合规性。 |

本文只把以下链路视为已被 POC 证明：

```text
NyxID Cloud
→ NyxID Node
→ 已经运行的本地 Runtime
→ 系统 Google Chrome
→ 浏览器交互与 DOM 断言
→ 截图和结构化结果
→ NyxID Node
→ 调用方
```

POC **没有**证明双阶段授权、隔离 Workspace、真实 App/Middleware 生命周期、补偿式 Cleanup、Runtime 自动安装、断线恢复、质量裁决、Artifact 上传、GitHub 发布或 PQL 学习闭环。上述能力均属于本规范要求的待实现和待验收范围。

本文不继承历史规范中的云端 OSB QA Sandbox、固定 2 CPU/4Gi、单个 unrestricted Codex step、Issue Comment 状态总线、浏览器 E2E 不可行、所有失败直接创建产品 Issue、独立 testing repository 等假设。

---

## 1. 范围、目标与锁定决策

### 1.1 目标

系统必须允许 `fkst-hosted` 创建可恢复的 QA Run，经用户批准后，通过可替换的设备传输通道在用户电脑上的 Local QA Sandbox 中执行自动化测试，并把结构化结果、Evidence、Cleanup Receipt、质量裁决和发布结果回传到云端。

### 1.2 锁定决策

1. **代码组织。** 实现必须位于 `fkst-hosted` monorepo。`apps/hosted-control-plane` 与 `apps/local-qa-runtime` 必须独立构建、签名、部署和升级；testing modules 必须位于 `packages/`，且 packages 禁止依赖任何 `apps/` 实现。
2. **执行位置。** Local QA Sandbox 必须位于用户电脑。PR 代码、依赖、Shell、浏览器、被测服务和 Agent Action 禁止在 NyxID 或 hosted control plane 内执行。
3. **源码版本。** PR Run 默认必须生成并记录固定的 synthetic merge commit；非 PR Run 必须使用 exact commit SHA。
4. **授权签发。** Execution Grant 必须由 `fkst-hosted` 内独立的 Authorization Authority Module 签发。NyxID 提供用户批准证明、设备证明、审计和传输，但禁止作为 Grant 签发权威。
5. **Runtime v1。** Local QA Runtime v1 必须是 macOS-first 的签名 Daemon，并由 `launchd` 管理。
6. **NyxID 边界。** NyxID 禁止执行测试、启动浏览器、Checkout 代码、安装依赖、运行 Shell、判断 Pass/Fail 或生成最终 Quality Outcome。
7. **测试裁决。** `testing-runner` 必须根据结构化 assertion 决定每个 Case 的 Pass/Fail。Backend 或 Codex 的自然语言自报结论禁止成为测试判定依据。
8. **计划变更。** 已批准 Plan 必须不可变。任何超出 `ActionEnvelope` 的动作必须通过 `PlanAmendment` 生成新版本并重新审批。
9. **Cleanup。** Cleanup 必须是补偿阶段，从成功、失败、取消、超时、失联和 Runtime 恢复路径触发，禁止依赖正常执行链成功。
10. **发布输入。** Publication 必须只消费 `QualityEvaluation` 和经授权的 Artifact Pointer，禁止直接根据 Backend 输出或原始日志创建产品 Issue。

### 1.3 非目标

- 本规范不要求 v1 支持 Linux 或 Windows Runtime。
- 本规范不锁定 Local QA Sandbox 的最终 Container/VM Provider，但要求其满足本文安全接口。
- 本规范不锁定 Artifact Store 供应商和默认保留期；它们必须由策略配置决定。
- 本规范不要求 NyxID 成为唯一传输实现；本机 CLI、企业 Device Agent 或其他自托管通道可以实现同一 transport-neutral Runtime 协议。
- 本规范不允许 PQL 直接调度 Runtime、签发 Grant 或发布产品缺陷。

---

## 2. 系统不变量与权威边界

| 事项 | 唯一权威 | 约束 |
|---|---|---|
| Run 持久状态与状态迁移 | hosted workflow | Runtime 事件只能请求迁移，不能自行改写云端终态。 |
| RunDraft | hosted workflow | Source 尚未成功获取时只能持久化 Draft，禁止提前冻结 RunSpec。 |
| SourceAcquisition / SourceRevision | hosted source resolver | Resolver 必须冻结可重放对象；Runtime 必须验证 checkout 后的 `effective_sha`、对象 digest 和 resolver 绑定。 |
| 用户批准与设备证明 | NyxID 或其他 Approval Provider | 证明必须被 hosted Authorization Authority 验签和消费。 |
| Design/Execution Grant | hosted Authorization Authority | 私钥禁止进入 NyxID Node 或 Local Runtime。 |
| Structured Plan | testing-design | 一旦进入审批即不可原地修改。 |
| Step Pass/Fail | testing-runner | Backend 只返回观察结果和 Artifact。 |
| Sandbox 生命周期 | local Runtime + EnvironmentFactory | hosted 只能发命令和消费 Receipt。 |
| CleanupCapability | Local Runtime cleanup authority | Capability 必须在本地创建、最小授权并独立于 Execution Grant 过期；hosted 只能持有 digest-bound reference。 |
| CredentialLease | Local SecretBroker | Secret 值和 lease material 禁止进入 hosted、NyxID、Plan、Grant 或普通事件。 |
| Final Quality Outcome | quality-evaluation | Publication 禁止自行推导质量结论。 |
| GitHub/PQL 副作用 | test-publication adapters | 所有副作用必须带稳定 dedup key。 |
| PQL Review Decision | PQL review authority | Review 必须是不可变 Decision，不得原地修改 Proposal 状态。 |
| Project Pack Promotion | PQL promotion authority | 只有 PromotionReceipt 可以使已批准资产进入新的可执行 Project Pack。 |

以下边界必须成立：

```text
Approval Provider 证明“谁批准、批准哪台设备、何时批准”
Authorization Authority 决定“批准证明是否足以签发哪种 Grant”
Local Runtime 验证“Grant 是否允许本机执行这个 Plan”
Local PEP 决定“当前动作是否同时满足 Plan、Policy、Grant、Fence 与本地能力约束”
testing-runner 判断“结构化断言是否通过”
quality-evaluation 判断“整个 Run 对产品质量意味着什么”
PQL review/promotion authorities 决定“提案是否获批并进入哪个不可变 Project Pack”
```

---

## 3. 公共契约规则

### 3.1 公共元数据

所有跨 module、跨进程或跨设备持久化对象必须包含以下字段：

```ts
type ISO8601 = string;
type Sha256 = `sha256:${string}`;
type UUID = string;

type ContractMeta = {
  schema_version: string;       // 例如 "qa.runspec/v1"
  content_digest: Sha256;       // canonical payload 的摘要
  run_id: UUID;
  created_at: ISO8601;
  producer_version: string;     // semver 或不可变 build id
  correlation_id?: string;
};
```

### 3.2 Canonical Serialization

1. `content_digest` 必须基于移除 `content_digest` 字段后的 canonical JSON 计算；若对象含签名字段，还必须移除该签名字段。
2. Canonical JSON 必须使用 UTF-8、对象 key 字典序、无无意义空白、数字最短十进制表示、数组保持原顺序。
3. `undefined`、`NaN`、`Infinity`、循环引用和未声明扩展字段必须拒绝序列化。
4. 接收方必须先校验 schema，再校验 digest；任一失败均禁止执行副作用。
5. 二进制 Artifact 的 digest 必须基于原始字节，不得基于 base64 文本。

### 3.3 兼容规则

- `schema_version` 必须使用 `<domain>/<major>` 或 `<domain>/v<major>` 的稳定格式。
- 同一 major 内可以新增 optional 字段；禁止改变既有字段语义、类型或枚举含义。
- 未知 optional 字段应该保留并透传，除非处于安全边界；安全边界必须 fail closed。
- 未知 enum 值必须产生 `contract.unsupported_enum`，禁止静默映射到默认值。
- 不支持的 major 版本必须产生 `contract.unsupported_version`。
- Grant、ApprovalEvidence、PolicyDecision、ActionEnvelope、RuntimeCommand、RuntimeEvent、CleanupCapability 和 CredentialLease 禁止使用“忽略未知字段”的宽松解析。

### 3.4 通用标识

```ts
type ResourceRef = {
  kind: string;
  id: string;
  digest?: Sha256;
  version?: string;
};

type ActorRef = {
  type: "user" | "service" | "device" | "module";
  id: string;
  display_name?: string;
};

type DigestBoundRef<TSchema extends string = string> = {
  kind: string;
  id: string;
  schema_version: TSchema;
  content_digest: Sha256;
  version?: string;
};

type LeaseFence = {
  generation: number;          // 从 1 开始，每次 owner 接管时递增
  fencing_token: string;       // 不透明、不可预测；只比较相等性
};

type ExecutionFence = {
  hosted_workflow: LeaseFence;
  local_execution: LeaseFence;
  runtime_instance_id: string;
};

type RuntimeCursor = {
  generation: number;          // 必须等于 ExecutionFence.local_execution.generation
  sequence: number;            // local generation 内从 1 开始严格递增
};

type SignatureBlock = {
  algorithm: "ed25519" | "es256";
  key_id: string;
  value: string;               // base64url，无 padding
};
```

`DigestBoundRef` 用于所有安全或状态转换绑定；`ResourceRef` 只可用于非权威展示、诊断或兼容数据。接收方禁止仅按 `id` 解析 `DigestBoundRef`，解析结果的 `schema_version` 和 `content_digest` 必须完全匹配。

### 3.5 Strict Discriminated Union

本文标记为 strict union 的类型必须使用判别字段选择唯一 variant，并满足：

1. 未知 discriminator 必须返回 `contract.invalid_variant`，并在安全 details 中记录 `reason=unknown_discriminator`。
2. 缺少该 variant 的 required 字段必须返回 `contract.invalid_variant`，并记录 `reason=missing_required_field`。
3. 出现其他 variant 专属字段必须返回 `contract.forbidden_field`，并记录 `reason=mixed_variant_fields`。
4. 出现 schema 未声明字段必须返回 `contract.forbidden_field`，并记录 `reason=unknown_field`；安全边界禁止沿用 §3.3 的 optional 字段透传规则。
5. validator 必须先选择 variant，再执行该 variant 的 exact-object 校验；禁止把多个 variant 做字段并集后宽松解析。

本文的 `SourceAcquisition`、`ApprovalEvidence`、`GrantClaims`、`EvidenceRequirement`、`RuntimeCommand`、`RuntimeEvent` 和 `QualityEvaluation` 均为 strict union。

### 3.6 Canonical Signing Payload

签名对象必须先按 §3.2 计算 payload 自身的 `content_digest`，再签名。签名字节必须是以下对象的 canonical JSON UTF-8 bytes，禁止签名 pretty JSON、base64 文本、仅 digest 字符串或传输层 envelope：

```ts
type CanonicalSigningPayload<T> = {
  domain: "fkst.qa.signature/v1";
  purpose: "approval_evidence" | "grant" | "cleanup_capability" | "credential_receipt";
  key_id: string;
  payload: T;                  // 完整 payload，包含已校验的 content_digest，不含 SignatureBlock
};
```

签名验证方必须重建该对象并验证 `key_id`、`purpose`、payload schema、payload digest 和签名。任何字段缺失、额外字段、Unicode 非规范输入或 digest 不一致均必须拒绝。

---

## 4. `RunDraft`、`SourceAcquisition`、`SourceRevision` 与 `RunSpec`

### 4.1 RunDraft

```ts
type RunDraft = ContractMeta & {
  draft_id: string;
  draft_version: number;
  trigger: {
    type: "pull_request" | "manual" | "api" | "scheduled" | "rerun";
    actor: ActorRef;
    parent_run_id?: UUID;
  };
  source_request:
    | { kind: "pull_request"; provider: "github"; owner: string; name: string; number: number }
    | { kind: "revision"; provider: "github"; owner: string; name: string; revision_hint: string };
  project: {
    project_id: string;
    profile_id: string;
    profile_digest: Sha256;
    pql_project_pack?: DigestBoundRef<"qa.pql-project-pack/v1">;
  };
  requested_scope: {
    suites?: string[];
    case_ids?: string[];
    paths?: string[];
    tags?: string[];
    max_duration_seconds: number;
  };
  target_device: {
    selector: { type: "device_id"; value: string } | { type: "capability"; value: string };
    required_capabilities: string[];
    platform: "macos";
  };
  policy: DigestBoundRef<"qa.policy/v1">;
  publication_intent: {
    github_check: boolean;
    pr_comment: boolean;
    product_issue: "disabled" | "quality_gate_only";
    pql_feedback: boolean;
  };
};
```

`RunDraft` 每个版本不可变，但在 Source 获取成功前可以创建新 draft version。Draft 禁止被 Authorization Authority、Runtime 或 testing-design 当作可执行输入。

### 4.2 SourceRevision

```ts
type SourceObject = {
  object_ref: DigestBoundRef<"qa.source-object/v1">;
  object_digest: Sha256;            // Git bundle/pack 或等价不可变对象的原始字节 digest
  object_format: "git_bundle" | "git_pack" | "content_addressed_snapshot";
  retention: {
    policy_id: string;
    retain_until: ISO8601;
    audit_hold: boolean;
  };
  resolver: {
    id: "hosted-source-resolver";
    version: string;
    resolved_at: ISO8601;
  };
};

type SourceRevision =
  | {
      kind: "pull_request";
      repository: {
        provider: "github";
        owner: string;
        name: string;
        repository_id: string;
      };
      pull_request: {
        number: number;
        base_sha: string;
        head_sha: string;
        head_repository?: string;
        is_fork: boolean;
      };
      resolution: {
        strategy: "synthetic_merge_commit";
        effective_sha: string;
        merge_tree_digest: Sha256;
        created_by: "hosted-source-resolver";
        resolver_version: string;
        created_at: ISO8601;
      };
      source_object: SourceObject;
    }
  | {
      kind: "commit";
      repository: {
        provider: "github";
        owner: string;
        name: string;
        repository_id: string;
      };
      resolution: {
        strategy: "exact_commit";
        effective_sha: string;
      };
      source_object: SourceObject;
    };
```

PR Run 必须满足：

- `effective_sha` 必须指向 hosted source resolver 生成并持久记录的 synthetic merge commit。
- synthetic merge 必须由固定的 `base_sha` 和 `head_sha` 生成；禁止在执行时重新解析浮动分支。
- hosted source resolver 必须通过不可变的受控 ref、Git bundle 或等价对象存储保存 synthetic commit 及其可达对象，保留时间至少覆盖 Run、重试、审计和 Artifact retention policy 要求。
- Local Runtime 必须从受控来源获取该对象并校验 `effective_sha`、`merge_tree_digest` 和 `source_object.object_digest`；禁止在设备端重新生成另一个 synthetic merge。
- merge conflict 必须在授权前产生 `SourceAcquisition(kind="blocked")`，reason code 为 `source.merge_conflict`，不得回退为只测 head SHA。
- GitHub 临时 merge ref 可以用于对照，但禁止作为唯一可重放依据。

非 PR Run 必须满足：

- `effective_sha` 必须是 exact commit SHA。
- branch、tag 或默认分支名称只可作为输入提示，必须在 SourceAcquisition 时解析并冻结为 SHA。

`clone_url`、repository web URL、用户输入的 remote URL 和 Git 配置均不是授权来源。Source resolver 和 Local Runtime 只能通过受信任的 repository identity 映射、`SourceObject.object_ref`、显式 transport policy 和短期 `CredentialLease` 获取源码；任何 URL 最多作为非权威显示信息。

### 4.3 SourceAcquisition

```ts
type SourceAcquisition =
  | (ContractMeta & {
      kind: "acquired";
      acquisition_id: string;
      run_draft_ref: DigestBoundRef<"qa.run-draft/v1">;
      source_revision: SourceRevision;
      acquired_at: ISO8601;
      resolver_attestation_digest: Sha256;
    })
  | (ContractMeta & {
      kind: "blocked";
      acquisition_id: string;
      run_draft_ref: DigestBoundRef<"qa.run-draft/v1">;
      reason_code: "source.merge_conflict" | "source.policy_blocked" | "source.revision_not_found";
      observed_refs: ResourceRef[];
      blocked_at: ISO8601;
    })
  | (ContractMeta & {
      kind: "failed";
      acquisition_id: string;
      run_draft_ref: DigestBoundRef<"qa.run-draft/v1">;
      error: ErrorEnvelope;
      retryable: boolean;
      failed_at: ISO8601;
    });
```

只有 `kind="acquired"` 的 `SourceAcquisition` 可以用于冻结 `RunSpec`。`blocked` 表示输入或策略确定性阻断，`failed` 表示获取过程失败；两者均必须进入 non-executed QualityEvaluation，禁止伪造空 `SourceRevision`。

### 4.4 RunSpec

```ts
type RunSpec = ContractMeta & {
  run_draft_ref: DigestBoundRef<"qa.run-draft/v1">;
  source_acquisition_ref: DigestBoundRef<"qa.source-acquisition/v1">;
  source: SourceRevision;
  project: {
    project_id: string;
    profile_id: string;
    profile_digest: Sha256;
    pql_project_pack?: DigestBoundRef<"qa.pql-project-pack/v1">;
  };
  requested_scope: {
    suites?: string[];
    case_ids?: string[];
    paths?: string[];
    tags?: string[];
    max_duration_seconds: number;
  };
  target_device: {
    selector: { type: "device_id"; value: string } | { type: "capability"; value: string };
    required_capabilities: string[];
    platform: "macos";
  };
  policy: DigestBoundRef<"qa.policy/v1">;
  publication_intent: {
    github_check: boolean;
    pr_comment: boolean;
    product_issue: "disabled" | "quality_gate_only";
    pql_feedback: boolean;
  };
};
```

`RunSpec` 必须在 SourceAcquisition 成功后一次性冻结。冻结时必须验证 `run_draft_ref`、`source_acquisition_ref`、`source.source_object`、project profile 和 policy 的 digest 绑定；允许变化的后续数据必须通过独立版本对象表达，禁止原地修改 `RunSpec`。

---

## 5. `ApprovalEvidence` 与 `GrantClaims`

### 5.1 ApprovalEvidence

```ts
type ExternalApprovalProvider = {
  type: "nyxid" | "enterprise_device_agent" | "local_cli";
  provider_id: string;
  provider_version: string;
};

type ApprovalSubject = {
  user: ActorRef;
  device_id: string;
  device_attestation_digest: Sha256;
};

type DesignApprovalEvidence = ContractMeta & {
  kind: "design";
  approval_id: string;
  issuer:
    | ExternalApprovalProvider
    | { type: "hosted_policy"; provider_id: "fkst-hosted.authorization-authority"; provider_version: string };
  subject: ApprovalSubject;
  decision: "approved" | "denied";
  evidence_basis: "user_approval" | "policy_not_required";
  binding: {
    run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
    design_policy_decision_ref: DigestBoundRef<"qa.design-policy-decision/v1">;
    source_acquisition_ref: DigestBoundRef<"qa.source-acquisition/v1">;
    source_object_ref: DigestBoundRef<"qa.source-object/v1">;
    source_effective_sha: string;
    design_scope_digest: Sha256;
    project_profile_digest: Sha256;
  };
  decided_at: ISO8601;
  expires_at: ISO8601;
  challenge_nonce: string;
  signature: SignatureBlock;
};

type ExecutionApprovalEvidence = ContractMeta & {
  kind: "execution";
  approval_id: string;
  issuer:
    | ExternalApprovalProvider
    | { type: "hosted_policy"; provider_id: "fkst-hosted.authorization-authority"; provider_version: string };
  subject: ApprovalSubject;
  decision: "approved" | "denied";
  evidence_basis: "user_approval" | "policy_not_required";
  binding: {
    run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
    source_acquisition_ref: DigestBoundRef<"qa.source-acquisition/v1">;
    source_effective_sha: string;
    plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
    policy_decision_ref: DigestBoundRef<"qa.policy-decision/v1">;
    approved_envelope_digest: Sha256;
    device_id: string;
    project_profile_digest: Sha256;
    grant_sequence: number;
  };
  decided_at: ISO8601;
  expires_at: ISO8601;
  challenge_nonce: string;
  signature: SignatureBlock;
};

type ApprovalEvidence = DesignApprovalEvidence | ExecutionApprovalEvidence;
```

`ApprovalEvidence` 是 strict union。Design variant 禁止出现 `plan_ref`、`policy_decision_ref`、`approved_envelope_digest` 或 Secret 字段；Execution variant 缺少任一 plan/policy/envelope/device/profile/sequence 绑定时无效。

NyxID Adapter 必须把用户批准和设备证明映射为对应 variant。`evidence_basis="policy_not_required"` 只能由 hosted Authorization Authority 在对应 DesignPolicyDecision 或 PolicyDecision 的 `approval_requirement.kind="not_required"` 时签发，仍必须生成不可变的对应 ApprovalEvidence，禁止用空数组表示“无需 Evidence”。Authorization Authority 必须验证签名、challenge nonce、device binding、有效期、Run 绑定和全部 digest。

`decision="denied"` 的 Evidence 必须保留用于审计，但禁止出现在任何 `approval_evidence_refs`、Grant、RuntimeCommand、PlanAmendment 或 ResumeDirective 中。签名字节必须按 §3.6 构造，其中 `purpose="approval_evidence"`，`payload` 为移除 `signature` 后的完整 Evidence。

### 5.2 GrantClaims

```ts
type GrantTiming = {
  issued_at: ISO8601;
  not_before: ISO8601;
  expires_at: ISO8601;
  nonce: string;
  sequence: number;
};

type GrantRevocation = {
  revocable: true;
  status_endpoint_ref: string;
};

type DesignScope = {
  source_read_roots: string[];
  metadata_read_roots: string[];
  pql_input_refs: DigestBoundRef[];
  workspace_write_roots: string[];
  static_analysis_tools: string[];
  network: ActionEnvelope["network"];
  resources: ActionEnvelope["resources"];
  capabilities: Array<"source.read" | "metadata.read" | "plan.write" | "static_analysis.execute">;
};

type DesignGrantClaims = ContractMeta & {
  grant_type: "design";
  grant_id: string;
  issuer: "fkst-hosted.authorization-authority";
  subject: { run_id: UUID; device_id: string; runtime_instance_id?: string };
  audience: "fkst-local-qa-runtime";
  run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
  source_acquisition_ref: DigestBoundRef<"qa.source-acquisition/v1">;
  source_object_ref: DigestBoundRef<"qa.source-object/v1">;
  source_effective_sha: string;
  project_profile_digest: Sha256;
  design_policy_decision_ref: DigestBoundRef<"qa.design-policy-decision/v1">;
  authorized_fence: ExecutionFence;
  design_scope: DesignScope;
  design_scope_digest: Sha256;
  approval_evidence_refs: [DigestBoundRef<"qa.approval-evidence/v1">, ...DigestBoundRef<"qa.approval-evidence/v1">[]];
  timing: GrantTiming;
  revocation: GrantRevocation;
};

type ExecutionGrantClaims = ContractMeta & {
  grant_type: "execution";
  grant_id: string;
  issuer: "fkst-hosted.authorization-authority";
  subject: { run_id: UUID; device_id: string; runtime_instance_id?: string };
  audience: "fkst-local-qa-runtime";
  run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
  source_acquisition_ref: DigestBoundRef<"qa.source-acquisition/v1">;
  source_effective_sha: string;
  project_profile_digest: Sha256;
  authorized_fence: ExecutionFence;
  plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
  policy_decision_ref: DigestBoundRef<"qa.policy-decision/v1">;
  approved_envelope: ActionEnvelope;
  approved_envelope_digest: Sha256;
  scope: ActionEnvelope;
  device_binding: {
    device_id: string;
    runtime_instance_id?: string;
    device_attestation_digest: Sha256;
  };
  approval_evidence_refs: [DigestBoundRef<"qa.approval-evidence/v1">, ...DigestBoundRef<"qa.approval-evidence/v1">[]];
  timing: GrantTiming;
  revocation: GrantRevocation;
};

type GrantClaims = DesignGrantClaims | ExecutionGrantClaims;

type SignedGrant<TClaims extends GrantClaims = GrantClaims> = {
  claims: TClaims;
  signature: SignatureBlock;
};
```

`GrantClaims` 是 strict union，两个 variant 的 `issuer` 都必须是 `fkst-hosted.authorization-authority`，并绑定目标 runtime 的 `authorized_fence`。Design variant 禁止出现 plan、PolicyDecision、approved envelope、Execution scope 或任何 Secret reference；Execution variant 必须绑定 plan、PolicyDecision、批准 envelope、device/profile、ExecutionFence 和严格递增 sequence。

Grant 签名字节必须按 §3.6 构造，其中 `purpose="grant"`，`payload=claims`。Runtime 必须拒绝 claims/signature key 不匹配、非 canonical payload、未知字段或混合 variant 字段。

### 5.3 Design Grant

Design Grant 的 `design_scope` 只允许读取固定 SourceObject、批准的 PQL 资产和项目元数据，执行静态分析，并在 Runtime 管理的临时目录写入 Structured Plan 草稿。它必须禁止：

- 绑定或读取 Plan、PolicyDecision approved envelope、CredentialLease 或 Secret reference。
- 启动 App、Middleware、浏览器、测试、发布动作或长期进程。
- 修改被测仓库内容。
- 对公网或内网发起未在 `design_scope.network` 中显式批准的连接。

### 5.4 Execution Grant

Execution Grant 的 `scope` 必须等于或小于 `approved_envelope`，且两者的 canonical digest 必须与 PolicyDecision 一致。Runtime 必须拒绝以下情况：

- Grant 已过期、尚未生效、已撤销或 nonce 已使用。
- effective SHA、RunSpec、SourceAcquisition、Plan、PolicyDecision、approved envelope、device、attestation 或 profile digest 不匹配。
- 任一 ApprovalEvidence 为 denied、过期、类型非 execution、sequence 不匹配或 digest 不匹配。
- signature key 不受信任，或 sequence 小于等于已接受的最新 Execution Grant sequence。

Runtime 接受 Execution Grant 后必须原子记录 `(grant_id, timing.nonce, timing.sequence, plan_ref.content_digest)`，防止重放。

---

## 6. `StructuredPlan`、`PlanCase`、`PlanStep`、`ActionEnvelope` 与 Policy

### 6.1 ActionEnvelope

```ts
type ActionEnvelope = {
  files: {
    read: string[];                 // sandbox 内的 canonical glob/path
    write: string[];
    deny: string[];
  };
  commands: Array<{
    executable: string;
    argv_patterns?: string[];
    working_directory_roots: string[];
    allow_shell_expansion: boolean;
  }>;
  network: {
    mode: "deny_all" | "allowlist";
    destinations: Array<{
      scheme: "https" | "http" | "tcp";
      host: string;
      ports: number[];
      purpose: string;
    }>;
  };
  secrets: Array<{
    secret_ref: string;
    inject_as: "environment" | "file" | "proxy";
    step_ids: string[];
    allowed_destinations?: string[];
  }>;
  resources: {
    cpu_millis: number;
    memory_bytes: number;
    disk_bytes: number;
    process_count: number;
    open_file_count: number;
    wall_clock_seconds: number;
  };
  capabilities: string[];
};
```

路径必须以 Sandbox root 为解析基准。`..`、symlink escape、未声明 absolute path 和用户主目录路径必须拒绝。`deny` 优先于 `read` 和 `write`。

### 6.2 PlanCase、PlanStep、Assertion 与 EvidenceRequirement

```ts
type AssertionBase = {
  assertion_id: string;
  required: boolean;
};

type AssertionSpec = AssertionBase & (
  | { type: "exit_code"; expected: number }
  | { type: "stdout_match"; pattern: string; flags?: string }
  | { type: "http_status"; request_ref: string; expected: number[] }
  | { type: "json_schema"; source_ref: string; schema_ref: string }
  | { type: "dom"; selector: string; operator: "exists" | "text_equals" | "attribute_equals"; expected?: string; attribute?: string }
  | { type: "visual"; baseline_ref: string; max_diff_ratio: number }
  | { type: "custom_oracle"; oracle_id: string; input_refs: string[] }
);

type EvidenceRequirementBase = {
  requirement_id: string;
  required: boolean;
  step_ids: string[];
  case_ids: string[];
  assertion_ids: string[];
  redaction_policy_ref: DigestBoundRef<"qa.redaction-policy/v1">;
};

type EvidenceRequirement = EvidenceRequirementBase & (
  | { type: "log"; stream: "stdout" | "stderr" | "combined"; max_bytes: number }
  | { type: "screenshot"; capture: "on_assertion" | "on_failure" | "always"; full_page: boolean }
  | { type: "trace"; format: "playwright" | "browser_devtools" | "custom" }
  | { type: "video"; max_duration_seconds: number }
  | { type: "network"; mode: "metadata_only" | "redacted_payload" }
  | { type: "structured_observation"; schema_ref: DigestBoundRef }
  | { type: "report"; renderer_id: string }
);

type PlanStep = {
  step_id: string;
  ordinal: number;
  name: string;
  purpose: string;
  phase: "prepare" | "readiness" | "execute" | "evidence" | "cleanup";
  backend: "deterministic" | "browser" | "codex";
  dependencies: string[];
  case_ids: string[];
  action: { kind: string; input: Record<string, unknown> };
  envelope: ActionEnvelope;
  assertions: AssertionSpec[];
  evidence_requirement_ids: string[];
  timeout_seconds: number;
  retry: { max_attempts: number; retry_on: string[]; backoff_seconds: number[] };
  continue_on_failure: boolean;
};

type PlanCase = {
  case_id: string;
  suite_id?: string;
  name: string;
  required: boolean;
  step_ids: string[];
  assertion_ids: string[];
  evidence_requirement_ids: string[];
  aggregation: "all_required_assertions" | "any_required_assertion";
};
```

`EvidenceRequirement` 是 strict union。每个 `assertion_id`、`requirement_id`、`step_id` 和 `case_id` 在 Plan 内必须唯一；所有引用必须存在且双向一致：Case 引用 Step 时 Step 必须包含该 Case，Case 引用 Assertion 时该 Assertion 必须属于其 Step，EvidenceRequirement 的 Case/Step/Assertion 绑定也必须一致。

Case 聚合规则如下：

1. 任一 required assertion 为 failed 时 Case 为 failed。
2. 任一 required assertion 为 error 或无法评估，且没有策略允许的等价 fallback 时 Case 为 error 或 inconclusive，禁止 passed。
3. `all_required_assertions` 只有全部 required assertion passed 才可 passed；`any_required_assertion` 至少一个 required assertion passed 且其余 required assertion 不为 failed/error 才可 passed。
4. required EvidenceRequirement 未 fulfilled 时，Case 即使 assertion passed 也只能为 inconclusive；optional Evidence 缺失不得改变 assertion outcome，但必须记录。
5. Step outcome 由其 AssertionResult 聚合，Case outcome 由其全部 Step/Assertion/Evidence 聚合；Plan 汇总禁止只读取最后一个 Step。

Browser Readiness 只能在 Plan 包含 Browser Step 时出现。API、CLI、unit-only Plan 不应该启动浏览器或 Browser Profile。

Codex Step 必须满足：

- 输入和动作受 `ActionEnvelope` 约束。
- 输出必须是观察值、建议或 `amendment_required`，不得直接改写 Plan。
- Codex 自报 `passed: true` 禁止覆盖 assertion evaluator 的结果。
- 未产生所需结构化输出时必须视为 Backend protocol failure。

### 6.3 StructuredPlan

```ts
type StructuredPlan = ContractMeta & {
  plan_id: string;
  version: number;
  previous_plan_ref?: DigestBoundRef<"qa.structured-plan/v1">;
  run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
  source_acquisition_ref: DigestBoundRef<"qa.source-acquisition/v1">;
  source_effective_sha: string;
  project_profile_digest: Sha256;
  pql_inputs: DigestBoundRef[];
  cases: PlanCase[];
  steps: PlanStep[];
  evidence_requirements: EvidenceRequirement[];
  aggregate_envelope: ActionEnvelope;
  assertion_catalog_digest: Sha256;
  cleanup_requirements: string[];
  generated_by: { module: "testing-design"; model_or_engine?: string };
};
```

`aggregate_envelope` 必须是所有 Step envelope 的最小上界，不得比 Step 实际需求更宽。Plan 必须通过 DAG、ordinal 唯一性、引用完整性、循环依赖、resource budget 聚合、Case/Assertion/Evidence 聚合和 cleanup coverage 校验。

### 6.4 PolicyDecision

```ts
type ApprovalRequirement =
  | { kind: "required"; reason_codes: string[]; approval_scope_digest: Sha256 }
  | { kind: "not_required"; reason_codes: string[]; authority_rule_id: string };

type DesignPolicyDecision = ContractMeta & {
  decision_id: string;
  run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
  policy_ref: DigestBoundRef<"qa.policy/v1">;
  effect: "allow" | "deny";
  design_scope?: DesignScope;
  design_scope_digest?: Sha256;
  approval_requirement: ApprovalRequirement;
  reason_codes: string[];
  evaluated_at: ISO8601;
};

type PolicyViolation = {
  rule_id: string;
  step_id?: string;
  path: string;
  message: string;
};

type PolicyDecision =
  | (ContractMeta & {
      effect: "allow";
      decision_id: string;
      run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
      plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
      policy_ref: DigestBoundRef<"qa.policy/v1">;
      approval_requirement: ApprovalRequirement;
      approved_envelope: ActionEnvelope;
      approved_envelope_digest: Sha256;
      reason_codes: string[];
      violations: PolicyViolation[];
      evaluated_at: ISO8601;
    })
  | (ContractMeta & {
      effect: "deny";
      decision_id: string;
      run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
      plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
      policy_ref: DigestBoundRef<"qa.policy/v1">;
      approval_requirement: { kind: "not_required"; reason_codes: string[]; authority_rule_id: string };
      reason_codes: string[];
      violations: [PolicyViolation, ...PolicyViolation[]];
      evaluated_at: ISO8601;
    });
```

DesignPolicyDecision 的 `effect="allow"` 必须同时携带 `design_scope` 和 digest；`effect="deny"` 必须禁止签发 Design Grant。Design allow 可以 required 或 not_required，但两条路径都必须产生 approved DesignApprovalEvidence。

Execution Policy 的 allow/deny 与“是否要求用户批准”是两个独立结论：只有 `effect="allow"` 才能产生 approved envelope；allow 可以 required 或 not_required，deny 永远禁止签发 Execution Grant。每个 Execution Grant 都必须引用一个 approved ExecutionApprovalEvidence；`not_required` 路径必须由 hosted Authorization Authority 生成 `evidence_basis="policy_not_required"` 的 Evidence，不能省略 Evidence。

Policy evaluator 必须 fail closed。任何无法理解的 command、network destination、Secret、capability、EvidenceRequirement 或 resource 单位必须拒绝。

---

## 7. `PlanAmendmentRequest` 与 `PlanAmendment`

```ts
type AmendmentReasonCode =
  | "new_step"
  | "file_scope_expansion"
  | "network_scope_expansion"
  | "new_secret"
  | "privilege_expansion"
  | "resource_budget_expansion"
  | "assertion_change"
  | "evidence_requirement_change"
  | "other";

type PlanDiffOperation = {
  op: "add" | "remove" | "replace";
  path: string;                    // JSON Pointer
  before_digest?: Sha256;
  after_value?: unknown;
  reason: string;
};

type PlanAmendmentRequest = ContractMeta & {
  request_id: string;
  old_plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
  requested_by: { type: "backend" | "runner" | "runtime" | "policy" | "user"; id: string };
  reason_code: AmendmentReasonCode;
  requested_action: Record<string, unknown>;
  observed_step_id?: string;
  old_fence: ExecutionFence;
  expected_cursor: RuntimeCursor;
  checkpoint_ref: DigestBoundRef<"qa.workflow-checkpoint/v1">;
  requested_at: ISO8601;
};

type GrantRevocationReceipt = ContractMeta & {
  receipt_id: string;
  grant_ref: DigestBoundRef<"qa.signed-grant/v1">;
  revoked_sequence: number;
  revoked_at: ISO8601;
  reason: "amendment" | "cancelled" | "timed_out" | "security" | "superseded";
  authority: "fkst-hosted.authorization-authority";
  status: "revoked";
};

type ResumeDirective = {
  resume_id: string;
  checkpoint_ref: DigestBoundRef<"qa.workflow-checkpoint/v1">;
  earliest_step_id: string;
  reusable_step_ids: string[];
  rerun_step_ids: string[];
  invalidated_effect_ids: string[];
  new_fence: ExecutionFence;
  expected_cursor: RuntimeCursor;
  rationale: string;
};

type PlanAmendment = ContractMeta & {
  amendment_id: string;
  request_ref: DigestBoundRef<"qa.plan-amendment-request/v1">;
  old_plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
  old_execution_grant_ref: DigestBoundRef<"qa.signed-grant/v1">;
  old_fence: ExecutionFence;
  checkpoint_ref: DigestBoundRef<"qa.workflow-checkpoint/v1">;
  revocation_receipt_ref: DigestBoundRef<"qa.grant-revocation-receipt/v1">;
  termination_receipt_refs: DigestBoundRef<"qa.termination-receipt/v1">[];
  amendment_cleanup_receipt_ref: DigestBoundRef<"qa.cleanup-receipt/v1">;
  amendment_design_approval_ref: DigestBoundRef<"qa.approval-evidence/v1">;
  amendment_design_grant_ref: DigestBoundRef<"qa.signed-grant/v1">;
  new_plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
  amendment_design_cleanup_receipt_ref: DigestBoundRef<"qa.cleanup-receipt/v1">;
  operations: PlanDiffOperation[];
  new_policy_decision_ref: DigestBoundRef<"qa.policy-decision/v1">;
  new_approval_evidence_refs: [DigestBoundRef<"qa.approval-evidence/v1">, ...DigestBoundRef<"qa.approval-evidence/v1">[]];
  new_execution_grant_ref: DigestBoundRef<"qa.signed-grant/v1">;
  resume: ResumeDirective;
  finalized_at: ISO8601;
};
```

`PlanAmendmentRequest` 只是暂停和重新设计的输入，禁止被 Runtime 当作新授权。只有完整 `PlanAmendment` 才可恢复执行；它必须同时证明旧 Grant 已撤销、旧 fence 已失效、Checkpoint 已冻结、旧 Backend/进程已终止、旧环境与 CredentialLease 已 Cleanup，amendment Design Approval/Grant 已取得，新 Plan 已在全新的 Local Design Sandbox 中生成且 Design Cleanup 已 settled，新 Plan 已通过 Policy、Execution Evidence 已批准、新 Execution Grant 已签发且 ResumeDirective 使用新 fence。

触发 Amendment 时必须按以下顺序执行：

1. 以 `PlanAmendmentRequest.old_fence` 停止启动新的 Plan Step，并持久化 cursor。
2. 取消或终止 active Backend，生成 `TerminationReceipt`。
3. 持久化 Checkpoint、Artifact、已完成 effect 和 resource inventory digest。
4. 撤销旧 Execution Grant并生成 `GrantRevocationReceipt`；旧 fence 随后不得再接受 mutating command/event。
5. 使用本地 `CleanupCapability` 执行 `cleanup(reason=amendment_pause)`，销毁旧 Sandbox、进程组、Browser Profile 和 CredentialLease。
6. Policy Gate 检查 amendment design scope；Approval Provider 生成新的 DesignApprovalEvidence，Hosted Authorization Authority 签发 amendment Design Grant。
7. Runtime 使用 amendment Design Grant 创建全新的 Local Design Sandbox，在原 RunSpec/effective SHA 上生成新 Plan 与结构化 Diff，并取得 Design CleanupReceipt。
8. 对新 Plan 重新执行 Policy、Execution ApprovalEvidence 和 Execution Grant。
9. 只有上述 Evidence、Grant 和 Receipt 全部 digest-bound 后才创建不可变 `PlanAmendment`。
10. Runtime 验证 `resume.new_fence` 和新 Execution Grant 后创建新 Local QA Sandbox，只复用 Checkpoint 明确标记为 reusable 且无外部副作用不确定性的 Step。

新增 Step、扩大文件/网络/Secret/权限、提高资源预算或改变 assertion/EvidenceRequirement 语义必须重新审批。只缩小权限或修正无副作用的显示元数据可以由策略选择 `approval_requirement=not_required`，但仍必须生成新 Plan、PolicyDecision、Execution ApprovalEvidence、Grant 和 Amendment。

---

## 8. Transport-neutral Runtime 协议与 NyxID Adapter

### 8.1 Runtime Service Interface

Runtime 协议必须与 NyxID 私有 API 解耦。逻辑接口定义如下：

```ts
type RuntimeRunState =
  | "accepted"
  | "designing"
  | "design_cleaning_up"
  | "awaiting_execution_grant"
  | "preparing"
  | "ready"
  | "executing"
  | "amendment_required"
  | "collecting_evidence"
  | "cancelling"
  | "timing_out"
  | "cleaning_up"
  | "cleanup_repair"
  | "recovering"
  | "completed"
  | "cancelled"
  | "failed";

type RuntimeRunSnapshot = ContractMeta & {
  runtime_run_id: string;
  runtime_instance_id: string;
  fence: ExecutionFence;
  fence_digest: Sha256;
  cursor: RuntimeCursor;
  state: RuntimeRunState;
  accepted_command_ids: string[];
  source_effective_sha: string;
  active_plan_ref?: DigestBoundRef<"qa.structured-plan/v1">;
  active_grant_ref?: DigestBoundRef<"qa.signed-grant/v1">;
  cleanup_capability_ref?: DigestBoundRef<"qa.cleanup-capability/v1">;
  active_step?: { step_id: string; attempt: number };
  environment_ref?: DigestBoundRef<"qa.prepared-environment/v1">;
  resource_inventory: ResourceRef[];
  resource_inventory_digest: Sha256;
  case_result_refs: DigestBoundRef<"qa.case-result/v1">[];
  evidence_manifest_refs: DigestBoundRef<"qa.evidence-manifest/v1">[];
  termination_receipt_refs: DigestBoundRef<"qa.termination-receipt/v1">[];
  cleanup_receipt_ref?: DigestBoundRef<"qa.cleanup-receipt/v1">;
  last_error?: ErrorEnvelope;
};

type SubmitCommandRequest = { command: RuntimeCommand };

type SubmitCommandResponse = {
  accepted: boolean;
  run_id: UUID;
  runtime_run_id: string;
  runtime_instance_id: string;
  accepted_command_id: string;
  cursor: RuntimeCursor;
  current_state: RuntimeRunState;
};

type RuntimeService = {
  submitCommand(request: SubmitCommandRequest): Promise<SubmitCommandResponse>;
  getRun(request: { run_id: UUID }): Promise<RuntimeRunSnapshot>;
  streamEvents(request: { run_id: UUID; after_cursor?: RuntimeCursor }): AsyncIterable<RuntimeEvent>;
};
```

Cancel 必须通过 §8.3 的 `CancelCommand` 提交，禁止存在绕过 fence、command sequence 和 expected cursor 的独立 `cancelRun` API。`RuntimeRunState` 是设备侧执行快照，不是云端 `WorkflowState`；hosted 只能根据 RuntimeEvent、Snapshot、Checkpoint 和 Receipt 推进 workflow，不得按枚举名称直接等同。

Runtime v1 可以通过 loopback HTTP + authenticated streaming 实现，但 wire transport 禁止改变上述语义。

### 8.2 NyxID Adapter 映射

| Runtime 操作 | NyxID 下行/上行映射 | 要求 |
|---|---|---|
| `SubmitCommand` | Cloud request → Node route → loopback Runtime | Node 不解包或修改 signed Grant/Capability；必须透传 correlation id、fence 和 cursor。 |
| `GetRun` | Cloud query → Node route → Runtime snapshot | 返回值必须保留所有 digest、fence 和 cursor。 |
| `CancelCommand` | fenced Cloud command → Node route → Runtime | 取消必须走与其他 mutating command 相同的鉴权、幂等和顺序检查。 |
| `StreamEvents` | Runtime event → Node → Cloud event ingestion | 允许断线重连；按 `(run_id, generation, sequence)` 去重。 |

NyxID Adapter 必须：

- 使用 Node 主动建立的出站安全连接，禁止要求用户开放公网入站端口。
- 将 NyxID Approval/Device Attestation 映射为 `ApprovalEvidence`。
- 传输由 hosted Authorization Authority 签发的 Grant，禁止重签、扩权或改写 claims。
- 对 loopback Runtime 使用生产级本地认证；禁止保留 POC 的 `auth_method=none`。
- 把 Node routing error 与 Runtime application error 分开编码。

NyxID Adapter 禁止执行 Plan Step、注入 Secret、推导 Pass/Fail、缓存 Authorization Authority 私钥，或在转发时替换 fence/cursor。

### 8.3 RuntimeCommand

```ts
type FencedCommandBase = ContractMeta & {
  command_id: string;
  idempotency_key: string;
  fence: ExecutionFence;
  command_sequence: number;
  expected_cursor: RuntimeCursor;
  deadline_at: ISO8601;
};

type DesignCommand = FencedCommandBase & {
  type: "design";
  run_spec: RunSpec;
  design_grant: SignedGrant<DesignGrantClaims>;
};

type ExecuteCommand = FencedCommandBase & {
  type: "execute";
  run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
  plan: StructuredPlan;
  execution_grant: SignedGrant<ExecutionGrantClaims>;
};

type ResumeCommand = FencedCommandBase & {
  type: "resume";
  amendment: PlanAmendment;
  checkpoint_ref: DigestBoundRef<"qa.workflow-checkpoint/v1">;
  execution_grant: SignedGrant<ExecutionGrantClaims>;
};

type CancelCommand = FencedCommandBase & {
  type: "cancel";
  reason: "user" | "timeout" | "grant_revoked" | "policy" | "shutdown" | "amendment";
  requested_by: ActorRef;
};

type CleanupCommand = FencedCommandBase & {
  type: "cleanup";
  cleanup_capability: CleanupCapability; // §9 定义
  resource_inventory_digest: Sha256;
  reason: CleanupReason;                 // §11 定义
};

type ProbeHealthCommand = ContractMeta & {
  type: "probe_health";
  command_id: string;
  idempotency_key: string;
  requested_at: ISO8601;
};

type RuntimeCommand =
  | DesignCommand
  | ExecuteCommand
  | ResumeCommand
  | CancelCommand
  | CleanupCommand
  | ProbeHealthCommand;
```

除只读 `probe_health` 外，所有命令都是 fenced mutating command，必须携带完整 ExecutionFence、command sequence 和 expected cursor。Design/Execute/Resume command 的 fence 必须分别等于所携 Grant 的 `authorized_fence`。Runtime 必须同时验证 hosted workflow fence 与 local execution fence，并按原子事务检查和推进 command sequence/cursor；任一旧 generation、错误 token、runtime instance 不匹配、sequence 重放、cursor 不匹配或 deadline 过期均必须在任何副作用前拒绝。

### 8.4 RuntimeEvent

```ts
type RuntimeEventBase = ContractMeta & {
  event_id: string;
  runtime_instance_id: string;
  runtime_run_id: string;
  generation: number;
  cursor: RuntimeCursor;
  fence_digest: Sha256;
  caused_by: {
    command_id: string;
    command_sequence: number;
    idempotency_key: string;
  };
  occurred_at: ISO8601;
};

type RuntimeEvent = RuntimeEventBase & (
  | { type: "command_accepted"; command_type: RuntimeCommand["type"]; accepted_cursor: RuntimeCursor }
  | { type: "state_changed"; from: RuntimeRunState; to: RuntimeRunState; reason_code: string }
  | { type: "heartbeat"; state: RuntimeRunState; active_step_id?: string; inventory_digest: Sha256 }
  | { type: "step_started"; plan_ref: DigestBoundRef<"qa.structured-plan/v1">; step_id: string; attempt: number }
  | { type: "step_observation"; observation_ref: DigestBoundRef<"qa.backend-observation/v1">; step_id: string; attempt: number }
  | { type: "step_completed"; step_id: string; attempt: number; case_result_refs: DigestBoundRef<"qa.case-result/v1">[] }
  | {
      type: "plan_generated";
      plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
      source_effective_sha: string;
      design_grant_ref: DigestBoundRef<"qa.signed-grant/v1">;
      design_environment_receipt_ref: DigestBoundRef<"qa.design-environment-receipt/v1">;
    }
  | { type: "amendment_required"; request_ref: DigestBoundRef<"qa.plan-amendment-request/v1"> }
  | { type: "artifact_registered"; artifact_ref: DigestBoundRef<"qa.artifact-pointer/v1">; requirement_ids: string[] }
  | { type: "cleanup_started"; cleanup_capability_ref: DigestBoundRef<"qa.cleanup-capability/v1">; inventory_digest: Sha256 }
  | { type: "cleanup_completed"; cleanup_receipt_ref: DigestBoundRef<"qa.cleanup-receipt/v1"> }
  | { type: "termination_completed"; termination_receipt_ref: DigestBoundRef<"qa.termination-receipt/v1"> }
  | { type: "error"; error: ErrorEnvelope }
  | { type: "run_snapshot"; snapshot_ref: DigestBoundRef<"qa.runtime-run-snapshot/v1"> }
);
```

`RuntimeEvent` 是 strict union。`generation` 和 `cursor.generation` 必须同时等于触发命令 `ExecutionFence.local_execution.generation`，`fence_digest` 必须等于完整 ExecutionFence 的 canonical digest；事件必须引用产生它的 command。`plan_generated` 缺少任一绑定字段时禁止进入 Policy Review。

单 generation 内 sequence 必须严格递增。Cloud ingestion 可以接受完全相同的重复事件，但必须拒绝旧 generation、相同 cursor 不同 digest、sequence 倒退和已失效 fence 事件；出现 gap 时必须请求 snapshot 或从 `after_cursor` 重连，禁止猜测缺失事件。

---

## 9. `EnvironmentFactory`、Capability、Credential 与 Sandbox 生命周期

### 9.1 Resource Inventory、CleanupCapability 与 CredentialLease

```ts
type InventoryResource = {
  resource: ResourceRef;
  owner_run_id: UUID;
  owner_environment_id: string;
  category: "process" | "port" | "file" | "directory" | "sandbox" | "browser_profile" | "credential_lease" | "artifact_staging";
  cleanup_action: "terminate" | "release" | "delete" | "revoke";
  preserve_policy_ref?: DigestBoundRef<"qa.retention-policy/v1">;
};

type ResourceInventory = ContractMeta & {
  inventory_id: string;
  environment_id: string;
  resources: InventoryResource[];
  inventory_digest: Sha256;
  sealed_at: ISO8601;
};

type CleanupCapability = ContractMeta & {
  capability_id: string;
  issuer: "fkst-local-qa-runtime.cleanup-authority";
  runtime_instance_id: string;
  fence_digest: Sha256;
  environment_ids: string[];
  resource_inventory_digest: Sha256;
  allowed_actions: Array<"terminate" | "release" | "delete" | "revoke">;
  allowed_reasons: CleanupReason[];
  issued_at: ISO8601;
  expires_at: ISO8601;
  nonce: string;
  signature: SignatureBlock;
};

type CredentialLease = ContractMeta & {
  lease_id: string;
  issuer: "fkst-local-secret-broker";
  runtime_instance_id: string;
  environment_id: string;
  secret_ref: string;                 // opaque reference，不是 Secret 值
  opaque_lease_handle: string;        // 仅本地可解析
  step_ids: string[];
  inject_as: "environment" | "file" | "proxy";
  allowed_destinations: string[];
  fence_digest: Sha256;
  issued_at: ISO8601;
  expires_at: ISO8601;
  renewable: boolean;
};

type CredentialLeaseReceipt = ContractMeta & {
  receipt_id: string;
  lease_ref: DigestBoundRef<"qa.credential-lease/v1">;
  action: "issued" | "renewed" | "revoked" | "expired" | "reconciled";
  status: "active" | "settled" | "failed";
  observed_at: ISO8601;
  error?: ErrorEnvelope;
  signature: SignatureBlock;
};
```

`CleanupCapability` 必须在第一个本地资源副作用前创建并持久化，且不能依赖 Execution Grant 仍然有效；它只能清理 capability 中列出的 environment、inventory digest、action 和 reason。签名字节按 §3.6，`purpose="cleanup_capability"`。`CredentialLeaseReceipt` 使用 `purpose="credential_receipt"`。

Secret 值和 `opaque_lease_handle` 禁止离开 Local Runtime/SecretBroker 信任域；hosted、NyxID 和 Artifact Store 只能看到 digest-bound lease/receipt reference。

### 9.2 EnvironmentFactory Interface

```ts
type DesignEnvironmentReceipt = ContractMeta & {
  receipt_id: string;
  design_environment_id: string;
  workspace_root_token: string;
  source_effective_sha: string;
  source_object_digest: Sha256;
  resource_inventory_ref: DigestBoundRef<"qa.resource-inventory/v1">;
  cleanup_capability_ref: DigestBoundRef<"qa.cleanup-capability/v1">;
  outcome: "prepared" | "failed";
  error?: ErrorEnvelope;
};

type PreparedEnvironment = ContractMeta & {
  environment_id: string;
  workspace_root_token: string;
  source_effective_sha: string;
  source_object_digest: Sha256;
  process_group_id: string;
  allocated_ports: number[];
  endpoint_refs: Array<{ name: string; url: string }>;
  resource_inventory_ref: DigestBoundRef<"qa.resource-inventory/v1">;
  resource_inventory_digest: Sha256;
  cleanup_capability_ref: DigestBoundRef<"qa.cleanup-capability/v1">;
};

type ReadinessCheck =
  | { type: "process"; process_ref: string }
  | { type: "tcp"; host: string; port: number }
  | { type: "http"; url: string; expected_status: number[]; body_match?: string }
  | { type: "browser"; url: string; selector?: string };

type EnvironmentFactory = {
  prepareDesign(input: {
    run_spec: RunSpec;
    design_grant: SignedGrant<DesignGrantClaims>;
    fence: ExecutionFence;
    idempotency_key: string;
  }): Promise<DesignEnvironmentReceipt>;

  prepareExecution(input: {
    run_spec: RunSpec;
    plan: StructuredPlan;
    execution_grant: SignedGrant<ExecutionGrantClaims>;
    fence: ExecutionFence;
    idempotency_key: string;
  }): Promise<PreparedEnvironment>;

  checkReadiness(input: {
    run_id: UUID;
    environment_ref: DigestBoundRef<"qa.prepared-environment/v1">;
    checks: ReadinessCheck[];
    attempt: number;
    fence: ExecutionFence;
  }): Promise<ReadinessReceipt>;

  cleanup(input: {
    run_id: UUID;
    cleanup_capability: CleanupCapability;
    resource_inventory_ref: DigestBoundRef<"qa.resource-inventory/v1">;
    resource_inventory_digest: Sha256;
    reason: CleanupReason;
    idempotency_key: string;
  }): Promise<CleanupReceipt>;
};
```

Design 阶段必须先调用 `prepareDesign`，在独立、受限的 Local Design Sandbox 中生成 `StructuredPlan`。Runtime 必须通过 `plan_generated` 事件返回 Plan、Source、Design Grant 和 DesignEnvironmentReceipt 的 digest-bound reference；hosted 校验后仍必须进入 `design_cleaning_up`。只有 Local Design Sandbox 的 Cleanup settled 后才能进入 `policy_review`，禁止等待或复用 Execution Cleanup。

### 9.3 ReadinessReceipt

```ts
type ReadinessReceipt = ContractMeta & {
  receipt_id: string;
  environment_ref: DigestBoundRef<"qa.prepared-environment/v1">;
  attempt: number;
  checks: Array<{
    check: ReadinessCheck;
    outcome: "ready" | "not_ready" | "error";
    observed_at: ISO8601;
    latency_ms?: number;
    error?: ErrorEnvelope;
  }>;
  overall: "ready" | "not_ready" | "failed";
  endpoint_refs: Array<{ name: string; url: string }>;
  resource_inventory_digest: Sha256;
};
```

### 9.4 Local PEP 与 SecretBroker Client

```ts
type PEPDecision = {
  decision: "allow" | "deny";
  reason_codes: string[];
  checked_digests: {
    plan: Sha256;
    policy_decision: Sha256;
    grant: Sha256;
    action_envelope: Sha256;
    fence: Sha256;
  };
};

type LocalPolicyEnforcementPoint = {
  authorizeAction(input: {
    step: PlanStep;
    action_digest: Sha256;
    plan: StructuredPlan;
    policy_decision: PolicyDecision;
    execution_grant: SignedGrant<ExecutionGrantClaims>;
    fence: ExecutionFence;
  }): Promise<PEPDecision>;
};

type SecretBrokerClient = {
  issue(input: {
    secret_ref: string;
    environment_id: string;
    step_ids: string[];
    inject_as: "environment" | "file" | "proxy";
    allowed_destinations: string[];
    execution_grant: SignedGrant<ExecutionGrantClaims>;
    fence: ExecutionFence;
    idempotency_key: string;
  }): Promise<{ lease: CredentialLease; receipt: CredentialLeaseReceipt }>;
  revoke(input: { lease: CredentialLease; reason: CleanupReason; idempotency_key: string }): Promise<CredentialLeaseReceipt>;
  reconcile(input: { lease_ref: DigestBoundRef<"qa.credential-lease/v1"> }): Promise<CredentialLeaseReceipt>;
};
```

每个文件、命令、网络、Secret、浏览器和资源动作必须在执行前经过 Local PEP；PEP deny 必须在副作用前终止该动作并发出安全审计。SecretBroker 必须验证 Grant/Step/destination/fence 四重绑定，并在 Step 完成、取消、超时、Grant 撤销、Cleanup 或 Runtime 恢复时 revoke/reconcile lease。

### 9.5 Sandbox 强制要求

EnvironmentFactory 必须：

- 创建每 Run 独立的 Workspace、Sandbox identity、ResourceInventory 和 CleanupCapability。
- 从 SourceObject 获取并验证 `effective_sha` 与对象 digest，禁止执行浮动 branch pull 或信任 `clone_url`。
- 默认不挂载用户主目录、SSH 目录、浏览器个人 Profile、系统 Keychain 或其他项目目录。
- 只挂载 Grant 和 Plan 允许的路径；所有路径由 Local PEP 重新判定。
- 使用独立浏览器 Profile；Run 结束后必须销毁或作为明确 preserved resource 记录。
- 对 App、Middleware、Browser 和 Backend 使用同一 Run process group 或等价可终止资源域。
- 显式登记进程、端口、临时文件、Sandbox、CredentialLease、Browser Profile 和 Artifact staging resource。
- 在取消或超时时终止完整资源域，而不是只杀父进程。
- 允许 Cleanup 在 prepare 部分完成、Runtime 重启或云端断线后凭 capability 与 inventory digest 单独重试。

---

## 10. `TestingBackend`、BrowserProvider 与 Runner Assertion

### 10.1 Backend Interface 与 TerminationReceipt

```ts
type BackendObservation = ContractMeta & {
  observation_id: string;
  plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
  step_id: string;
  attempt: number;
  backend: "deterministic" | "browser" | "codex";
  started_at: ISO8601;
  completed_at: ISO8601;
  exit?: { code?: number; signal?: string };
  stdout_ref?: DigestBoundRef<"qa.artifact-pointer/v1">;
  stderr_ref?: DigestBoundRef<"qa.artifact-pointer/v1">;
  http_observations?: Record<string, unknown>[];
  dom_observations?: Record<string, unknown>[];
  structured_output?: unknown;
  artifact_refs: DigestBoundRef<"qa.artifact-pointer/v1">[];
  backend_error?: ErrorEnvelope;
  amendment_signal?: { reason_code: AmendmentReasonCode; requested_action: Record<string, unknown> };
};

type TerminationReceipt = ContractMeta & {
  receipt_id: string;
  environment_id: string;
  step_id: string;
  attempt: number;
  requested_reason: "cancelled" | "timed_out" | "amendment" | "grant_revoked" | "shutdown";
  requested_at: ISO8601;
  completed_at: ISO8601;
  process_group_ref: ResourceRef;
  outcome: "terminated" | "already_terminated" | "failed";
  remaining_resource_refs: ResourceRef[];
  error?: ErrorEnvelope;
};

type TestingBackend = {
  execute(input: {
    run_id: UUID;
    step: PlanStep;
    environment: PreparedEnvironment;
    policy_decision: PolicyDecision;
    grant: SignedGrant<ExecutionGrantClaims>;
    fence: ExecutionFence;
    attempt: number;
  }): Promise<BackendObservation>;
  cancel(input: {
    run_id: UUID;
    environment_id: string;
    step_id: string;
    attempt: number;
    reason: TerminationReceipt["requested_reason"];
    fence: ExecutionFence;
    deadline_at: ISO8601;
    idempotency_key: string;
  }): Promise<TerminationReceipt>;
};
```

Deterministic、Browser 和 Codex Backend 必须实现同一接口。Backend 必须在动作前调用 Local PEP，再校验 Step envelope 与 Grant scope。`cancel` 的 acknowledgement 不是完成证据；只有 `TerminationReceipt(outcome="terminated"|"already_terminated")` 才能证明 Backend 终止，且仍必须继续 Cleanup 其他资源。

### 10.2 BrowserProvider 与最小安全能力集

```ts
type BrowserSession = ContractMeta & {
  session_id: string;
  environment_id: string;
  browser: "system_google_chrome";
  profile_ref: ResourceRef;
  process_ref: ResourceRef;
  debugging_endpoint_token: string;
  capabilities: BrowserSecurityCapability[];
};

type BrowserSecurityCapability =
  | "isolated_profile"
  | "ephemeral_profile"
  | "download_directory_isolation"
  | "network_policy_enforcement"
  | "origin_allowlist"
  | "permission_prompt_control"
  | "credential_store_disabled"
  | "extension_isolation"
  | "process_group_termination"
  | "artifact_redaction";

type BrowserProvider = {
  launch(input: {
    environment: PreparedEnvironment;
    step: PlanStep;
    grant: SignedGrant<ExecutionGrantClaims>;
    fence: ExecutionFence;
    required_capabilities: BrowserSecurityCapability[];
    idempotency_key: string;
  }): Promise<BrowserSession>;
  capture(input: {
    session: BrowserSession;
    requirement: EvidenceRequirement;
    idempotency_key: string;
  }): Promise<ArtifactPointer>;
  terminate(input: {
    session: BrowserSession;
    reason: TerminationReceipt["requested_reason"];
    fence: ExecutionFence;
    idempotency_key: string;
  }): Promise<TerminationReceipt>;
};
```

Browser Step 至少必须要求 `isolated_profile`、`ephemeral_profile`、`download_directory_isolation`、`network_policy_enforcement`、`origin_allowlist`、`credential_store_disabled`、`extension_isolation` 和 `process_group_termination`。Provider 缺少任一 required capability 时 Policy 必须 deny；禁止降级为用户个人 Profile 或无网络约束 Chrome。

### 10.3 Assertion Evaluator

```ts
type AssertionResult = {
  assertion_id: string;
  assertion_type: AssertionSpec["type"];
  required: boolean;
  outcome: "passed" | "failed" | "not_evaluated" | "error";
  expected?: unknown;
  actual?: unknown;
  reason_code?: string;
  observation_ref: DigestBoundRef<"qa.backend-observation/v1">;
  evidence_refs: DigestBoundRef<"qa.artifact-pointer/v1">[];
};

type RunnerAssertionEvaluator = {
  evaluate(input: { step: PlanStep; observation: BackendObservation }): Promise<AssertionResult[]>;
};
```

判定规则：

1. Backend protocol error 必须使受影响 Case 至少为 `error`，禁止判定为 passed。
2. required assertion 必须按 §6.2 聚合；optional assertion 失败必须记录但不得独自使 Case failed，除非 Case 策略另有明确规则。
3. assertion 无法执行且无允许的 fallback 时，Case 必须为 inconclusive 或 error，禁止默认通过。
4. Codex 生成的解释可以作为 Evidence，但不得作为唯一 assertion actual。

### 10.4 CaseResult

```ts
type CaseResult = ContractMeta & {
  case_result_id: string;
  case_id: string;
  suite_id?: string;
  plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
  step_ids: string[];
  assertion_ids: string[];
  evidence_requirement_ids: string[];
  outcome: "passed" | "failed" | "error" | "skipped" | "inconclusive";
  assertion_results: AssertionResult[];
  attempts_by_step: Record<string, number>;
  duration_ms: number;
  observation_refs: DigestBoundRef<"qa.backend-observation/v1">[];
  evidence_refs: DigestBoundRef<"qa.artifact-pointer/v1">[];
  failure_hint?: {
    classification_candidates: FailureClassification[];
    reason_codes: string[];
  };
};
```

CaseResult 必须包含 PlanCase 声明的全部 assertion id 和 evidence requirement id；不得附加其他 Case 的结果。`skipped` 必须有 Plan 条件或取消/超时原因，禁止把未执行 Case 伪装为 passed。

---

## 11. Artifact、Evidence 与 Cleanup 契约

### 11.1 ArtifactPointer

```ts
type ArtifactPointer = ContractMeta & {
  artifact_id: string;
  media_type: string;
  byte_size: number;
  byte_digest: Sha256;
  storage:
    | { type: "local"; runtime_instance_id: string; opaque_path_token: string }
    | { type: "encrypted_object"; provider: string; object_key: string; encryption_key_ref: string }
    | { type: "inline"; encoding: "base64"; data: string };
  access_scope: { readers: string[]; expires_at?: ISO8601 };
  retention: { policy_id: string; delete_after?: ISO8601; legal_hold: boolean };
};
```

`opaque_path_token` 禁止暴露用户真实绝对路径。跨设备上传必须在本地完成脱敏和 digest 计算后进行。

### 11.2 EvidenceManifest

```ts
type EvidenceRequirementFulfillment =
  | {
      status: "fulfilled";
      requirement_id: string;
      artifact_refs: [DigestBoundRef<"qa.artifact-pointer/v1">, ...DigestBoundRef<"qa.artifact-pointer/v1">[]];
      assertion_ids: string[];
      fulfilled_at: ISO8601;
    }
  | {
      status: "missing";
      requirement_id: string;
      required: boolean;
      reason_code: string;
    }
  | {
      status: "failed";
      requirement_id: string;
      required: boolean;
      error: ErrorEnvelope;
    }
  | {
      status: "not_required";
      requirement_id: string;
      required: false;
      reason_code: "case_not_applicable" | "step_not_executed_by_plan";
    };

type EvidenceManifest = ContractMeta & {
  manifest_id: string;
  plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
  case_result_refs: DigestBoundRef<"qa.case-result/v1">[];
  requirement_fulfillments: EvidenceRequirementFulfillment[];
  artifacts: Array<{
    pointer: ArtifactPointer;
    requirement_ids: string[];
    type: EvidenceRequirement["type"];
    step_ids: string[];
    case_ids: string[];
    assertion_ids: string[];
    redaction: {
      status: "not_required" | "completed" | "failed";
      policy_ref: DigestBoundRef<"qa.redaction-policy/v1">;
      findings_count: number;
    };
  }>;
  evidence_outcome: "sufficient" | "partial" | "insufficient";
};
```

Manifest 必须对 Plan 中每个 EvidenceRequirement 恰好有一项 fulfillment，禁止遗漏、重复或引用未知 requirement。required requirement 只有 `fulfilled` 才满足；`missing`、`failed` 或非法 `not_required` 必须使 Evidence 非 sufficient。Artifact 必须反向列出所满足 requirement/case/step/assertion，且这些关联必须与 Plan 一致。

Secret、Authorization header、cookie、access token、Keychain 数据、用户目录路径和未批准个人数据必须在上传和发布前脱敏。脱敏失败时 Artifact 不得进入 Publication allowlist，Evidence 不得标记为 sufficient。

### 11.3 CleanupReceipt、Residual 与 Preserved Resource

```ts
type CleanupReason =
  | "design_completed"
  | "design_failed"
  | "execution_completed"
  | "execution_failed"
  | "cancelled"
  | "timed_out"
  | "runtime_lost"
  | "runtime_restart_recovery"
  | "amendment_pause"
  | "manual_repair";

type CleanupResidual = {
  resource: ResourceRef;
  category: InventoryResource["category"];
  attempted_action: InventoryResource["cleanup_action"];
  reason_code: string;
  exposure: "none" | "local_only" | "network_reachable" | "credential_active" | "unknown";
  retryable: boolean;
  repair_required: boolean;
  last_error?: ErrorEnvelope;
};

type PreservedResource = {
  resource: ResourceRef;
  preservation_reason: "artifact_retention" | "audit_hold" | "user_requested" | "forensic_hold";
  retention_policy_ref: DigestBoundRef<"qa.retention-policy/v1">;
  delete_after?: ISO8601;
  custodian: ActorRef;
};

type CleanupReceipt = ContractMeta & {
  receipt_id: string;
  capability_ref: DigestBoundRef<"qa.cleanup-capability/v1">;
  resource_inventory_ref: DigestBoundRef<"qa.resource-inventory/v1">;
  resource_inventory_digest: Sha256;
  reason: CleanupReason;
  started_at: ISO8601;
  completed_at: ISO8601;
  resources: Array<{
    resource: ResourceRef;
    action: "terminate" | "delete" | "revoke" | "release" | "preserve";
    outcome: "succeeded" | "failed" | "not_found" | "skipped";
    retryable: boolean;
    error?: ErrorEnvelope;
  }>;
  credential_receipt_refs: DigestBoundRef<"qa.credential-lease-receipt/v1">[];
  termination_receipt_refs: DigestBoundRef<"qa.termination-receipt/v1">[];
  residuals: CleanupResidual[];
  preserved_resources: PreservedResource[];
  outcome: "succeeded" | "partially_succeeded" | "failed" | "not_required";
  next_retry_at?: ISO8601;
};
```

Cleanup 必须按 Run ownership tag、sealed inventory digest 和 CleanupCapability 操作，禁止按端口号、进程名或路径模糊匹配其他 Run。`not_found` 在资源已由前次重试释放时视为幂等成功。

闭合规则：

- `succeeded` 要求 inventory 中每项均为 succeeded/not_found，或进入合法 `preserved_resources`，且没有 residual。
- `partially_succeeded` 要求至少一项已处理且至少一个 residual；所有 residual 必须给出 exposure、retryable 和 repair_required。
- `failed` 表示 inventory 无法可信解析、capability 不足或 Cleanup 无法取得任何确定进展，必须进入 `cleanup_repair`。
- `not_required` 只允许 Source/Approval/Policy 阶段尚未创建任何本地资源，且必须由空 inventory digest 或等价权威证明支持。
- preserved resource 不是 residual，但必须有 retention policy、custodian 和最终删除/解除 hold 的后续责任；活跃 CredentialLease、网络可达进程和浏览器 Profile 禁止 preserve。
- `terminal` 前所有 credential lease 必须有 `status="settled"` receipt；任何 `credential_active` residual 都阻止操作完成并触发最高优先级 repair。

### 11.4 ArtifactStore Interface

```ts
type ArtifactStore = {
  put(input: {
    run_id: UUID;
    bytes_or_file_ref: unknown;
    metadata: Omit<ArtifactPointer, keyof ContractMeta | "artifact_id" | "storage">;
    idempotency_key: string;
  }): Promise<ArtifactPointer>;
  get(pointer: ArtifactPointer, actor: ActorRef): Promise<unknown>;
  delete(pointer: ArtifactPointer, reason: string): Promise<{ deleted: boolean }>;
};
```

---

## 12. Quality、Publication 与 PQL 契约

### 12.1 FailureClassification

```ts
type FailureClassification =
  | "product_defect"
  | "test_failure"
  | "coverage_gap"
  | "environment_failure"
  | "flaky"
  | "policy_blocked"
  | "insufficient_evidence";
```

### 12.2 QualityEvaluation

```ts
type QualityRuleSet = {
  rule_set_id: string;
  version: string;
  digest: Sha256;
};

type QualityClassification = {
  classification: FailureClassification;
  confidence: number; // 0..1
  case_ids: string[];
  reason_codes: string[];
  evidence_refs: DigestBoundRef<"qa.artifact-pointer/v1">[];
};

type ExecutedQualityEvaluation = ContractMeta & {
  kind: "executed";
  evaluation_id: string;
  run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
  source_acquisition_ref: DigestBoundRef<"qa.source-acquisition/v1">;
  plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
  case_result_refs: DigestBoundRef<"qa.case-result/v1">[];
  evidence_manifest_refs: DigestBoundRef<"qa.evidence-manifest/v1">[];
  cleanup_receipt_refs: DigestBoundRef<"qa.cleanup-receipt/v1">[];
  input_set_digest: Sha256;
  rule_set: QualityRuleSet;
  evaluated_at: ISO8601;
  supersedes_ref?: DigestBoundRef<"qa.quality-evaluation/v1">;
  case_summary: {
    total: number;
    passed: number;
    failed: number;
    error: number;
    skipped: number;
    inconclusive: number;
  };
  coverage: {
    required_scope_digest: Sha256;
    executed_scope_digest: Sha256;
    status: "satisfied" | "partial" | "not_satisfied";
    missing: string[];
  };
  classifications: QualityClassification[];
  execution_outcome: Exclude<ExecutionOutcome, "blocked">;
  cleanup_outcome: CleanupOutcome;
  evidence_outcome: EvidenceOutcome;
  final_quality_outcome: "pass" | "fail" | "inconclusive";
  publication_eligibility: {
    github: boolean;
    pql: boolean;
    reason_codes: string[];
  };
  dedup_key: string;
  rationale_codes: string[];
};

type NonExecutedQualityEvaluation = ContractMeta & {
  kind: "non_executed";
  evaluation_id: string;
  run_draft_ref: DigestBoundRef<"qa.run-draft/v1">;
  run_spec_ref?: DigestBoundRef<"qa.runspec/v1">;
  source_acquisition_ref?: DigestBoundRef<"qa.source-acquisition/v1">;
  policy_decision_ref?: DigestBoundRef<"qa.policy-decision/v1">;
  cleanup_receipt_refs: DigestBoundRef<"qa.cleanup-receipt/v1">[];
  reason: "source_blocked" | "design_denied" | "policy_denied" | "execution_denied" | "cancelled_before_execution";
  input_set_digest: Sha256;
  rule_set: QualityRuleSet;
  evaluated_at: ISO8601;
  execution_outcome: "blocked" | "cancelled";
  cleanup_outcome: CleanupOutcome;
  evidence_outcome: "not_available";
  final_quality_outcome: "blocked" | "inconclusive";
  publication_eligibility: {
    github: boolean;
    pql: boolean;
    reason_codes: string[];
  };
  dedup_key: string;
  rationale_codes: string[];
};

type QualityEvaluation = ExecutedQualityEvaluation | NonExecutedQualityEvaluation;
```

`quality-evaluation` 必须按 §3.5 严格判别 executed/non-executed variant。规则集和排序后的输入引用必须参与 `input_set_digest`，使同一输入和规则可以重放。Final Quality Outcome 在 Publication 前确定，Publication、Cleanup repair 或 PQL Promotion 的失败禁止原地改写既有 Evaluation；规则变化必须生成带 `supersedes_ref` 的新对象。

### 12.3 PublicationPlan

```ts
type PublicationAction =
  | {
      type: "github_check";
      repository: string;
      github_head_sha: string;
      tested_effective_sha: string;
      conclusion: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required";
      title: string;
      summary_ref: DigestBoundRef<"qa.artifact-pointer/v1">;
    }
  | {
      type: "pr_comment";
      repository: string;
      pr_number: number;
      body_ref: DigestBoundRef<"qa.artifact-pointer/v1">;
    }
  | {
      type: "product_issue";
      repository: string;
      title: string;
      body_ref: DigestBoundRef<"qa.artifact-pointer/v1">;
      labels: string[];
      reproduction_digest: Sha256;
    }
  | {
      type: "pql_feedback";
      quality_evaluation_ref: DigestBoundRef<"qa.quality-evaluation/v1">;
    };

type PublicationPlan = ContractMeta & {
  publication_plan_id: string;
  quality_evaluation_ref: DigestBoundRef<"qa.quality-evaluation/v1">;
  publication_policy_ref: DigestBoundRef<"qa.publication-policy/v1">;
  authorized_artifact_refs: DigestBoundRef<"qa.artifact-pointer/v1">[];
  actions: Array<{
    action_id: string;
    dedup_key: string;
    rendered_content_digest: Sha256;
    action: PublicationAction;
    precondition_codes: string[];
  }>;
};
```

PublicationPlan 中的 body/summary/evidence reference 必须全部来自 `authorized_artifact_refs`，且不得与 `RunSpec.publication_intent` 或 QualityEvaluation eligibility 冲突。GitHub 与 PQL 必须作为独立 Action 存在，不能因一个目标失败阻断另一个目标。

### 12.4 PublicationReceipt

```ts
type PublicationActionReceipt = {
  action_id: string;
  dedup_key: string;
  attempt: number;
  rendered_content_digest: Sha256;
  previous_receipt_ref?: DigestBoundRef<"qa.publication-receipt/v1">;
  outcome: "published" | "updated" | "skipped" | "failed" | "repair_backlog";
  external_ref?: string;
  observed_external_version?: string;
  reconciliation: "created" | "matched_existing" | "updated_existing" | "not_found" | "conflict";
  retryable: boolean;
  retry_budget_exhausted: boolean;
  error?: ErrorEnvelope;
};

type PublicationReceipt = ContractMeta & {
  receipt_id: string;
  publication_plan_ref: DigestBoundRef<"qa.publication-plan/v1">;
  actions: PublicationActionReceipt[];
  outcome: "published" | "partially_published" | "failed" | "skipped" | "settled_with_repair";
  settled_at: ISO8601;
};
```

每个 Action 必须单独达到 published/updated/skipped、不可重试 failed、重试预算耗尽或明确移交 repair backlog 后才算 settled。Repair 只追加新的 Action Receipt，不得重新执行测试或修改 QualityEvaluation。

### 12.5 CoverageGap、Proposal、Review 与 Promotion

```ts
type CoverageGap = ContractMeta & {
  gap_id: string;
  source_run_ref: DigestBoundRef<"qa.runspec/v1">;
  quality_evaluation_ref: DigestBoundRef<"qa.quality-evaluation/v1">;
  project_pack_ref?: DigestBoundRef<"pql.project-pack/v1">;
  gap_type:
    | "missing_case"
    | "missing_scope"
    | "stale_selector"
    | "fixture_gap"
    | "oracle_gap"
    | "evidence_gap"
    | "flaky_pattern";
  affected_scope: string[];
  observed_case_ids: string[];
  evidence_refs: DigestBoundRef<"qa.artifact-pointer/v1">[];
  severity: "low" | "medium" | "high";
  dedup_key: string;
};

type AssetChangeProposal = ContractMeta & {
  proposal_id: string;
  coverage_gap_ref: DigestBoundRef<"pql.coverage-gap/v1">;
  target_project_pack: {
    id: string;
    base_version: string;
    base_digest: Sha256;
  };
  changes: Array<{
    asset_type: "case" | "fixture" | "selector" | "oracle" | "scope_policy";
    operation: "add" | "update" | "remove";
    asset_id?: string;
    design_only: true;
    proposed_content_ref: DigestBoundRef<"pql.proposed-content/v1">;
    rationale: string;
  }>;
};

type PQLReviewDecision = ContractMeta & {
  review_id: string;
  proposal_ref: DigestBoundRef<"pql.asset-change-proposal/v1">;
  reviewer: ActorRef;
  decision: "approved" | "rejected";
  check_refs: DigestBoundRef[];
  decided_at: ISO8601;
  reason_codes: string[];
};

type ProjectPackPromotionReceipt = ContractMeta & {
  promotion_id: string;
  proposal_ref: DigestBoundRef<"pql.asset-change-proposal/v1">;
  review_decision_ref: DigestBoundRef<"pql.review-decision/v1">;
  base_pack_ref: DigestBoundRef<"pql.project-pack/v1">;
  promoted_pack_ref: DigestBoundRef<"pql.project-pack/v1">;
  outcome: "promoted" | "conflict" | "failed";
  promoted_at?: ISO8601;
  error?: ErrorEnvelope;
};
```

Proposal 创建后不可原地变为 approved。只有绑定同一 proposal digest 的 approved PQLReviewDecision 和成功 ProjectPackPromotionReceipt 才能产生可执行资产。Promotion 必须校验 base pack digest；新 Project Pack 禁止回灌当前 Run，只能成为后续 Run 的 Source/Design 输入。

### 12.6 Adapter Interfaces

```ts
type QualityEvaluator = {
  evaluateExecuted(input: {
    run_spec_ref: DigestBoundRef<"qa.runspec/v1">;
    plan_ref: DigestBoundRef<"qa.structured-plan/v1">;
    case_result_refs: DigestBoundRef<"qa.case-result/v1">[];
    evidence_manifest_refs: DigestBoundRef<"qa.evidence-manifest/v1">[];
    cleanup_receipt_refs: DigestBoundRef<"qa.cleanup-receipt/v1">[];
    rule_set: QualityRuleSet;
  }): Promise<ExecutedQualityEvaluation>;
  evaluateNonExecuted(input: {
    run_draft_ref: DigestBoundRef<"qa.run-draft/v1">;
    reason: NonExecutedQualityEvaluation["reason"];
    related_refs: DigestBoundRef[];
    cleanup_receipt_refs: DigestBoundRef<"qa.cleanup-receipt/v1">[];
    rule_set: QualityRuleSet;
  }): Promise<NonExecutedQualityEvaluation>;
};

type PublicationAdapter = {
  plan(input: {
    evaluation: QualityEvaluation;
    publication_policy_ref: DigestBoundRef<"qa.publication-policy/v1">;
    authorized_artifact_refs: DigestBoundRef<"qa.artifact-pointer/v1">[];
  }): Promise<PublicationPlan>;
  publish(plan: PublicationPlan): Promise<PublicationReceipt>;
  repair(input: {
    plan: PublicationPlan;
    previous_receipt: PublicationReceipt;
    action_ids: string[];
  }): Promise<PublicationReceipt>;
};

type PQLFeedbackAdapter = {
  deriveGaps(evaluation: QualityEvaluation): Promise<CoverageGap[]>;
  proposeChanges(gap: CoverageGap): Promise<AssetChangeProposal | null>;
  recordReview(decision: PQLReviewDecision): Promise<void>;
  promote(input: {
    proposal: AssetChangeProposal;
    review: PQLReviewDecision;
    idempotency_key: string;
  }): Promise<ProjectPackPromotionReceipt>;
};
```

---

## 13. Workflow 状态机

### 13.1 状态定义

```ts
type WorkflowState =
  | "created"
  | "source_resolving"
  | "design_approval_pending"
  | "designing"
  | "design_cleaning_up"
  | "policy_review"
  | "execution_approval_pending"
  | "dispatching"
  | "preparing"
  | "ready"
  | "executing"
  | "collecting_evidence"
  | "amendment_pending"
  | "amendment_cleaning_up"
  | "amendment_designing"
  | "blocked"
  | "cancelling"
  | "timing_out"
  | "recovering"
  | "cleaning_up"
  | "cleanup_repair_pending"
  | "evaluating"
  | "publishing"
  | "publication_repair_pending"
  | "finalizing"
  | "terminal";
```

### 13.2 主流程

```text
created
→ source_resolving
→ design_approval_pending
→ designing
→ design_cleaning_up
→ policy_review
→ execution_approval_pending
→ dispatching
→ preparing
→ ready
→ executing
→ collecting_evidence
→ cleaning_up
→ evaluating
→ publishing
→ finalizing
→ terminal
```

`WorkflowState` 是 hosted 持久编排状态；`RuntimeRunState` 是设备侧快照。两者必须通过 fenced RuntimeEvent、Checkpoint 和 Receipt 关联，禁止按名称直接映射。

### 13.3 转移表

| 当前状态 | 事件/条件 | 下一状态 | 必须持久化的输出 |
|---|---|---|---|
| `created` | RunDraft 持久化 | `source_resolving` | RunDraft、创建幂等键。 |
| `source_resolving` | SourceAcquisition acquired，RunSpec 冻结 | `design_approval_pending` | SourceAcquisition、SourceRevision、RunSpec。 |
| `source_resolving` | blocked/failed | `blocked` | SourceAcquisition、ErrorEnvelope、reason code。 |
| `design_approval_pending` | approved Evidence 验证成功，Design Grant 签发 | `designing` | DesignPolicyDecision、DesignApprovalEvidence、Design Grant、ExecutionFence。 |
| `design_approval_pending` | denied/expired | `blocked` | Evidence 或 expiry reason、审计。 |
| `designing` | Plan 生成或设计失败 | `design_cleaning_up` | StructuredPlan/plan error、DesignEnvironmentReceipt、inventory。 |
| `design_cleaning_up` | Design Cleanup succeeded/not_required | `policy_review` 或 `blocked` | Design CleanupReceipt；失败时保留 design error。 |
| `design_cleaning_up` | Cleanup 有 residual | `cleanup_repair_pending` | CleanupReceipt、repair resume state=`policy_review|blocked`。 |
| `policy_review` | policy deny | `blocked` | PolicyDecision。 |
| `policy_review` | policy allow，需取得 ExecutionApprovalEvidence | `execution_approval_pending` | PolicyDecision、approved envelope、approval request digest。 |
| `execution_approval_pending` | approved Evidence 验证成功，Execution Grant 签发 | `dispatching` | ExecutionApprovalEvidence、Execution Grant、新 fence；Amendment 上下文同时冻结完整 PlanAmendment 与 ResumeDirective。 |
| `execution_approval_pending` | denied/expired | `blocked` | Evidence 或 expiry reason、审计。 |
| `dispatching` | Runtime 接受 fenced command | `preparing` | command receipt、runtime instance、local lease/fence。 |
| `dispatching` | device offline/Grant expired/dispatch deadline | `blocked` | dispatch reason；禁止静默换设备或本地续期。 |
| `preparing` | Prepare 和 Readiness ready | `ready` | PreparedEnvironment、ReadinessReceipt、inventory、CleanupCapability。 |
| `preparing` | prepare/readiness 失败 | `cleaning_up` | ErrorEnvelope、inventory、CleanupCapability。 |
| `ready` | runner 开始 | `executing` | StepAttempt checkpoint。 |
| `executing` | 新动作超 envelope | `amendment_pending` | PlanAmendmentRequest、checkpoint、inventory。 |
| `executing` | 执行结束 | `collecting_evidence` | CaseResult、Observation、StepAttempt Receipt。 |
| `amendment_pending` | quiesce 完成，旧 Grant 撤销且旧 generation fenced | `amendment_cleaning_up` | revocation receipt、old fence、checkpoint。 |
| `amendment_cleaning_up` | Cleanup amendment_pause succeeded | `amendment_designing` | CleanupReceipt、TerminationReceipt、CredentialLeaseReceipt。 |
| `amendment_cleaning_up` | Cleanup 有 blocking residual | `cleanup_repair_pending` | CleanupReceipt、repair resume state=`amendment_designing`。 |
| `amendment_designing` | 新 Design Approval/Grant、Plan vN、Diff 和 Design Cleanup 完成 | `policy_review` | Plan vN、PlanDiff、amendment Design Evidence/Grant、Design CleanupReceipt；PlanAmendment 尚未冻结。 |
| `amendment_pending` 或 `amendment_designing` | 用户/Policy 拒绝 | `cleaning_up` 或 `evaluating` | blocked reason；有资源时先 Cleanup。 |
| `collecting_evidence` | Manifest 完成或失败 | `cleaning_up` | EvidenceManifest 或 evidence error。 |
| 资源持有型非终态 | cancel_requested | `cancelling` | cancellation intent、requested_at、current fence。 |
| `cancelling` | TerminationReceipt settled | `cleaning_up` | TerminationReceipt、inventory。 |
| 资源持有型非终态 | deadline_exceeded | `timing_out` | timeout intent、absolute deadline、current fence。 |
| `timing_out` | 进程域终止已确认或超出强制终止预算 | `cleaning_up` | TerminationReceipt 或 cancellation_unconfirmed error。 |
| 无本地资源的非终态 | cancel_requested/deadline_exceeded | `evaluating` | non-executed reason、not_required CleanupReceipt。 |
| 依赖 Runtime 且副作用状态不确定的状态 | Runtime lost/restart | `recovering` | last cursor、Checkpoint、Snapshot、inventory、new fence request。 |
| `recovering` | RecoveryDecision=wait/resume/advance_from_receipt | 原有安全阶段 | RecoveryDecision、新 generation/fence、reconciled snapshot。 |
| `recovering` | RecoveryDecision=replay_cleanup | `cleaning_up` | CleanupCapability、inventory、new fence。 |
| `recovering` | RecoveryDecision=irreconcilable | `cleaning_up` 或 `evaluating` | recovery error；有资源时先 Cleanup。 |
| `cleaning_up` | Cleanup succeeded/not_required | `evaluating` | 全部 CleanupReceipt、settled lease/termination receipt。 |
| `cleaning_up` | Cleanup partial/failed 且需重试或移交 | `cleanup_repair_pending` | CleanupResidual、retry budget、escalation。 |
| `cleanup_repair_pending` | repair succeeded，或失败已不可重试且责任已移交 | 保存的 resume state 或 `evaluating` | Repair Receipt、residual disposition、告警。 |
| `blocked` | 无本地资源或 Cleanup 已 settled | `evaluating` | NonExecutedQualityEvaluation 输入。 |
| `blocked` | 已有本地资源 | `cleaning_up` | inventory、CleanupCapability。 |
| `evaluating` | QualityEvaluation 产生且允许发布 | `publishing` | immutable QualityEvaluation。 |
| `evaluating` | QualityEvaluation 产生且 publication skipped | `finalizing` | QualityEvaluation、skipped PublicationReceipt。 |
| `publishing` | 所有 Action settled | `finalizing` | PublicationReceipt。 |
| `publishing` | 可重试失败或 repair backlog | `publication_repair_pending` | PublicationReceipt、retry budget。 |
| `publication_repair_pending` | Action settled/移交 | `finalizing` | 追加 PublicationReceipt、repair disposition。 |
| `finalizing` | 强制 Receipt、五类 Outcome 和 residual disposition 校验完成 | `terminal` | final snapshot、settled_at。 |

### 13.4 状态机约束与事件优先级

- `terminal` 必须不可逆。terminal 后的 Cleanup/Publication repair 只能创建关联 repair operation 和追加 Receipt，禁止重新进入执行或改写既有 QualityEvaluation。
- 已持久化的 `cancel_requested` 或 `deadline_exceeded` 优先于 Amendment、Step completion 和普通 retry；后到的完成事件只能用于对账。
- 旧 generation 或错误 fencing token 的 command/event/Receipt 即使 sequence 更大，也不得推进 workflow、覆盖 Checkpoint 或启动 Step。
- 断线本身不立即产生 `execution_outcome=lost`；只有 Snapshot、inventory 和 effect ledger 无法对账且 RecoveryDecision=irreconcilable 时才能判定 lost。
- Runtime restart 必须先取得新 local lease/fence并上报 Snapshot；禁止仅凭本地 Checkpoint 自动恢复执行。
- CleanupReceipt 的存在不等于 Cleanup 完成。只有 succeeded/not_required，或 residual 已达到不可重试/预算耗尽且明确移交 repair responsibility，才可继续。
- Amendment 必须创建新的 Design/Execution Grant、新 generation 和新 Sandbox；禁止恢复旧 Sandbox。Source revision 变化禁止走 Amendment，必须创建新 Run。
- Publication 失败不得重跑测试；用户显式 rerun 必须创建新的 `run_id`。

---

## 14. 五类 Outcome、质量结论与失败分类

### 14.1 Outcome 类型

```ts
type ExecutionOutcome = "passed" | "failed" | "cancelled" | "timed_out" | "lost" | "blocked";
type CleanupOutcome = "succeeded" | "partially_succeeded" | "failed" | "not_required";
type EvidenceOutcome = "sufficient" | "partial" | "insufficient" | "not_available";
type PublicationOutcome = "published" | "partially_published" | "failed" | "skipped";
type FinalQualityOutcome = "pass" | "fail" | "blocked" | "inconclusive";

type RunOutcomes = ContractMeta & {
  execution_outcome: ExecutionOutcome;
  cleanup_outcome: CleanupOutcome;
  evidence_outcome: EvidenceOutcome;
  publication_outcome: PublicationOutcome;
  final_quality_outcome: FinalQualityOutcome;
};

type RunSettlement = ContractMeta & {
  outcomes_ref: DigestBoundRef<"qa.run-outcomes/v1">;
  cleanup_receipt_refs: DigestBoundRef<"qa.cleanup-receipt/v1">[];
  publication_receipt_refs: DigestBoundRef<"qa.publication-receipt/v1">[];
  residual_refs: ResourceRef[];
  status: "settled" | "settled_with_repair";
  repair_operation_refs: DigestBoundRef<"qa.repair-operation/v1">[];
  settled_at: ISO8601;
};

type RepairOperation = ContractMeta & {
  repair_id: string;
  original_run_id: UUID;
  type: "cleanup" | "publication";
  target_refs: DigestBoundRef[];
  attempt: number;
  outcome: "succeeded" | "failed" | "partially_succeeded";
  receipt_refs: DigestBoundRef[];
  completed_at?: ISO8601;
};
```

`terminal` 表示 RunSettlement 已持久化，不表示五类 Outcome 全部成功。RepairOperation 是与原 Run 关联的新操作记录，禁止改变原 `run_id` 的 terminal snapshot、FinalQualityOutcome 或已完成 Step。

### 14.2 映射原则

- Case 全部通过、覆盖满足、Evidence sufficient，且没有产品质量阻断时，Final Quality 可以为 `pass`。
- assertion failed 且可归类为产品缺陷时，Final Quality 必须为 `fail`。
- Policy 拒绝、Grant 拒绝或用户拒绝执行时，Final Quality 必须为 `blocked`。
- 环境失败、Evidence 不足、Flaky 未决或测试自身失败时，Final Quality 应为 `inconclusive`，除非策略明确要求 fail closed。
- Cleanup failure 必须单独记录并触发运维告警；它不应把已确定的产品测试 pass 自动改成 product fail，但可以阻止 Run 被视为操作完成。
- Publication failure 禁止改变既有 QualityEvaluation，只改变 `publication_outcome`。

### 14.3 Failure Classification 规则

| 分类 | 必要条件 | 默认路由 |
|---|---|---|
| `product_defect` | 固定 revision 可复现、结构化 assertion 失败、Evidence sufficient、排除测试与环境问题 | 被测项目 Issue，可选 PR Check failure。 |
| `test_failure` | Test code、Fixture、Selector 或 Oracle 自身错误 | PQL Issue / Asset Proposal。 |
| `coverage_gap` | 必需用户场景、Scope 或 Case 未执行/不存在 | PQL CoverageGap。 |
| `environment_failure` | Workspace、依赖、App、Middleware、Browser、网络或设备不可用 | Run 记录；重复发生时平台 Issue。 |
| `flaky` | 同一 effective SHA、Plan、输入和环境结果不稳定 | PQL Flaky 记录；不自动建产品 Issue。 |
| `policy_blocked` | Policy 或 Grant 明确禁止动作 | Run 审计；必要时 PlanAmendment。 |
| `insufficient_evidence` | 缺少 required log/trace/screenshot/assertion actual | Run 记录 + PQL Evidence Gap。 |

---

## 15. 错误 Envelope 与错误目录

### 15.1 ErrorEnvelope

```ts
type ErrorPhase =
  | "source_resolution"
  | "authorization"
  | "design"
  | "policy"
  | "dispatch"
  | "prepare"
  | "readiness"
  | "execute"
  | "evidence"
  | "cleanup"
  | "quality"
  | "publication"
  | "recovery";

type ErrorEnvelope = ContractMeta & {
  error_id: string;
  code: string;
  message: string;
  retryable: boolean;
  phase: ErrorPhase;
  severity: "info" | "warning" | "error" | "critical";
  details?: Record<string, unknown>;
  cause_ref?: ResourceRef;
  step_id?: string;
  attempt?: number;
  occurred_at: ISO8601;
};
```

`message` 必须可安全展示，不得包含 Secret、token、cookie、Authorization header 或用户绝对路径。敏感诊断必须只通过受限 ArtifactPointer 保存。

### 15.2 最小错误目录

| Code | Retryable | 处理要求 |
|---|---:|---|
| `contract.unsupported_version` | 否 | 阻止执行，等待组件升级。 |
| `contract.unsupported_enum` | 否 | 拒绝未知 enum，禁止映射默认值。 |
| `contract.invalid_variant` | 否 | 拒绝未知 discriminator 或缺失 variant required 字段。 |
| `contract.forbidden_field` | 否 | 拒绝混入其他 variant 或安全边界未声明字段。 |
| `contract.digest_mismatch` | 否 | 安全阻断并审计。 |
| `source.draft_digest_mismatch` | 否 | 拒绝 Acquisition，保持 RunDraft 不变。 |
| `source.acquisition_failed` | 条件 | 按 SourceAcquisition failed variant 进入 blocked 或重试 resolver。 |
| `source.object_unavailable` | 条件 | 禁止回退到浮动 ref；在 retention 内修复对象。 |
| `source.retention_expired` | 否 | 原 Run 不可再执行；创建新 Run。 |
| `source.merge_conflict` | 否 | blocked，禁止只测 head。 |
| `source.effective_sha_mismatch` | 否 | 终止并 Cleanup。 |
| `approval.invalid_signature` | 否 | 禁止签发 Grant。 |
| `approval.variant_mismatch` | 否 | Design/Execution Evidence 用途不匹配，禁止消费。 |
| `approval.request_digest_mismatch` | 否 | 批准对象与 challenge 不一致，重新请求批准。 |
| `approval.scope_mismatch` | 否 | 禁止签发 Grant。 |
| `grant.invalid_signature` | 否 | Runtime 拒绝命令。 |
| `grant.invalid_variant` | 否 | Design/Execution Grant 字段或 scope 不合法。 |
| `grant.sequence_stale` | 否 | 拒绝旧 sequence 并审计。 |
| `grant.device_mismatch` | 否 | 禁止换绑设备。 |
| `grant.policy_mismatch` | 否 | 禁止执行与 PolicyDecision 不一致的 envelope。 |
| `grant.expired` | 条件 | 返回 hosted 重新授权，禁止本地续期。 |
| `grant.replayed` | 否 | 拒绝并触发安全审计。 |
| `grant.revoked` | 否 | 立即停止未开始动作；CleanupCapability 仍可清理。 |
| `plan.digest_mismatch` | 否 | 阻止执行。 |
| `plan.case_orphan` | 否 | 拒绝未关联 Case 的执行 Step。 |
| `plan.assertion_reference_invalid` | 否 | 拒绝未知或跨 Case assertion。 |
| `plan.evidence_requirement_invalid` | 否 | 拒绝未知、重复或非法 not_required requirement。 |
| `plan.amendment_required` | 是 | 进入 `amendment_pending`，不是普通 Step retry。 |
| `plan.amendment_cleanup_incomplete` | 是 | 阻止新 Sandbox，先 repair 旧环境 residual。 |
| `policy.denied` | 否 | blocked。 |
| `runtime.unhealthy` | 是 | 重试或重新选择设备；设备变化必须重新批准。 |
| `runtime.version_incompatible` | 否 | 请求升级或选择兼容设备。 |
| `runtime.stale_fence` | 否 | 拒绝旧 generation command。 |
| `runtime.command_conflict` | 否 | 相同幂等键不同 payload digest，安全阻断。 |
| `runtime.event_generation_stale` | 否 | 事件仅留审计，不推进 workflow。 |
| `runtime.command_deadline_exceeded` | 否 | 进入 timing_out/cleanup，禁止迟到启动。 |
| `runtime.cancellation_unconfirmed` | 是 | 强制 reconcile process domain 并进入 Cleanup repair。 |
| `sandbox.create_failed` | 是 | Cleanup 已登记资源。 |
| `sandbox.scope_violation` | 否 | Local PEP 在副作用前阻断并安全审计。 |
| `credential.lease_expired` | 条件 | 禁止注入，必要时重新审批后签发新 lease。 |
| `credential.revocation_failed` | 是 | 标记 credential_active residual，最高优先级 repair。 |
| `readiness.timeout` | 条件 | 按 Plan retry 后 Cleanup。 |
| `backend.protocol_error` | 条件 | Case error，不得默认通过。 |
| `backend.cancel_timeout` | 是 | 强制终止进程组并要求 TerminationReceipt。 |
| `evidence.redaction_failed` | 条件 | Evidence insufficient，禁止发布敏感内容。 |
| `cleanup.capability_invalid` | 否 | 拒绝清理请求并安全审计。 |
| `cleanup.inventory_digest_mismatch` | 否 | 停止清理，先 reconcile sealed inventory。 |
| `cleanup.blocking_residual` | 是 | 进入 cleanup_repair_pending，阻止新执行环境。 |
| `cleanup.partial_failure` | 是 | 保存 CleanupResidual 并单独重试。 |
| `quality.inputs_incomplete` | 否 | 禁止生成确定性质量结论。 |
| `quality.rule_unsupported` | 否 | 保留输入，等待支持对应 rule set。 |
| `publication.evaluation_mismatch` | 否 | 拒绝与 QualityEvaluation 不匹配的计划。 |
| `publication.artifact_not_authorized` | 否 | 拒绝发布 allowlist 外 Artifact。 |
| `publication.conflict` | 是 | 通过 dedup key 查询既有对象再 reconcile。 |
| `pql.review_required` | 否 | 未批准 Proposal 禁止 Promotion。 |
| `pql.review_stale_base` | 是 | 重新基于最新 Project Pack 生成 Proposal/Review。 |
| `pql.promotion_digest_mismatch` | 否 | 拒绝发布内容不匹配的 Project Pack。 |
| `pql.promotion_conflict` | 是 | 对账并发 pack 更新，禁止覆盖。 |
| `recovery.sequence_gap` | 是 | 请求 Runtime snapshot。 |
| `recovery.snapshot_fence_mismatch` | 否 | 拒绝用旧 Snapshot 恢复。 |
| `recovery.irreconcilable` | 否 | 进入 lost + Cleanup/repair，并要求人工审计。 |

---

## 16. 幂等、重试、并发与恢复

### 16.1 幂等键

所有副作用必须使用以下稳定键或等价结构：

| 副作用 | 幂等键 |
|---|---|
| 创建 RunDraft | `run-draft:<trigger-type>:<repo-locator-digest>:<source-input-digest>:<scope-digest>:<request-key>` |
| SourceAcquisition | `source-acquisition:<run-id>:<run-draft-digest>:<resolver-version>` |
| 冻结 RunSpec | `runspec:<run-id>:<source-acquisition-digest>:<project-policy-digest>` |
| 生成 Plan | `plan:<run-id>:<version>:<design-input-digest>` |
| 签发 Grant | `grant:<run-id>:<type>:<plan-or-design-digest>:<approval-id>:<sequence>` |
| Runtime Command | `runtime-command:<run-id>:<generation>:<command-sequence>:<command-type>` |
| Prepare | `prepare:<run-id>:<generation>:<plan-or-design-digest>:<device-id>` |
| CredentialLease | `credential-lease:<run-id>:<environment-id>:<secret-ref-digest>:<step-set-digest>:<destination-digest>` |
| Step Attempt | `step:<run-id>:<plan-version>:<generation>:<step-id>:<attempt>` |
| Termination | `terminate:<run-id>:<environment-id>:<step-id>:<attempt>:<reason>` |
| Artifact | `artifact:<run-id>:<step-id>:<artifact-type>:<byte-digest>` |
| Cleanup | `cleanup:<run-id>:<environment-id-or-none>:<inventory-digest>:<reason>` |
| Quality | `quality:<run-id>:<input-set-digest>:<rule-set-digest>` |
| Publication Action | `publication:<publication-plan-digest>:<action-id>:<rendered-content-digest>` |
| GitHub Check | `github-check:<repo>:<effective-sha>:<quality-dedup-key>` |
| PR Comment | `pr-comment:<repo>:<pr-number>:<quality-dedup-key>` |
| Product Issue | `product-issue:<repo>:<classification>:<reproduction-digest>` |
| PQL Gap | `pql-gap:<project-pack-digest>:<gap-type>:<affected-scope-digest>` |
| PQL Review | `pql-review:<proposal-digest>:<reviewer-id>:<decision>` |
| Project Pack Promotion | `pql-promotion:<proposal-digest>:<review-digest>:<base-pack-digest>` |
| RepairOperation | `repair:<original-run-id>:<type>:<target-set-digest>:<attempt>` |

幂等键和 canonical request digest 必须存储在副作用记录中。接收方必须先查询幂等键：同 key、同 digest 返回既有结果；同 key、不同 digest 产生 `runtime.command_conflict` 或对应领域冲突，禁止在消费 Grant nonce 后才判断重试。重试必须先读取 Snapshot、effect ledger 和既有 Receipt，再决定 create、update、skip、reconcile 或 repair。

### 16.2 Run Lock

- hosted 必须保证单个 `run_id` 只有一个有效 HostedWorkflowLease；Runtime 必须保证单个 `run_id` 只有一个 active LocalExecutionLease。
- 两种 lease 必须分别具有单调 generation 和不可预测 fencing token；ExecutionFence 必须同时绑定 hosted 与 local generation。
- 所有 mutating RuntimeCommand、RuntimeEvent、Checkpoint、Termination/Cleanup/Credential Receipt 和 StepAttempt effect 必须携带或引用当前 fence。
- 旧 owner 即使恢复网络或拥有更大的 event sequence，也不得写入新 generation、启动 Step、续租 CredentialLease 或确认 Cleanup。
- Runtime restart 必须扫描本地 ledger、fence 旧 generation、读取持久 Checkpoint 和 inventory，向 hosted 上报 Snapshot，并等待显式 RecoveryDecision；禁止自动继续执行。

### 16.3 重试边界

- 可重试 transport error 不得自动重放已开始的非幂等 Step；必须先查询 Runtime Snapshot 和 StepAttempt effect ledger。
- `amendment_required` 禁止作为普通 Backend retry；它必须走 §13 的 hard-revoke 路径。
- cancel/timeout intent 一旦持久化，普通 Step retry、Amendment 和迟到 completion 均不得覆盖。
- Cleanup、Credential revoke、Termination、Artifact upload、Publication Action 和 PQL Promotion 必须可独立重试并有各自 retry budget。
- Cleanup/Publication repair 可以在 terminal 后作为关联 RepairOperation 继续，但不得重跑测试、重新打开原 Run 或改写 QualityEvaluation。
- 用户显式 rerun 必须创建新 `run_id`，并通过 `parent_run_id` 关联；禁止复用旧 Run 清空终态。
- Source object retention 过期、source revision 改变、设备改变或批准对象改变时，禁止仅重签 Grant；必须按相应边界创建新 Run 或重新取得 ApprovalEvidence。

### 16.4 Checkpoint 最小内容

```ts
type RecoveryDecision =
  | { decision: "wait"; reason_codes: string[] }
  | { decision: "resume"; resume_state: WorkflowState; reason_codes: string[] }
  | { decision: "replay_cleanup"; cleanup_reason: CleanupReason; reason_codes: string[] }
  | { decision: "advance_from_receipt"; receipt_refs: DigestBoundRef[]; resume_state: WorkflowState }
  | { decision: "irreconcilable"; reason_codes: string[] };

type WorkflowCheckpoint = ContractMeta & {
  workflow_state: WorkflowState;
  run_draft_ref: DigestBoundRef<"qa.run-draft/v1">;
  source_acquisition_ref?: DigestBoundRef<"qa.source-acquisition/v1">;
  run_spec_ref?: DigestBoundRef<"qa.runspec/v1">;
  fence?: ExecutionFence;
  cancel_intent?: { requested_at: ISO8601; reason: string; actor: ActorRef };
  timeout_intent?: { deadline_at: ISO8601; detected_at: ISO8601; phase: ErrorPhase };
  plan_refs: DigestBoundRef<"qa.structured-plan/v1">[];
  active_plan_ref?: DigestBoundRef<"qa.structured-plan/v1">;
  active_grant_ref?: DigestBoundRef<"qa.signed-grant/v1">;
  completed_step_ids: string[];
  step_attempt_receipt_refs: DigestBoundRef<"qa.step-attempt-receipt/v1">[];
  active_step?: { step_id: string; attempt: number };
  runtime_instance_id?: string;
  last_runtime_event_cursor?: RuntimeCursor;
  environment_refs: DigestBoundRef<"qa.prepared-environment/v1">[];
  resource_inventory_refs: DigestBoundRef<"qa.resource-inventory/v1">[];
  cleanup_capability_refs: DigestBoundRef<"qa.cleanup-capability/v1">[];
  credential_lease_refs: DigestBoundRef<"qa.credential-lease/v1">[];
  case_result_refs: DigestBoundRef<"qa.case-result/v1">[];
  evidence_manifest_refs: DigestBoundRef<"qa.evidence-manifest/v1">[];
  termination_receipt_refs: DigestBoundRef<"qa.termination-receipt/v1">[];
  cleanup_receipt_refs: DigestBoundRef<"qa.cleanup-receipt/v1">[];
  quality_evaluation_ref?: DigestBoundRef<"qa.quality-evaluation/v1">;
  publication_receipt_refs: DigestBoundRef<"qa.publication-receipt/v1">[];
  amendment_request_refs: DigestBoundRef<"qa.plan-amendment-request/v1">[];
  amendment_refs: DigestBoundRef<"qa.plan-amendment/v1">[];
  recovery_decision?: RecoveryDecision;
  repair_operation_refs: DigestBoundRef<"qa.repair-operation/v1">[];
};
```

---

## 17. 安全与审计要求

### 17.1 Sandbox

- 必须默认 deny host filesystem，并只显式挂载本 Run 的 immutable source、Workspace 和批准目录；symlink、mount 和 path canonicalization 必须由 Local PEP 检查。
- 必须限制 CPU、内存、磁盘、进程数、open files 和总时长，并把实际用量写入 Receipt。
- 必须按 Plan、PolicyDecision、Grant 和 CredentialLease 的交集限制网络；未声明 destination 必须阻断。
- 必须对 App、Middleware、Browser 和 Backend 提供可整体终止的 process domain，并在 Run 结束、取消、超时或 Grant 撤销后取得 TerminationReceipt。
- 执行任何 PR 代码、Shell、App、Browser 或 Codex Action 的 provider 必须同时具备文件隔离、网络 enforcement、独立进程域和资源限制；缺少任一能力时必须拒绝整个执行 Plan，禁止以“低风险”名义降级。
- Design Sandbox 至少必须做到源码只读、默认禁网、禁生命周期脚本和动态项目配置执行、无长期 Secret；无法保证时必须拒绝 Design Grant。
- 外部 Fork PR 默认必须禁止长期 Secret、写权限 token、生产环境和私网访问。
- 使用 host-side Browser Provider 时必须满足 §10.2 的 required capability，使用每 Run 临时 Profile，并禁止个人 Profile、Keychain、用户扩展和任意 CDP 暴露。

### 17.2 Secret

- Secret 必须以 opaque `secret_ref` 存在于 Plan 和 Execution Grant；Design Grant 禁止包含 Secret scope，禁止把 Secret 值或本地 lease handle 写入任务正文。
- SecretBroker 必须根据已验证的 Execution Grant、Step、destination、injection mode、TTL 和 fence 签发 CredentialLease；Broker 不得决定业务授权或扩大 scope。
- Local PEP 只能在目标进程启动或代理调用时物化 Secret，并在 Step 完成、取消、超时、Grant 撤销、Cleanup 或 Runtime recovery 时撤销/reconcile lease。
- Secret 值禁止进入 Checkpoint、RuntimeCommand、RuntimeEvent、普通日志、CaseResult、ErrorEnvelope、Artifact、GitHub 内容或 PQL 对象；NyxID Transport 只能传递 opaque ref/receipt。
- 允许目的地必须同时满足 Plan envelope、PolicyDecision、Execution Grant、Environment policy 与 CredentialLease，任一更窄限制优先。
- terminal 前所有 CredentialLease 必须有 settled CredentialLeaseReceipt；撤销失败必须形成 `credential_active` CleanupResidual。
- 本地 Runtime 的控制 API 必须认证；POC 的无认证 loopback 服务禁止进入生产。

### 17.3 Grant 与密钥

- Authorization Authority signing key 必须只存在 hosted 受控环境。
- Runtime 必须内置或安全更新 trusted public key set，并支持 key rotation overlap。
- Grant 必须短 TTL、单 Run、单 device、单 Plan、单 sequence、可撤销。
- Runtime 时间偏差超过策略阈值时必须拒绝时间敏感 Grant，并报告 clock skew。

### 17.4 审计事件

至少必须记录：

- RunDraft 创建、SourceAcquisition 尝试与 RunSpec 冻结。
- Design/Execution Approval challenge、decision、request digest 和 Evidence digest。
- Design/Execution Grant 签发、传输、接受、拒绝、撤销、sequence 和重放尝试。
- HostedWorkflowLease、LocalExecutionLease、fence rollover 和 stale-fence rejection。
- PolicyDecision、Local PEP decision 与每项 scope violation。
- RuntimeCommand、RuntimeEvent、state transition、cancel/timeout intent 和 RecoveryDecision。
- CredentialLease 签发、注入、续期、撤销、reconcile 和失败。
- Termination、CleanupCapability 使用、Cleanup attempt、Residual、preserved resource 和 repair escalation。
- Artifact 创建、脱敏、上传、读取和删除。
- QualityEvaluation、PublicationPlan、每个 Action Receipt 和 Publication repair。
- CoverageGap、AssetChangeProposal、PQLReviewDecision 与 ProjectPackPromotionReceipt。

审计事件必须带 actor、device、run、timestamp、correlation id 和 content digest；禁止记录 Secret 值。

---

## 18. GitHub 与 PQL 路由规则

### 18.1 GitHub Check

每个 PR Run 应该发布或更新一个稳定 GitHub Check。由于 GitHub Check 必须绑定仓库中可识别的 commit，Check 的 `head_sha` 必须使用 PR `head_sha`；Check 名称、summary、details 和 dedup key 必须明确记录实际测试的 synthetic merge `effective_sha`，并同时显示 base/head SHA。禁止把“Check 绑定 head SHA”误解为只测试了 head SHA。

建议映射：

| Final Quality | GitHub Check conclusion |
|---|---|
| `pass` | `success` |
| `fail` | `failure` |
| `blocked` | `action_required` 或 `neutral`，由 policy 决定 |
| `inconclusive` | `neutral` 或 `action_required` |

### 18.2 PR Comment

PR Comment 可以包含摘要、Case 统计、失败分类和受控 Artifact 链接，但禁止粘贴未脱敏原始日志。重试必须更新同一个 dedup comment 或创建 versioned update，禁止重复刷屏。

### 18.3 产品 Issue

只有同时满足以下条件才可以创建产品 Issue：

1. `classification=product_defect`。
2. 固定 `effective_sha` 可复现。
3. assertion actual 和 expected 已结构化记录。
4. Evidence sufficient。
5. 已排除 environment failure、test failure、flaky 和 policy blocked。
6. PublicationPlan 明确包含 `product_issue`，且策略允许。

### 18.4 PQL

- `test_failure`、`coverage_gap`、`flaky`、`insufficient_evidence` 应由 PublicationPlan 中独立的 `pql_feedback` Action 进入 PQL。
- `stale_selector`、Fixture、Oracle 和 Scope Policy 问题必须生成 CoverageGap 或 AssetChangeProposal，而不是产品 Issue。
- 产品缺陷本身禁止作为 PQL 产品 Issue 复制；PQL 只消费其对测试资产的影响。
- AssetChangeProposal 必须始终 `design_only` 且不可原地修改 review 状态；Review 结果必须是独立、不可变的 PQLReviewDecision。
- 只有 approved ReviewDecision 与成功 ProjectPackPromotionReceipt 才能产生新 Project Pack；base digest 冲突必须停止 Promotion。
- 新 Project Pack 只允许进入后续 Run，禁止回灌当前 Run 或绕过 Plan Amendment。

### 18.5 Publication 顺序

```text
QualityEvaluation
→ PublicationPlan
→ GitHub Check / PR Comment / Product Issue / PQL Feedback
→ PublicationReceipt
```

各 Action 可以并行，但必须独立记录结果。一个 Action 失败不得隐藏其他 Action 的成功，也不得修改 QualityEvaluation。

---

## 19. macOS Runtime Daemon 生命周期

### 19.1 安装与身份

Local QA Runtime v1 必须：

- 作为签名、notarized 的 macOS 安装包或等价可信分发物发布。
- 安装固定 bundle identifier 和可验证 Team ID。
- 使用专用低权限用户上下文或明确的用户级 LaunchAgent；若使用系统级 LaunchDaemon，必须记录最小权限理由。
- 建立唯一 `runtime_instance_id` 和设备绑定，但禁止复用 NyxID Node identity 作为 Runtime identity。
- 将本地持久状态放在受权限控制的 application support 目录；禁止写入被测仓库。

### 19.2 launchd

`launchd` 配置必须：

- 在登录或系统启动后按部署模式启动 Runtime。
- 配置 crash restart/backoff，避免无限快速重启。
- 禁止监听公网地址；Runtime API 只监听 loopback 或受控 Unix domain socket。
- 将 stdout/stderr 导向受控日志，并执行大小和保留期限制。
- 每次启动必须扫描 local ledger、未结算 ResourceInventory、CredentialLease 和 CleanupCapability，fence 旧 generation，并在接受新 Run 前上报 Snapshot 或恢复 Cleanup。
- 在升级期间支持 drain：停止接收新 Run，允许安全 checkpoint 或取消当前 Run。

### 19.3 本地认证

- Node/Adapter 调用 Runtime 时必须使用短期本地 credential、mTLS、signed request 或等价认证。
- 本地 credential 必须绑定 service identity、audience、TTL 和 nonce。
- `GET /health` 可以返回非敏感健康信息，但详细运行状态必须认证。
- 未认证请求不得创建、取消、查询详细 Run 或下载 Artifact。

### 19.4 健康与能力报告

```ts
type RuntimeHealth = {
  status: "healthy" | "degraded" | "draining" | "unhealthy";
  runtime_version: string;
  protocol_versions: string[];
  runtime_instance_id: string;
  platform: {
    os: "macos";
    version: string;
    arch: "arm64" | "x86_64";
  };
  capabilities: string[];
  active_runs: number;
  sandbox_provider: string;
  last_self_check_at: ISO8601;
};
```

Runtime 必须在接受 Grant 前声明兼容 protocol version 和所需 capabilities。hosted 必须在 device selection 和 dispatch 前检查兼容性。

### 19.5 升级与回滚

- 升级包必须验证签名、版本单调性和兼容范围。
- Runtime 有 active Run 时禁止直接替换二进制；必须 drain、checkpoint 并完成或取消 Run。
- 升级失败必须自动回滚到上一已知可用版本，或进入 unhealthy 并拒绝新 Run。
- 回滚不得重用新版本已经接受但旧版本无法理解的 checkpoint；hosted 应选择兼容 Runtime 或人工介入。
- 版本报告和升级结果必须进入审计。

### 19.6 卸载

卸载必须：

- 停止并移除 launchd job。
- 撤销本地 credential 和 device/runtime registration。
- 对 active Run 执行取消和 Cleanup。
- 默认保留或删除日志/Artifact 必须由用户可见选项和 retention policy 决定。
- 禁止删除不属于 Runtime 的用户文件。

---

## 20. M0-M4、测试矩阵与 Definition of Done

### 20.1 实施顺序

| 阶段 | 依赖 | 必须交付 |
|---|---|---|
| **M0 契约冻结** | 无 | Strict union、DigestBoundRef、RunDraft/SourceAcquisition/RunSpec、ApprovalEvidence/Grant、ExecutionFence、PlanCase/EvidenceRequirement、CleanupCapability/CredentialLease、五类 Outcome、状态机和 compatibility tests。 |
| **M1 本地安全执行** | M0 | Hosted Authorization Authority、显式 Design/Execution Approval、macOS signed daemon/launchd、本地认证、Local Design Sandbox、Local QA Sandbox、Local Runtime Verifier、Local PEP、SecretBroker client、BrowserProvider、EnvironmentFactory。 |
| **M2 可恢复编排** | M1 | Hosted/local lease、fenced command/event、Durable Checkpoint、Step effect ledger、完整 PlanAmendment、取消/超时/失联恢复、TerminationReceipt、补偿 Cleanup、residual repair。 |
| **M3 质量与发布** | M2 | 类型化 Evidence fulfillment、版本化 QualityEvaluation、GitHub/PQL Publication Action、PublicationReceipt、settlement/repair 与 failure injection。 |
| **M4 PQL Loop** | M3 | CoverageGap、immutable AssetChangeProposal、PQLReviewDecision、ProjectPackPromotionReceipt、并发 pack conflict 与下一轮回归验证。 |

后续阶段禁止跳过前置阶段的合规 Gate。M1 可以使用最小 Artifact Store，但不得绕过 M0 契约和 Grant 规则。

### 20.2 测试矩阵

| 层级 | 场景 | 最低覆盖 |
|---|---|---|
| Contract unit | 每个 Schema/strict union 正反例、未知 version/enum/discriminator、forbidden field、canonical digest/signing bytes | 每个 union 覆盖合法 variant、缺 required、混入其他 variant、未知 discriminator、未知安全字段。 |
| Source integration | RunDraft、PR synthetic merge、fork PR、merge conflict、exact commit、SourceObject retention、floating ref 变化 | resolver 响应丢失重放、对象 digest 不符、retention 过期均 fail closed。 |
| Authorization unit | Design/Execution Evidence、signature、request digest、device、TTL、nonce、scope、sequence | denied Evidence、variant mismatch、旧 approval 和合法签名但替换 payload 全部拒绝。 |
| Authorization integration | Design Approval→Design Grant→Plan→Policy→Execution Approval→Execution Grant | 正常、拒绝、过期、撤销、重放、device change、stale sequence。 |
| Policy/PEP | 文件、命令、网络、Secret、Browser、resource budget、unknown capability | hosted Policy 与 Local PEP 均覆盖 allow/deny；副作用前阻断。 |
| Plan | PlanCase、DAG、aggregate envelope、Assertion、EvidenceRequirement、conditional readiness | orphan Case/Step、跨 Case assertion、required Evidence 缺失必须 fail closed。 |
| Amendment | 新 Step、文件/网络/Secret/权限/预算扩展 | quiesce、旧 Grant revocation、old fence、Cleanup residual、new design sandbox、reapproval/new sandbox。 |
| Runtime protocol | typed submit/get/cancel/cleanup/resume、重复 command、cursor gap、stale fence、Snapshot | 同 key 不同 digest 冲突；旧 Runtime 的迟到 completion 不推进状态。 |
| NyxID adapter | Cloud→Node→loopback、ApprovalEvidence、断线重连、本地认证、路由错误 | 不开放公网端口；不签 Grant、不解释 scope、不读取 Secret。 |
| Sandbox | Design/Execution Sandbox、symlink escape、home denial、network allowlist、resource/process limit | 缺文件/网络/进程域/资源限制任一能力时拒绝执行 PR 代码。 |
| Credential | CredentialLease issue/inject/revoke/reconcile、destination/TTL/fence | Secret 不出现在命令、Event、日志、Artifact；撤销失败形成 blocking residual。 |
| Environment | ResourceInventory、CleanupCapability、process group、port、Readiness | Grant 过期后仍可清理；伪造 inventory/capability 被拒。 |
| Backend | Deterministic、Browser、Codex observation 与 TerminationReceipt | Backend 自报 pass 不能绕过 assertion；cancel ack 不能替代终止证明。 |
| Runner | exit/http/DOM/schema/visual/custom assertions 与 Case 聚合 | required/optional、skip、continue-on-failure、共享 support Step 全覆盖。 |
| Browser E2E | isolated temporary Profile、host BrowserProvider、点击、DOM、截图 | 禁止个人 Profile/Keychain/extension/任意 CDP；required capability 缺失即 deny。 |
| Cancellation/Timeout | design/preparing/ready/executing/evidence/recovery/amendment 各阶段 | cancel/timeout/completion race，子进程、浏览器、端口、CredentialLease 最终 settled。 |
| Recovery | hosted/Runtime 重启、Node 断线、重复事件、fence rollover、irreconcilable inventory | wait/resume/replay-cleanup/advance/irreconcilable 决策全覆盖，不重复副作用。 |
| Cleanup | success/fail/cancel/timeout/lost/restart/amendment、partial、preserved、repair | residual 分类、retry budget、not_found 收敛和 terminal 后 repair。 |
| Evidence | requirement fulfillment、脱敏、digest、retention、access scope、上传中断 | required Evidence 缺失或脱敏失败禁止 sufficient/publication。 |
| Quality | executed/non-executed、七类 classification、ruleset/input digest | blocked-without-plan、规则升级 supersedes 和 replay 结果可审计。 |
| Publication | GitHub/PQL 独立 Action、response lost、partial failure、repair | dedup、render digest、Artifact allowlist、per-action settlement。 |
| PQL | Gap dedup、immutable proposal/review、stale base、并发 promotion | 未批准资产不可执行；promotion digest/base conflict 不覆盖。 |
| Security | forged Grant、replay、stale fence、path escape、Secret exfiltration、host Chrome boundary | 全部 fail closed + audit。 |

### 20.3 故障注入

M2 及以后必须自动化注入以下故障：

- Source resolver 已持久化对象但响应丢失，或同 RunDraft 重试得到不同对象 digest。
- Node 在 command accepted 前后断线。
- Runtime 在 Design、prepare、execute、evidence、cleanup 和 amendment cleanup 中重启。
- hosted workflow 在收到事件但持久化前/后崩溃，旧 workflow owner 随后恢复。
- 新 generation 生效后收到旧 Runtime 的高 sequence `step_completed` 或 CleanupReceipt。
- cancel、timeout、amendment_required 和 step_completed 以不同顺序并发到达。
- CredentialLease 已注入但 revoke 响应丢失，或 Secret Broker 重启后状态不确定。
- Backend 已启动进程域但 command/termination 响应丢失。
- Artifact 上传部分成功或脱敏后上传响应丢失。
- Cleanup 某资源释放失败、inventory digest 不匹配或 `not_found` 重试。
- GitHub Check/Product Issue/PQL Gap 已创建但响应丢失。
- PQL Review 后 base Project Pack 并发更新，Promotion 发生 stale-base conflict。
- Grant 在排队期间过期、被撤销或设备发生变化。

系统必须通过 fenced Snapshot、effect ledger、dedup key、immutable Receipt 和显式 RecoveryDecision 收敛，禁止通过“重新跑整个 Run”掩盖一致性问题。

### 20.4 Definition of Done

以下条件全部满足后，v1 才可以声明完成：

1. [ ] 根契约均有可执行 Schema、validator、canonical digest 和兼容测试。
2. [ ] RunDraft、SourceAcquisition、SourceRevision 和 RunSpec 分层明确；PR 使用可获取的 immutable synthetic merge object，非 PR 使用 exact SHA；Source 变化创建新 Run。
3. [ ] DesignApprovalEvidence 与 ExecutionApprovalEvidence 是严格不同的 variant；用户批准 scope/Plan，Hosted Authorization Authority 签发 Design Grant 和 Execution Grant，NyxID 只提供证明和传输。
4. [ ] Design/Execution Grant 是严格 union；Execution Grant 强制绑定 Plan、PolicyDecision、approved envelope、effective SHA、device、profile、TTL、nonce、sequence 和 ExecutionFence。
5. [ ] StructuredPlan 包含 PlanCase、稳定 Assertion 和 EvidenceRequirement 关联；Plan 先于 Execution Approval，批准后不可原地修改。
6. [ ] 超出 envelope 的动作完成 quiesce、旧 Grant revocation/fencing、Cleanup、amendment Design、Policy/Approval、新 Grant 和新 Sandbox 全链路。
7. [ ] `apps/hosted-control-plane` 与 `apps/local-qa-runtime` 可以独立构建和发布；testing packages 不依赖 apps。
8. [ ] macOS Runtime 是签名 Daemon，由 launchd 管理，具备安装、启动、健康、版本、本地认证、升级、回滚和卸载流程。
9. [ ] Runtime 控制接口只监听 loopback/Unix socket 且必须认证；生产环境不存在 `auth_method=none` 控制入口。
10. [ ] Local Design Sandbox 与 Local QA Sandbox 独立创建、授权、记账和清理；Design 阶段不会在宿主权限下执行不受信任项目配置或生命周期脚本。
11. [ ] Sandbox 默认不能读取用户主目录、Keychain、个人浏览器 Profile 和未批准目录；path/symlink/mount escape 被阻断。
12. [ ] 文件、命令、网络、Secret、Browser 和资源动作在副作用前同时受 Plan、PolicyDecision、Grant、ExecutionFence、CredentialLease 和 Local PEP 约束。
13. [ ] 外部 Fork PR 默认没有长期 Secret、写 token、生产环境或私网访问；Secret 值不进入 Runtime 协议、日志、Checkpoint、Artifact 或发布对象。
14. [ ] EnvironmentFactory 生成 sealed ResourceInventory 与 CleanupCapability，管理进程域、端口、CredentialLease 和条件 Readiness，并生成 digest-bound Receipt。
15. [ ] Deterministic、Browser、Codex Backend 实现统一接口；Backend 只返回 observation。
16. [ ] `testing-runner` 根据结构化 assertion 生成 CaseResult；Codex 自报结论不能改变 Pass/Fail。
17. [ ] BrowserProvider 使用每 Run 临时 Profile 并具备完整安全 capability；真实 Chrome E2E 不依赖个人 Profile、Keychain、任意 CDP、IDE、NyxID Oracle 或公网入站端口。
18. [ ] 成功、失败、取消、超时、失联、Runtime 重启和 Amendment 均通过 fenced Termination/Cleanup 流程收敛。
19. [ ] Cleanup 使用 CleanupCapability 与 sealed inventory，幂等、可独立重试，只清理本 Run 资源，并区分 CleanupResidual 与合法 preserved resource。
20. [ ] execution、cleanup、evidence、publication、final quality 五类 Outcome 独立持久化；terminal 表示 settled，terminal 后 repair 不重开测试或改写 QualityEvaluation。
21. [ ] EvidenceManifest 对每个 EvidenceRequirement 逐项结算；Evidence 在本地完成 digest 和脱敏，required Evidence 缺失或脱敏失败禁止 sufficient/publication。
22. [ ] `quality-evaluation` 支持 executed/non-executed 输入，绑定完整 input set 与 rule set，并区分 product、test、coverage、environment、flaky、policy 和 insufficient evidence。
23. [ ] Publication 只消费 QualityEvaluation 和 Artifact allowlist；GitHub 与 PQL 是独立 Action，均有 rendered digest、dedup key、attempt、reconcile 和 Receipt。
24. [ ] 产品 Issue 只有在可复现、Evidence sufficient 且排除测试/环境/Flaky 后才创建。
25. [ ] 测试资产问题进入 PQL；AssetChangeProposal 不可原地批准，只有 PQLReviewDecision 与 ProjectPackPromotionReceipt 可产生后续 Run 使用的新 Project Pack。
26. [ ] hosted、Runtime 或 transport 重启后通过 Hosted/Local lease、ExecutionFence、Checkpoint、Event cursor、Snapshot、effect ledger 和 Receipt 恢复。
27. [ ] 同一 Run 重放不会重复启动服务、重复执行已完成 Step、重复注入 CredentialLease、重复上传 Artifact 或重复创建外部对象。
28. [ ] Source、Approval、Grant、fence、Local PEP、Credential、Termination、Cleanup、Quality、Publication、PQL Review/Promotion 和 repair 均可审计，审计中不含 Secret。
29. [ ] 测试矩阵和故障注入场景在 CI 或受控真实设备测试中通过，并保存可追踪报告。
30. [ ] POC 之外的能力只在对应验收通过后标记为 implemented；文档和 UI 不得把目标架构误报为已完成能力。
31. [ ] cancel、timeout、amendment 和 completion race 的优先级有自动化测试，旧 fence 事件不会复活 Run。
32. [ ] Grant 过期或撤销后仍可使用最小 CleanupCapability 清理既有资源，但不能创建资源或执行 Step。
33. [ ] Cleanup/Publication residual 在重试预算耗尽后有明确 repair responsibility、告警和不可变 Receipt。
34. [ ] blocked-without-plan、Design/Execution denial 和 cancel-before-execution 均能产生 NonExecutedQualityEvaluation，不要求伪造 Plan 或 Evidence。
35. [ ] Mermaid、Excalidraw、SVG、PNG、DESIGN 与 SPEC 对 Authority、Approval、PEP、Amendment、Publication 和 PQL 语义一致。

### 20.5 需求追踪矩阵

| 锁定要求 | Schema / Interface | 状态/规则 | DoD |
|---|---|---|---|
| fkst-hosted monorepo、两个 app 独立部署、testing packages | §1、§2 | module boundary tests | #7 |
| RunDraft、SourceAcquisition、immutable source、RunSpec | §4、`DigestBoundRef` | `source_resolving` | #2 |
| Hosted Authorization Authority 与严格双阶段授权 | `DesignApprovalEvidence`、`ExecutionApprovalEvidence`、Grant unions | §5、§17 | #3-4 |
| NyxID 只提供证明、Credential Broker 适配与传输 | Runtime protocol、NyxID Adapter | §8、§17 | #3、#9、#13 |
| PlanCase、Assertion、EvidenceRequirement | `StructuredPlan`、`EvidenceManifest` | §6、§11 | #5、#16、#21 |
| macOS signed daemon/launchd | `RuntimeHealth` | §19 | #8-9 |
| Local Design/Execution Sandbox 与 Local PEP | EnvironmentFactory、LocalPolicyEnforcementPoint、BrowserProvider | §9、§10、§17 | #10-14、#17 |
| Credential 最小租约 | CredentialLease、CredentialLeaseReceipt、SecretBrokerClient | §9、§17 | #12-13、#27 |
| Plan Amendment hard-revoke | PlanAmendmentRequest、PlanAmendment | §7、§13 | #6、#31 |
| Runtime fencing 与恢复 | ExecutionFence、typed RuntimeCommand/Event、WorkflowCheckpoint | §8、§13、§16 | #26、#31 |
| testing-runner 决定 Pass/Fail | BackendObservation、AssertionResult、CaseResult | §10 | #15-16 |
| Termination 与补偿 Cleanup | CleanupCapability、TerminationReceipt、CleanupReceipt、CleanupResidual | §9-§11、`cleaning_up`/repair | #18-19、#32-33 |
| 五类 Outcome 与 settlement | RunOutcomes、RunSettlement、RepairOperation | §14 | #20、#33-34 |
| Quality 与精确路由 | QualityEvaluation unions、PublicationPlan/Receipt | §12、§18 | #22-24、#34 |
| PQL Review 与 Promotion | AssetChangeProposal、PQLReviewDecision、ProjectPackPromotionReceipt | §12、§18 | #25 |
| 图与规范语义同步 | Mermaid/Excalidraw/SVG/PNG | §0、DESIGN §1 | #35 |

---

本规范的实现应按 M0-M4 逐步收敛。任何阶段可以缩小功能范围，但不得绕过授权、源码冻结、Sandbox enforcement、Runner assertion、Cleanup、Outcome 分离和幂等这些系统不变量。
