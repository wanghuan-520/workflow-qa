# Talos Testing Tool 最小 MVP 设计

> **状态：** Target MVP，待 product-quality-loop、Talos、Local QA Runtime 和 Testing Packages owner review
>
> **日期：** 2026-08-18
>
> **当前外部基线：** product-quality-loop HEAD e540127388981c0d3e3249f7a43aa569350abb5b、talos-worker-setup v1.1、Talos OpenAPI 0.1.0
>
> **首发范围：** PQL ProjectPackSnapshot/TestSelection/TestingToolClient；Browser-only；macOS arm64 canary pool；每台 machine 同时最多一个 Testing Run；无 Secret；本机 allowlisted Chrome executable + 临时 Profile；只产生 bounded JSON 与 PNG Evidence。
>
> **一句话目标：** product-quality-loop 从批准的项目知识和测试资产生成冻结的测试输入，通过 NyxID 调用 Talos Testing Tool，把 Browser 测试计划派到真实机器执行，并得到可信的 CaseResult、Evidence 和 Cleanup 结果。
>
> **实现状态：** 本文定义需要实现的 MVP，不表示 Talos 已支持 kind=testing。当前 Talos task 仍只有 browse 和 computer_use。
>
> **Hosted 边界状态：** Hosted Authorization Authority 和最小 ArtifactStore 的 owner/MVP 必需性为 **Proposed / Decision pending**，详见 [Hosted Authorization 与 MVP ArtifactStore 边界决策](hosted-authorization-artifact-boundary-decision.zh-CN.md)。Talos 负责 QARun、placement、lease、generation 和 fence；在该决策被接受前，Hosted 接口只是 consumer contract。
>
> **流程图：** [Talos Testing MVP 流程图](./diagrams/talos-testing-mvp-flow.mmd)

---

## 0. 决策摘要

Testing 应作为 Talos 服务的第一方 Tool family，而不是包装现有 browse goal，也不把 Talos 改造成通用插件或远程 Shell 平台。

MVP 固定为一条最小垂直链路：

~~~text
Agent
  -> product-quality-loop
  -> ProjectPackSnapshot + TestSelection
  -> pql.testing-design-input-set.v1
  -> Testing Packages compile StructuredPlan
  -> PQL TestingToolClient
  -> NyxID
  -> talos.testing.submit
  -> Talos QARun + kind=testing task
  -> canary pool 中的一台 machine
  -> talos-worker TestingExecutor
  -> Local QA Runtime
  -> Testing Packages + Playwright-controlled system Chrome
  -> CaseResultSet + EvidenceManifest + CleanupReceipt
  -> talos.testing.get/events
~~~

核心决策：

1. product-quality-loop 进入 MVP，负责 ProjectPackSnapshot、TestSelection、approved input set、Tool client 和运行关联记录。
2. Testing Packages 把 PQL approved input 编译为 immutable StructuredPlan，并继续拥有 Assertion、CaseResult 和 Evidence 领域合同。
3. 对外暴露五个异步 Tool：get_capabilities、submit、get、events、cancel。
4. Talos 新增严格的 TestingTask，测试 spec 不进入自由文本 goal。
5. talos-worker 新增固定 TestingExecutor，不提供 generic plugin ABI。
6. 本机执行交给 Local QA Runtime；worker 只做 task/runtime 适配、lease、heartbeat、cancel 和结果投影。
7. 每个 Run 由 Playwright 控制 Runtime allowlist 中的本机 Chrome executable，并使用独立 process/profile/downloads；不连接已经打开的普通 Chrome，不复用 persistent login profile，也不依赖 Playwright bundled Chromium。
8. Tool response 只返回 bounded snapshot、summary、opaque ref 和 digest。
9. 首版不实现 Hosted Final Quality、Report、Publication、HostedQualityFeedback、自动资产 proposal/review/promotion、Secret、API/CLI backend 或 hardened execution。

---

## 1. 要解决的问题

### 1.1 当前能力和缺口

Talos 已具备：

- NyxID 认证和服务路由；
- machine pool、machine registration 和 worker token；
- worker outbound claim；
- task lease、heartbeat、cancel detection 和 terminal result；
- Playwright Chromium browser actions；
- interactive session 和 worker-managed profile isolation。

当前 TaskCreate.kind 只有：

~~~text
browse
computer_use
~~~

当前 task 主要依赖自由文本 goal，结果主要是：

~~~text
status
findings[]
artifacts[]
error
~~~

这不足以表达可重复、可审计的测试执行，因为它不能冻结：

- exact Source revision；
- Structured Plan 和 digest；
- Environment Profile；
- Testing Package version/digest；
- assertion/case 语义；
- Evidence 与 CaseResult 的绑定；
- cleanup 是否完整；
- duplicate submit、cancel、deadline、lease loss 和 stale worker 行为。

### 1.2 MVP 用户故事

一个 Agent 要验证不可变代码版本的登录流程：

1. PQL 冻结 ProjectPackSnapshot，并根据 requirement、journey、risk 和 approved TestCaseAsset 生成 TestSelection。
2. PQL 生成 pql.testing-design-input-set.v1；Testing Packages 验证 approved refs 并编译 StructuredPlan。
3. PQL TestingToolClient 查询 talos.testing.get_capabilities，确认服务支持 `local_qa_agent_mvp` execution profile 和 `local-qa-mvp/v1` runtime capability。
4. PQL 提交 provenance、exact Source、Structured Plan、Environment Profile 和 policy 的引用与 digest。
5. Talos 根据 caller/project execution policy 幂等创建 QARun，并选择 qa-macos-canary pool 中支持 Testing 的 machine。
6. worker 领取 kind=testing task，通过 TestingExecutor 调用本机 Local QA Runtime。
7. Runtime 创建独立 workspace，启动受控环境，并用 Playwright 启动 allowlisted system Chrome 的独立进程，执行 typed Browser actions 和 assertions。
8. Runtime 冻结 CaseResultSet，生成 sanitized EvidenceManifest，精确清理本 Run 拥有的资源。
9. PQL TestingToolClient 通过 get/events 观察状态，并保存 run、input provenance 和 terminal result refs 的关联记录。

### 1.3 MVP 成功标准

必须同时证明：

- PQL Snapshot、Selection、InputSet 和 StructuredPlan 形成完整 ref/digest provenance；
- 只有 approved、published、executable/regression TestCaseAsset 能进入选择；
- PQL TestingToolClient 能调用五个 Tool，且不选择 pool/machine；
- 请求被幂等接受；
- task 被正确放置到支持 Testing 的 machine；
- Runtime 在本地副作用前完成 admission；
- 至少一个真实 Browser action 和一个 assertion 被执行；
- CaseResult 由 assertion 事实计算，不由 LLM、浏览器或 task status 猜测；
- Evidence 通过 media/schema/size/digest 校验；
- Chrome、进程、端口和 workspace 有明确 CleanupReceipt；
- duplicate、cancel、timeout、worker/runtime crash 和 artifact outage 有确定行为。

---

## 2. 产品范围

### 2.1 首发包含

- product-quality-loop 固定基线和可重复安装；
- ProjectPackSnapshot；
- TestSelection，绑定 approved TestCaseAsset 和 exact source revision；
- pql.testing-design-input-set.v1；
- PQL 到 Testing Packages 的 StructuredPlan 编译适配；
- provider-neutral TestingToolClient；
- PQL TestingRunRecord，只保存 run/input/result opaque refs 和 digests，不推断 Quality；
- Talos 服务上的五个 Testing Tool operation；
- 新增 kind=testing 的 strict task union；
- macOS arm64 canary pool；
- machine capability advertisement；
- 每台 machine 最多一个 execution-bearing Testing Run；
- talos-worker 中固定注册的 TestingExecutor；
- worker 到 Local QA Runtime 的 loopback 或 Unix-socket adapter；
- exact Source archive/ref + digest；
- exact Structured Plan ref + digest；
- exact Environment Profile ref + digest；
- 固定 Browser Testing Package version/digest；
- 受控环境启动和 readiness；
- Playwright-controlled allowlisted system Chrome executable；
- per-run temporary profile、downloads 和 process group；
- typed Browser actions 和 assertions；
- bounded event stream；
- CaseResultSet、EvidenceManifest、CleanupReceipt；
- screenshot 和 sanitized JSON Evidence；
- cancel、deadline、idempotency、lease/fence 和 same-machine reconcile；
- digest-bound Hosted ArtifactStore port；
- feature flag 和 canary rollout。

### 2.2 首发不做

- 任意 Shell、argv、cwd、env 或 filesystem 参数；
- 用户上传可执行脚本或动态 executor plugin；
- 连接用户当前已经打开的普通 Chrome；
- 外部 CDP endpoint；
- Talos persistent profile 或个人 cookie/session；
- Secret ref、Keychain、SSH、云账号或私网凭据；
- API testing、CLI testing、移动端或跨浏览器矩阵；
- raw DOM、trace、network body、download content 或任意 binary Evidence；
- worker/runtime 中的 Final Quality、Report 或 Publication；
- HostedQualityFeedback ingestion、CoverageGap、AssetChangeProposal 和自动 review/promotion；
- Host/worker crash 后自动重新执行已经开始的 Case；
- hardened untrusted-code、VM、EffectGate、Secret Broker 或通用 capability plugin。

### 2.3 设计不变量

1. testing 不可用时必须明确拒绝，不得降级为 browse、computer_use 或 shell。
2. goal 只用于 UI 展示，不参与 authorization、placement、runner selection、effect 或 Pass/Fail。
3. Runtime acceptance 必须发生在创建 workspace、进程、端口、Chrome 或 staging 之前。
4. 同一个 QARun 同一时刻最多有一个已经 local accepted 的 execution-bearing attempt。
5. local acceptance 前可以重新 placement；acceptance 后不得自动切到另一台 machine 重跑。
6. lease 允许 worker 报告当前 attempt；fence 阻止 stale worker 产生 effect 或更新状态。
7. task completed 只表示执行 attempt 已闭合，不等于测试 passed。
8. CaseResultSet 是执行事实；Final Quality 不在 MVP 中，也不能回写 CaseResult。
9. Cleanup 只能处理本 Run 记录的 OwnedHandle，不得模糊扫描和批量删除。
10. Artifact bytes 不进入 heartbeat、findings、NyxID Tool response 或 error message。
11. PQL 决定测试知识、资产和选择，但不决定 pool、machine、lease、fence 或本机 effect。
12. PQL Snapshot -> Selection -> InputSet -> StructuredPlan -> CaseResultSet 的 provenance 必须以 immutable ref + digest 闭合。

---

## 3. 组件和职责

~~~mermaid
flowchart LR
  A[Agent]
  PQL[product-quality-loop]
  N[NyxID]
  T[Talos Testing Tool]
  Q[QARun Store]
  S[Talos Scheduler]
  W[talos-worker]
  E[TestingExecutor]
  R[Local QA Runtime]
  P[Testing Packages<br/>Plan compiler + execution contracts]
  C[Temporary system Chrome process]
  F["Proposed Hosted ArtifactStore<br/>(Decision pending)"]

  A --> PQL
  PQL -->|approved Snapshot / Selection / InputSet| P
  P -->|StructuredPlan ref + digest| PQL
  PQL -->|TestingToolClient| N --> T
  T --> Q --> S
  S -->|TestingTask + lease + fence| W
  W --> E --> R
  R -->|execute exact StructuredPlan| P
  R --> C
  R -->|sanitized bytes| F
  R -->|Snapshot/Event/refs| E --> W --> S --> Q --> T --> N --> PQL --> A
~~~

| 组件 | MVP 权威职责 | 明确不负责 |
| --- | --- | --- |
| product-quality-loop | ProjectPackSnapshot、TestCaseAsset eligibility、TestSelection、InputSet、TestingToolClient、TestingRunRecord | pool/machine placement、lease/fence、Runtime、Pass/Fail、Final Quality |
| NyxID | caller identity、服务路由、approval、transport audit | QARun 状态、Pass/Fail、Artifact bytes |
| Talos Testing Tool | Tool contract、QARun、幂等、snapshot/events/cancel | 本机进程和浏览器执行 |
| Talos Scheduler | pool、capability、placement、attempt、lease、generation、fence | 解释 Plan、计算 assertion |
| talos-worker | claim、heartbeat、TestingTask dispatch、cancel/deadline、bounded result | checkout、Compose、Chrome、CaseResult 计算 |
| Local QA Runtime | admission、Journal、workspace、environment、browser、evidence、cleanup | 最终产品 Quality、组织权限 |
| Testing Packages | Structured Plan、typed action、Observation、AssertionResult、CaseResultSet | Talos lease、worker token、本机资源 ownership |
| 业务执行授权 | Proposed Hosted QA Authorization Authority（Decision pending） | operation-specific authorization；不拥有 QARun、placement、lease/generation/fence |
| 长期 Artifact | Proposed Hosted ArtifactStore（Decision pending） | per-object grant、sanitized Artifact bytes、digest、object ref、ingest receipt；不拥有执行状态、Quality 判断、本地 raw quarantine |

### 3.1 QARun 与 TestingTask

MVP 必须区分：

~~~text
QARun
  用户看到的测试运行，承载幂等身份、输入冻结、业务状态和结果引用

TestingTask
  Talos 调度到某台 machine 的一次执行 attempt，承载 lease/generation/fence
~~~

规则：

- 一个 QARun 在 local acceptance 前可以因 claim/worker 失败产生新的 attempt；
- Runtime local acceptance 后，该 attempt 绑定到当前 machine；
- acceptance 后 worker 失联进入 same-machine reconcile，不自动跨机器重跑；
- Tool 的 run_id 稳定，内部 task_id/attempt_id 可以变化。

### 3.2 product-quality-loop MVP 边界

MVP 固定使用仓库：

~~~text
https://github.com/YueZh127/product-quality-loop
baseline = e540127388981c0d3e3249f7a43aa569350abb5b
~~~

PQL 首版必须产出：

~~~text
pql.project-pack-snapshot/v1
pql.test-selection/v1
pql.testing-design-input-set.v1
pql.testing-run-record/v1
~~~

其中：

- ProjectPackSnapshot 冻结 project knowledge、requirements、journeys、risks、asset index 和 exact source revision；
- TestSelection 只选择 published + approved + executable/regression 的 TestCaseAsset，并记录 selected/skipped/blocked reason；
- pql.testing-design-input-set.v1 只把 approved refs/digests 交给 Testing Packages，不包含 machine、pool、profile、lease、path、port 或 credential；
- Testing Packages 验证 PQL provenance 后生成 StructuredPlan ref/digest；
- TestingToolClient 调用 get_capabilities、submit、get、events、cancel；
- TestingRunRecord 只关联 PQL input refs、Talos run_id、terminal snapshot/result refs 和 digest，不把 task completed 解释为 Case passed 或 Final Quality。

PQL 首版不实现：

- 根据执行结果自动修改 TestCaseAsset；
- 自动创建或批准 CoverageGap/AssetChangeProposal；
- HostedQualityFeedback ingestion；
- ReviewDecision/PromotionReceipt 自动化；
- pool/machine 选择；
- Talos worker、Runtime 或 Browser 直连。

PQL 和 Talos 之间的固定边界：

~~~text
PQL owns: why/what to test
Testing Packages owns: executable typed plan and case semantics
Talos owns: where/when to execute
Runtime owns: local effects and cleanup
~~~

---

## 4. Agent-facing Tool API

### 4.1 Tool operation

| 逻辑 Tool | 建议 operationId | 建议 REST | 改变状态 |
| --- | --- | --- | --- |
| talos.testing.get_capabilities | getTestingCapabilities | GET /v1/tools/testing/capabilities | 否 |
| talos.testing.submit | submitTestingRun | PUT /v1/tools/testing/runs/{run_id} | 是 |
| talos.testing.get | getTestingRun | GET /v1/tools/testing/runs/{run_id} | 否 |
| talos.testing.events | listTestingRunEvents | GET /v1/tools/testing/runs/{run_id}/events | 否 |
| talos.testing.cancel | cancelTestingRun | POST /v1/tools/testing/runs/{run_id}:cancel | 是 |

Talos owning repo 可以调整 path，但不得改变 operation 的异步、幂等和 bounded 语义。OpenAPI 必须提供稳定 operationId，由 NyxID catalog 投影为 Agent Tool。

### 4.2 get_capabilities

响应只包含非敏感能力和硬限制：

~~~json
{
  "schema_version": "talos.testing-capabilities/v1",
  "planning_contracts": [
    "pql.project-pack-snapshot/v1",
    "pql.test-selection/v1",
    "pql.testing-design-input-set.v1"
  ],
  "tool_contracts": ["talos.testing-tool-request/v1"],
  "task_contracts": ["talos.testing-task/v1"],
  "execution_profiles": ["local_qa_agent_mvp"],
  "runtime_capabilities": ["local-qa-mvp/v1"],
  "result_contracts": [
    "testing-case-result-set.v2",
    "testing-evidence-manifest.v1",
    "qa.local-cleanup-receipt/v2"
  ],
  "backends": ["browser"],
  "browsers": ["chromium"],
  "secret_refs_supported": false,
  "max_concurrency_per_machine": 1,
  "limits": {
    "max_wall_time_ms": 600000,
    "max_cases": 20,
    "max_actions": 200,
    "max_events": 2000,
    "max_screenshots": 20,
    "max_screenshot_bytes": 5242880,
    "max_json_evidence_bytes": 1048576,
    "max_total_artifact_bytes": 52428800,
    "max_error_bytes": 4096
  }
}
~~~

这是 service-level 上限。实际 submit 仍要经过 pool/machine capability matching。

### 4.3 submit

使用 PUT /runs/{run_id}，让 run_id 成为天然幂等资源身份。

~~~json
{
  "schema_version": "talos.testing-tool-request/v1",
  "idempotency_key": "snapshot:selection:revision:plan:environment:policy",
  "display_goal": "验证登录后进入首页",
  "planning_provenance": {
    "project_pack_snapshot": {
      "ref": "artifact://pql/project-pack-snapshot/snapshot_01",
      "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    },
    "test_selection": {
      "ref": "artifact://pql/test-selection/selection_01",
      "digest": "sha256:2222222222222222222222222222222222222222222222222222222222222222"
    },
    "testing_design_input_set": {
      "ref": "artifact://pql/testing-design-input-set/input_01",
      "digest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"
    }
  },
  "source": {
    "repository_id": "repo_example",
    "exact_revision": "0123456789abcdef0123456789abcdef01234567",
    "ref": "artifact://source/source_01",
    "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "structured_plan": {
    "ref": "artifact://plans/plan_01",
    "digest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "environment_profile": {
    "ref": "artifact://environments/env_01",
    "digest": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  },
  "runner": {
    "package_id": "testing-browser-runner",
    "version": "1.0",
    "digest": "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  },
  "execution_profile": "local_qa_agent_mvp",
  "placement_requirements": {
    "testing_runtime": "local-qa-mvp/v1"
  },
  "policy": {
    "network_scope": "environment_owned_loopback_exact_origins",
    "environment_port_handle_policy": {
      "source": "current_run_owned_handles",
      "allow_unowned_loopback": false
    },
    "allowed_actions": [
      "navigate",
      "click",
      "type",
      "key",
      "wait",
      "screenshot",
      "extract-structured-dom",
      "assert-visible",
      "assert-text",
      "assert-url"
    ],
    "allowed_evidence_media": [
      "image/png",
      "application/vnd.fkst.testing.sanitized+json"
    ],
    "secret_refs": [],
    "budgets": {
      "wall_time_ms": 600000,
      "max_cases": 20,
      "max_actions": 200,
      "max_events": 2000,
      "max_screenshots": 20,
      "max_screenshot_bytes": 5242880,
      "max_json_evidence_bytes": 1048576,
      "max_total_artifact_bytes": 52428800
    }
  }
}
~~~

请求禁止出现：

- host path、cwd、raw command、argv、env；
- Compose YAML、Docker socket 或 image override；
- arbitrary URL 或 caller-provided loopback origin；URL 只能来自冻结 Plan 中的逻辑 service alias，并在 Environment ready 后解析为当前 Run 的 Environment-owned port handle 所对应的 exact origin；
- CDP endpoint、Chrome profile path、cookie 或 header；
- inline executable source、inline script 或 plugin；
- 非空 secret_refs；
- floating branch/tag、未固定 package version 或缺失 digest。
- caller-provided pool_id、machine_id、lease、generation 或 fence；MVP placement 由 Talos execution policy 决定。

MVP 的 Talos execution policy 固定把满足下列条件的请求映射到 qa-macos-canary：

~~~text
verified caller org/group
+ repository_id
+ execution_profile = local_qa_agent_mvp
+ testing_runtime = local-qa-mvp/v1
+ valid PQL provenance
-> pool = qa-macos-canary
-> requirements = darwin + arm64 + chromium + local-qa-mvp/v1
~~~

PQL 不生成或修改该映射。未来多 pool 版本应使用 Talos-owned policy ref，而不是让 PQL 直接选择 machine。

Loopback 网络边界由 Runtime 在 Environment ready 后生成，而不是由 caller 提交通配符。每个可导航 origin 必须精确等于当前 Run inventory 中一个 active Environment-owned port handle 推导出的 `scheme + 127.0.0.1 + concrete_port`；handle 被释放、替换或 ownership generation 失效后，对应 origin 立即失效。Runtime 和 Browser Provider 禁止枚举、探测或访问同机其他 loopback port，包括用户已有服务。

Acceptance 响应：

~~~json
{
  "schema_version": "talos.testing-run-acceptance/v1",
  "run_id": "qa_run_01",
  "accepted": true,
  "replayed": false,
  "control_status": "submitted",
  "request_digest": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "created_at": "2026-08-18T10:00:00Z"
}
~~~

accepted=true 只表示 Talos 接受了 QARun，不表示 machine 已选择、Runtime 已接受或测试已开始。

### 4.4 get

返回 bounded Snapshot：

~~~json
{
  "schema_version": "talos.testing-run-snapshot/v1",
  "run_id": "qa_run_01",
  "snapshot_version": 17,
  "snapshot_ref": "talos://testing/runs/qa_run_01/snapshots/17",
  "snapshot_digest": "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "resume_cursor": "evt_cursor_snapshot_v17_after_24",
  "control_status": "running",
  "execution_outcome": "executing",
  "evidence_outcome": "staging",
  "upload_outcome": "pending",
  "cleanup_outcome": "pending",
  "attempt": {
    "attempt_id": "attempt_01",
    "task_id": "task_01",
    "generation": 1,
    "machine_id": "qa-mac-01"
  },
  "progress": {
    "phase": "executing_plan",
    "completed_cases": 1,
    "total_cases": 3,
    "last_event_sequence": 24
  },
  "summary": null,
  "results": null,
  "safe_error": null,
  "updated_at": "2026-08-18T10:02:30Z"
}
~~~

`resume_cursor` 是由 Talos 生成、与 `run_id + snapshot_version + snapshot_digest + progress.last_event_sequence` 绑定的 opaque exclusive cursor。`get` 必须在同一个 Run read barrier 下冻结 Snapshot 和 cursor；调用方不得从 sequence 或 version 自行构造 cursor。相同 Snapshot version 的重放必须返回相同 digest 和等价 resume cursor。

Terminal results 只返回引用：

~~~json
{
  "case_result_set": {
    "ref": "artifact://results/case-result-set-01",
    "digest": "sha256:..."
  },
  "evidence_manifest": {
    "ref": "artifact://results/evidence-manifest-01",
    "digest": "sha256:..."
  },
  "cleanup_receipt": {
    "ref": "artifact://results/cleanup-receipt-01",
    "digest": "sha256:..."
  }
}
~~~

允许 inline 返回小型 summary：

~~~json
{
  "total": 3,
  "passed": 2,
  "failed": 1,
  "blocked": 0,
  "error": 0
}
~~~

### 4.5 events

接口：

~~~text
GET /v1/tools/testing/runs/{run_id}/events?cursor=evt_cursor_24&limit=100
~~~

响应：

~~~json
{
  "schema_version": "talos.testing-event-page/v1",
  "run_id": "qa_run_01",
  "events": [
    {
      "sequence": 25,
      "type": "case.completed",
      "time": "2026-08-18T10:02:35Z",
      "data": {
        "case_id": "login-redirect",
        "outcome": "passed"
      }
    }
  ],
  "next_cursor": "evt_cursor_25",
  "has_more": false
}
~~~

当 cursor 已超出 retention window 时，返回可机器恢复的稳定错误：

~~~json
{
  "code": "cursor_expired",
  "retryable": true,
  "replacement_cursor": "evt_cursor_snapshot_v21_after_40",
  "snapshot_ref": "talos://testing/runs/qa_run_01/snapshots/21",
  "snapshot_version": 21,
  "snapshot_digest": "sha256:abababababababababababababababababababababababababababababababab"
}
~~~

规则：

- sequence 在单个 Run 内严格单调递增，但对外只作为 informational field；
- cursor 是 opaque exclusive cursor，caller 不得解析或自行构造；
- 同 cursor 重放必须返回等价 page；同 sequence 重放必须 canonical digest 等价；
- 单页最多 100 events；
- event 不能携带 screenshot、raw DOM、log、cookie、header 或绝对路径；
- caller 用 cursor 增量读取，MVP 不依赖长连接；invalid/stale cursor 返回稳定 application error；expired cursor 必须返回 replacement cursor 和它绑定的 Snapshot ref/version/digest。
- resync 使用无事件缺口算法：Talos 在同一个 read barrier 下先冻结包含 `last_event_sequence=S` 的 canonical Snapshot，再签发只读取 `sequence>S` 的 replacement cursor；caller 校验 Snapshot digest、用该 Snapshot 原子替换本地投影，然后从 replacement cursor 继续。这样 `<=S` 的事实由 Snapshot 覆盖，`>S` 的事实由 events 覆盖，不允许二者之间出现缺口或重复产生状态副作用。
- resync 期间 replacement cursor 再次过期时，caller 丢弃未提交的 resync page，使用新返回的 Snapshot/cursor 重做；不得把两个 Snapshot version 的 page 拼接成一次恢复。

### 4.6 cancel

请求：

~~~json
{
  "schema_version": "talos.testing-cancel-request/v1",
  "idempotency_scope": "talos.testing.cancel:qa_run_01",
  "idempotency_key": "cancel_01",
  "canonical_request_digest": "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
  "reason": "user_requested"
}
~~~

响应：

~~~json
{
  "schema_version": "talos.testing-cancel-ack/v1",
  "run_id": "qa_run_01",
  "accepted": true,
  "replayed": false,
  "already_terminal": false,
  "control_status": "cancel_requested",
  "canonical_request_digest": "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd"
}
~~~

CancelAck 只表示取消意图已接受，不承诺 action 已停止、Chrome 已关闭或 cleanup 已完成。调用方必须继续通过 get/events 观察终态。

`idempotency_scope` 必须由 operation 和 path 中的 `run_id` 规范生成，caller 不能把其他 Run 的 key 搬入本 Run。Talos strict parse 后按 JCS 对除 `canonical_request_digest` 外的完整请求和 path-bound run identity 重新计算 digest：同 scope + key + digest 返回原 CancelAck 并标记 `replayed=true`；同 scope + key 不同 digest 在写 cancel intent、修改 reservation/lease/fence 或创建任何 cleanup effect 前返回 `idempotency_conflict`。

### 4.7 PQL TestingToolClient

product-quality-loop 增加 provider-neutral client，建议实现位置：

~~~text
skills/product-quality-loop/scripts/testing_tool_client.py
~~~

逻辑接口固定为：

~~~text
get_capabilities()
submit(SubmitTestingRunRequest)
get(run_id)
events(run_id, cursor, limit)
cancel(CancelTestingRunRequest)
~~~

Client 规则：

- 通过注入的 NyxID authenticated transport 调用 Talos，不读取、刷新、保存或回显 bearer token；
- 只接收 immutable ref/digest、run identity 和 bounded display metadata；
- 在 submit 前验证 ProjectPackSnapshot -> TestSelection -> InputSet -> StructuredPlan provenance 完整；
- 不调用 worker claim/heartbeat/result API；
- 不选择 pool/machine，不解释 lease/fence；
- 不直连 Runtime loopback；
- Tool 不可用时不 fallback 到 PQL legacy executor、browse、computer_use 或 shell；
- transport error 与 Talos application error 分层；
- get/events 只保存 bounded projection 和 opaque refs，不把 task completed 推断为 Case passed。

PQL TestingRunRecord：

~~~json
{
  "schema_version": "pql.testing-run-record/v1",
  "record_id": "pql_run_record_01",
  "project_pack_snapshot": {
    "ref": "artifact://pql/project-pack-snapshot/snapshot_01",
    "digest": "sha256:..."
  },
  "test_selection": {
    "ref": "artifact://pql/test-selection/selection_01",
    "digest": "sha256:..."
  },
  "testing_design_input_set": {
    "ref": "artifact://pql/testing-design-input-set/input_01",
    "digest": "sha256:..."
  },
  "structured_plan": {
    "ref": "artifact://plans/plan_01",
    "digest": "sha256:..."
  },
  "talos_run_id": "qa_run_01",
  "terminal_snapshot": {
    "ref": "artifact://talos/run-snapshots/qa_run_01",
    "digest": "sha256:..."
  },
  "case_result_set": {
    "ref": "artifact://results/case-result-set-01",
    "digest": "sha256:..."
  },
  "evidence_manifest": {
    "ref": "artifact://results/evidence-manifest-01",
    "digest": "sha256:..."
  },
  "cleanup_receipt": {
    "ref": "artifact://results/cleanup-receipt-01",
    "digest": "sha256:..."
  }
}
~~~

该记录是 execution correlation receipt，不是 QualityEvaluation，也不能直接改变 TestCaseAsset lifecycle。

---

## 5. Talos 内部合同

### 5.1 Strict task union

目标：

~~~text
TalosTask = BrowserTask | TestingTask
~~~

MVP TestingTask：

~~~json
{
  "schema_version": "talos.testing-task/v1",
  "id": "task_01",
  "kind": "testing",
  "interaction": "managed",
  "qa_run_id": "qa_run_01",
  "dispatch_attempt_id": "attempt_01",
  "generation": 1,
  "machine_id": "qa-mac-01",
  "project_pack_snapshot_ref": "artifact://pql/project-pack-snapshot/snapshot_01",
  "project_pack_snapshot_digest": "sha256:...",
  "test_selection_ref": "artifact://pql/test-selection/selection_01",
  "test_selection_digest": "sha256:...",
  "testing_design_input_set_ref": "artifact://pql/testing-design-input-set/input_01",
  "testing_design_input_set_digest": "sha256:...",
  "source_ref": "artifact://source/source_01",
  "source_digest": "sha256:...",
  "plan_ref": "artifact://plans/plan_01",
  "plan_digest": "sha256:...",
  "environment_ref": "artifact://environments/env_01",
  "environment_digest": "sha256:...",
  "runner_ref": "package://testing-browser-runner/1.0",
  "runner_digest": "sha256:...",
  "policy_ref": "talos://policies/policy_01",
  "policy_digest": "sha256:...",
  "local_request_authorization": {
    "ref": "authorization://local-qa-request/start-01",
    "digest": "sha256:...",
    "expires_at": "2026-08-18T10:15:00Z"
  },
  "expected_runtime_capability": "local-qa-mvp/v1",
  "deadline": "2026-08-18T10:10:00Z"
}
~~~

TestingTask 不携带 Artifact bytes、raw Source、raw Plan、worker token、NyxID bearer、local credential 或 executable command。TestingExecutor 必须解析 `local_request_authorization` 指向的完整 signed `LocalQARequestAuthorization(operation="start")`，逐项验证其中的 task/attempt/lease/machine/worker/generation/fence/lease-claim-ref binding 与当前 claim 一致，再把该对象原样嵌入 `LocalQARunRequest.authorization`；禁止把它解释或转换成 Hardened Design/Execution Grant。Local QA Host 必须独立通过配置好的 Talos current-claim resolver 解析同一 claim ref，并在 admission 时拒绝 superseded generation/fence。

### 5.2 Machine capability advertisement

支持 MVP 的 worker/machine 至少广告：

~~~json
{
  "testing_runtime": "local-qa-mvp/v1",
  "testing_contracts": ["talos.testing-task/v1"],
  "testing_backends": ["browser"],
  "browser": "chromium",
  "os": "darwin",
  "arch": "arm64",
  "headed_display": true,
  "max_testing_concurrency": 1,
  "runner_packages": [
    {
      "id": "testing-browser-runner",
      "version": "1.0",
      "digest": "sha256:..."
    }
  ]
}
~~~

Scheduler 必须先完成 capability reservation 并冻结 exact attempt binding，再请求 Hosted Local QA Authorization Authority 签发 operation-specific `LocalQARequestAuthorization`。Machine tags 只是索引，最终能力由当前 worker/runtime handshake 确认。

### 5.3 Lease、generation 和 fence

worker claim 至少返回：

~~~text
task_id
attempt_id
lease_id
lease_token
generation
fence_token
lease_expires_at
~~~

规则：

- Talos Scheduler、worker 和 TestingExecutor 在新 dispatch、heartbeat、progress/result commit 前检查 cancel、deadline、lease 和 Talos attempt fence；
- stale Talos attempt 不能发起新的 Runtime request 或提交 Talos progress/result；它不是 Hardened `ExecutionFence`，也不能使已被 Local Host durable accepted 的 Run 跨机器重跑；
- Local Host 在 admission 时验证 signed `talos_attempt_binding`，执行期间检查 durable local cancel/deadline；本 MVP 不要求 Host 实现 Hardened fence machinery；
- heartbeat 只携带 phase、bounded counts 和 receipt refs；
- local acceptance 前 lease 丢失可以创建新 attempt；
- local acceptance 后 lease/worker 丢失进入 reconcile_required；
- acceptance 后默认不重新执行已经开始的 Case。

---

## 6. talos-worker 与 Local QA Runtime

### 6.1 Worker 目标结构

~~~text
WorkerDaemon
  |-- BrowserTaskRuntime
  |     |-- Existing BrowserExecutor
  |-- TestingTaskRuntime
        |-- TestingExecutor
              |-- LocalQARuntimeAdapter
~~~

TestingExecutor 固定打包进 worker，不从 task 动态加载代码。

### 6.2 TestingExecutor 职责

负责：

- 按 kind=testing dispatch；
- 验证 task contract major；
- 调用 Runtime get_capabilities；
- 验证 runner/package/profile capability；
- 将 TestingTask 转为严格 LocalQARunRequest；
- 调用 Runtime submit/get/events/cancel；
- 将 bounded progress 投影到 Talos heartbeat；
- 在 cancel、deadline、shutdown 或 Talos attempt fence loss 时停止新 dispatch 并进入 reconcile；只有取得 operation-specific signed cancel authorization 后才调用 Runtime cancel；
- terminal result/ref/digest 幂等提交；
- daemon restart 后 reconcile 已 local accepted 的 Run。

不负责：

- materialize Source；
- 启动 Compose、进程、端口或 Chrome；
- 解释 Structured Plan；
- 执行 action；
- 计算 AssertionResult/CaseResult；
- 直接读取 raw Evidence；
- 保存 Secret；
- 生成 Final Quality 或 Report。

### 6.3 Runtime 最小接口

~~~text
GET  /v1/health
PUT  /v1/runs/{run_id}
GET  /v1/runs/{run_id}
GET  /v1/runs/{run_id}/events?after_sequence=N&limit=M
POST /v1/runs/{run_id}:cancel
~~~

约束：

- 只监听 Unix domain socket 或 loopback；
- 使用安装时生成、0600 保存的 local credential；
- Runtime 同时验证 local credential 与 operation-specific signed `LocalQARequestAuthorization`，并校验 caller/node/device/run/profile、request/body digest 以及 task/attempt/lease/machine/worker/generation/fence/lease-claim-ref binding；start admission 还必须通过 current-claim resolver 拒绝 superseded claim；
- Runtime/Testing Packages 验证 PQL Snapshot、Selection、InputSet 和 StructuredPlan ref/digest provenance；
- credential、authorization body/signature 和 worker token 不进入 event、result、log 或 Artifact；
- 同 run/key/digest replay；同 key 或 run 不同 digest fail closed。

### 6.4 Runtime 执行流水线

~~~text
strict parse
  -> capability/admission
  -> canonical request digest
  -> local credential + LocalQARequestAuthorization verification
  -> atomic Journal acceptance
  -> per-run workspace
  -> exact Source materialization
  -> approved Environment Profile + readiness
  -> Playwright-controlled system Chrome process + temporary profile/downloads
  -> Testing Packages execute Structured Plan
  -> Observation + AssertionResult + CaseResultSet
  -> Evidence quarantine/redaction/validation
  -> execution freeze
  -> exact cleanup
  -> CleanupReceipt
  -> Artifact delivery/repair
  -> terminal Snapshot
~~~

Runtime 必须在 single-writer Journal 原子写入 acceptance 和 sequence=1 event 后，才能创建本地资源。

---

## 7. Browser、Plan、Result 和 Evidence

### 7.1 Browser 约束

MVP 使用 Playwright 控制 Runtime allowlist 中的本机 Chrome executable。Runtime capability 必须绑定 Chrome channel/version/executable digest 与 Playwright adapter version；testing profile 不使用 worker 的 bundled Chromium，也不接受 caller 提供 executable path：

- 每个 Run 独立 browser process；
- 每个 Run 独立 temporary profile；
- 每个 Run 独立 downloads directory；
- 不连接当前已打开的普通 Chrome；
- 不使用 Talos persistent profile；
- 不接收 CDP endpoint/token；
- 不复用用户 cookie、local storage 或登录态；
- terminal/cleanup 后删除，除非形成明确 residual。

需要认证的测试目标，MVP 只能使用测试环境提供的固定非 Secret fixture/session bootstrap。个人登录态或 Secret 场景进入后续版本。

### 7.2 Structured Plan

MVP 允许：

~~~text
navigate
click
type
key
wait
screenshot
extract-structured-dom
assert-visible
assert-text
assert-url
~~~

MVP 禁止：

~~~text
evaluate-javascript
raw-cdp
shell
filesystem
network-body-capture
download-content
dynamic-plugin
LLM-generated-runtime-action
~~~

每个 effect 前重新检查：

- cancel/deadline；
- admission 时已持久化的 accepted attempt/lease/generation/fence identity；Talos current fence 只在 start admission 前通过 resolver 做 currentness 校验；
- action allowlist；
- URL scheme/origin；
- action/screenshot/byte budget；
- Runtime resource ownership。

### 7.3 Canonical outputs

MVP terminal execution 至少产生：

1. testing-case-result-set.v2
2. testing-evidence-manifest.v1
3. qa.local-cleanup-receipt/v2

CaseResultSet 至少表达：

~~~text
run_id
plan identity/digest
runner identity/digest
case_id
assertion_id
outcome = passed | failed | blocked | error | cancelled | lost_or_inconclusive
observation refs
evidence refs
started_at/completed_at
~~~

CaseResultSet 必须 digest-bind EvidenceManifest。引用缺失、重复、跨 Run、media/size/digest 不匹配必须 fail closed。

### 7.4 Evidence

允许离开设备的 Evidence 只有：

- validated image/png；
- application/vnd.fkst.testing.sanitized+json。

固定流程：

~~~text
raw observation
  -> bounded local quarantine
  -> safe projection/redaction
  -> media/schema/size/canary validation
  -> post-redaction SHA-256
  -> EvidenceManifest
  -> cleanup raw quarantine
  -> Proposed Hosted ArtifactStore upload/commit (Decision pending)
  -> immutable ref + digest
~~~

Tool、heartbeat 和 events 不得 inline 返回 screenshot base64、raw DOM/trace/network body/download、cookie/header/Secret、local path、unbounded log 或 raw stack。

### 7.5 Proposed Hosted ArtifactStore MVP port（Decision pending）

以下只定义候选 consumer contract。只有 owner、storage provider 和 Runtime 认证边界被接受后，才可作为 Active contract 或 production implementation target。

~~~text
prepare(run_id, task_id, attempt_id, generation, fence,
        runtime_instance_id, subject, audience,
        evidence_id, claim_ref, media_type, size, digest, idempotency_key)
  -> upload_grant + stable_object_key

commit(stable_object_key, attempt_id, generation, fence, claim_ref,
       runtime_instance_id, subject, audience, size, digest)
  -> artifact_ref + ingest_receipt

lookup(stable_object_key, digest)
  -> existing receipt | not_found
~~~

要求：

- object key + digest 幂等；
- same key/different digest fail closed；
- grant 必须绑定当前 attempt 的 generation/fence/claim、Runtime instance、subject/audience、object identity、method/path、nonce/not-before/expiry 和 idempotency key；
- `prepare` 必须由认证的 Talos/TestingExecutor caller，或 local credential + 对应 signed authorization 调用；provider-wide storage credential 不得进入 Runtime；
- upload gateway 或等价 provider policy 必须在 bytes 被接受前校验 subject/audience、attempt/fence、revocation 和 expiry；未绑定 current claim 的裸 presigned URL 不满足 MVP；
- stale/revoked generation、fence 或 Runtime identity 必须在 bytes 被接受前 fail closed，`commit` 还要再次校验相同 binding；
- upload bytes 后 ack 丢失可查询或重试；
- Artifact outage 不阻止本地 execution freeze 和 cleanup；
- sanitized staging 有固定 TTL；
- delivery repair 不触发测试重跑。

---

## 8. 状态模型

### 8.1 Control status

~~~mermaid
stateDiagram-v2
  [*] --> submitted
  submitted --> reserved
  reserved --> claimed
  claimed --> local_accepted
  claimed --> submitted: lease lost before acceptance
  local_accepted --> running
  submitted --> cancel_requested
  reserved --> cancel_requested
  claimed --> cancel_requested
  local_accepted --> cancel_requested
  running --> cancel_requested
  running --> closing
  cancel_requested --> closing
  running --> reconcile_required: worker/lease lost
  reconcile_required --> cancel_requested
  reconcile_required --> closing: same-machine reconcile
  reconcile_required --> abandoned: signed reconcile closure deadline
  closing --> completed
  closing --> failed
  closing --> cancelled
  completed --> [*]
  failed --> [*]
  cancelled --> [*]
  abandoned --> [*]
~~~

### 8.2 正交 outcomes

RunSnapshot 分别表达：

~~~text
control_status
execution_outcome
evidence_outcome
upload_outcome
cleanup_outcome
~~~

| 字段 | 值 |
| --- | --- |
| execution_outcome | not_started、executing、passed、failed、blocked、error、cancelled、lost_or_inconclusive、unobserved |
| evidence_outcome | not_required、staging、complete、partial、unavailable、policy_blocked |
| upload_outcome | not_required、pending、uploaded、upload_expired |
| cleanup_outcome | not_required、pending、complete、residual_retryable、residual_blocking、unobserved |

组合规则：

- control_status=completed 不等于 execution_outcome=passed；
- assertion failure 是 control_status=completed + execution_outcome=failed；
- Artifact outage 可以是 execution_outcome=passed + evidence_outcome=complete + upload_outcome=pending；
- cleanup_outcome=residual_blocking 必须阻止 machine testing slot 静默复用；
- cleanup_outcome=residual_retryable 默认同样阻止 testing slot 复用；只有 authority-backed CleanupReceipt 明确证明所有 residual 已被隔离、不可达且不会与后续 Run 的 port/profile/process/workspace/credential handle 冲突时，Scheduler 才能释放 slot；
- `unobserved` 只表示 Hosted control projection 未取得对应本地 authority Receipt，不是 Runtime 产生的执行或 cleanup 事实；
- upload outcome 可以在 execution freeze 后按单调版本继续变化；
- Runtime/worker 不生成 Final Quality。

---

## 9. 幂等、取消和故障恢复

### 9.1 幂等

| 输入关系 | 行为 |
| --- | --- |
| 同 run_id + idempotency_key + request_digest | replay 原 acceptance/current snapshot |
| 同 idempotency key、不同 digest | idempotency_conflict |
| 同 run_id、不同 digest | run_identity_conflict |
| 同 terminal key、同 result digest | replay terminal ack |
| 同 Artifact object key、同 digest | replay/query receipt |
| 同 Artifact key、不同 digest | artifact_integrity_conflict |

重复 submit 不得创建第二个 QARun、TestingTask、workspace、Chrome 或 Artifact object。

### 9.2 取消

~~~text
Tool 接受 cancel intent
  -> Talos 持久化 cancel_requested
  -> [尚未 local accepted] Scheduler 撤销 reservation/authorization/lease
     -> ReservationCancellationReceipt + NoLocalAcceptanceFact
     -> execution_outcome=not_started + cleanup_outcome=not_required
  -> [已经 local accepted] worker 观察 cancel
     -> TestingExecutor 调用 Runtime cancel
     -> Runtime 停止创建新 effect
     -> 冻结 execution outcome
     -> cleanup
     -> CleanupReceipt
  -> Talos terminal projection
~~~

取消不得删除不属于本 Run 的资源，不得把未知结果推断成 assertion failed，不得自动跨机器重跑，也不得提前删除仍需 delivery repair 的 sanitized staging。

Cancel 可在 `submitted`、`reserved`、`claimed`、`local_accepted`、`running` 和 `reconcile_required` 接受。`submitted/reserved/claimed` 路径不得等待不存在的 Runtime Run 或 CleanupReceipt；Scheduler 必须以绑定 run/attempt/reservation/lease 的 `ReservationCancellationReceipt` 和 `NoLocalAcceptanceFact` 证明没有本机 acceptance/资源，再关闭为 cancelled。`local_accepted` 之后必须走同机 quiesce、freeze、cleanup。Scheduler、worker 和 TestingExecutor 在每次 dispatch、retry 和 Talos completion commit 前重新读取 durable cancel intent 与 current Talos attempt fence；Runtime 在每个本地副作用前读取已持久化的 local cancel intent/deadline。任一对应检查失败时禁止创建新 effect，并把已发生但未确认的 effect 转入 reconcile。

### 9.3 故障行为

| 故障点 | MVP 行为 |
| --- | --- |
| claim 后、local acceptance 前 worker 失联 | lease 到期，允许新 attempt |
| local acceptance 后 worker 失联 | same-machine reconcile，不跨机器重跑 |
| acceptance 后、资源创建前 Runtime 崩溃 | Journal 恢复，继续 close/cleanup，不自动开始 Case |
| Chrome launch 后、action 前崩溃 | `not_started_then_cleanup`；默认不重跑，只有显式 policy 可在同 machine 取得新的 signed attempt authorization 后创建新 attempt |
| action 后、assertion 前崩溃 | inconclusive，随后 cleanup |
| result frozen 后 Evidence 失败 | 不重跑；evidence unavailable 或 pending_upload |
| cleanup 中断 | 根据 exact OwnedHandle 幂等继续 |
| Artifact bytes 上传后 ack 丢失 | same key + digest lookup/retry |
| Talos/NyxID 暂时不可达 | 本地 freeze 和 cleanup 继续；恢复后重放 bounded events/results |

`reconcile_required` 不是无期限状态。MVP 从进入该状态起使用 2 分钟 monotonic deadline；期间只允许目标 machine 上的 authority-bound discovery、quiesce、receipt lookup 和 cleanup，不允许新 Case、retry 或跨 machine placement。若同机 Runtime 在 deadline 内提交绑定 run、signed `talos_attempt_binding` digest 与 local ownership generation 的签名 ReconcileReceipt，Talos 按 Receipt 单调推进 closing。

若 deadline 到期仍无法取得足以证明执行和 cleanup 的 Receipt，Talos QARun Authority 必须签发并持久化 `talos.testing-reconcile-closure/v1`，绑定 run/attempt/machine/generation/fence、deadline、last authoritative Snapshot/Receipt refs 和 decision nonce。该 decision 只把 `control_status` 收敛为 `abandoned`，记录 `local_execution_observation=unobserved`、`local_cleanup_observation=unobserved`，并给出保守的 control disposition `execution=lost_or_inconclusive`、`cleanup=residual_blocking`；它不能伪造或覆盖 Runtime/Testing Packages 的 execution outcome、CleanupReceipt 或 OwnedHandle lifecycle。系统禁止自动重跑，并保持 machine testing slot 与相关资源域隔离。后续签名 Reconcile/CleanupReceipt 只能按 closure version 单调补充本地事实和解除隔离，不能重开 Case 或倒退 control terminality。

---

## 10. 安全和数据边界

### 10.1 身份链

~~~text
NyxID caller identity
  -> Talos QARun ownership
  -> Talos machine reservation
  -> signed/bound LocalQARequestAuthorization
  -> worker machine identity + lease + Talos attempt binding
  -> Runtime local credential + executable identity
  -> local acceptance
~~~

NyxID 认证成功不等于 Runtime authorization。Talos claim 成功也不等于 Runtime acceptance。

### 10.2 Admission 前 fail closed

- 未知 schema major 或未知字段；
- 请求超过任何 bound；
- 非空 secret_refs；
- source/plan/environment/runner/policy digest 缺失或格式错误；
- floating revision/version；
- LocalQARequestAuthorization 过期、签名错误、body digest 不一致或 operation/method/path 绑定错误；
- authorization 中的 task/attempt/lease/machine/worker/generation/fence/lease-claim-ref binding 与 current-claim resolver 返回的 signed claim 不匹配，或 resolver 不可用；
- Runtime capability 或 package digest 不匹配；
- PQL Snapshot、Selection、InputSet、StructuredPlan provenance 缺失、跨项目、跨 revision、digest 不匹配或包含未批准 Asset；
- machine 已有 execution-bearing Testing Run；
- arbitrary command/path/env/CDP/profile/cookie/header；
- URL 未解析到当前 Run Environment-owned port handle 的 exact origin、尝试枚举/探测其他 loopback 服务，或 action/evidence media 超出 allowlist；
- 请求 hardened_untrusted_code 或未知 profile。

### 10.3 SafeError

对外错误最多包含：

~~~text
code
safe_message
retryable
phase
field_path (optional)
correlation_id
~~~

不得包含 token、credential、cookie、header、local path、argv、env、Source 内容、raw stack、raw DOM、network body 或超过 4096 bytes 的细节。

---

## 11. MVP 固定限制

| 项目 | MVP 上限 |
| --- | ---: |
| Tool request body | 256 KiB |
| 单 machine 并发 Testing Run | 1 |
| wall time | 10 分钟 |
| cases | 20 |
| actions | 200 |
| events | 2000 |
| event page size | 100 |
| screenshots | 20 |
| 单张 PNG | 5 MiB |
| 单个 sanitized JSON Evidence | 1 MiB |
| 总 Artifact | 50 MiB |
| SafeError | 4 KiB |
| sanitized staging TTL | 24 小时 |
| control heartbeat | 10 秒 |
| local progress poll | 2 秒 |
| cleanup deadline | 2 分钟 |
| reconcile deadline | 2 分钟 |

所有 bytes、count、timeout 和 page size 必须进入 machine-readable schema/fixture。

---

## 12. 实施顺序

### M0：合同冻结

产出：

- pql.project-pack-snapshot/v1；
- pql.test-selection/v1；
- pql.testing-design-input-set.v1；
- pql.testing-run-record/v1；
- 五个 Tool OpenAPI schema；
- talos.testing-task/v1；
- talos.testing-capabilities/v1；
- RunSnapshot/Event/SafeError；
- CaseResultSet/EvidenceManifest/CleanupReceipt refs；
- bounds fixture；
- canonical digest golden vectors；
- idempotency/cancel/failpoint matrix。

Exit gate：PQL、Talos、worker、Runtime、Testing Packages 对 contract major、field ownership、provenance chain 和 digest projection 一致。

### M1-PQL：PQL Input 与 TestingToolClient

产出：

- 固定 product-quality-loop baseline 和 dependency lock；
- ProjectPackSnapshot 生成与 canonical digest；
- approved TestCaseAsset-bound TestSelection；
- pql.testing-design-input-set.v1；
- Testing Packages StructuredPlan adapter；
- provider-neutral TestingToolClient；
- PQL TestingRunRecord；
- PQL duplicate/conflict/cursor/application-error fixtures。

Exit gate：PQL 能从固定 Project Pack 和 approved TestCaseAsset 生成完整 provenance，调用 fake Talos Tool 完成 submit/get/events/cancel，并且不选择 pool/machine、不读取 credential、不解释 lease/fence 或 Final Quality。

### M1-Talos：Talos Tool 与 Scheduler

产出：

- get_capabilities/submit/get/events/cancel；
- durable QARun；
- strict TestingTask；
- capability reservation；
- attempt/generation/lease/fence；
- bounded event store；
- feature flag testing_tool_mvp。

Exit gate：无 worker 时也能验证 Tool 幂等、状态、cancel、错误和 capability rejection。

### M2：Worker TestingExecutor

产出：

- task kind dispatcher；
- TestingExecutor；
- LocalQARuntimeAdapter；
- heartbeat projection；
- AbortSignal/deadline/fence checks；
- terminal result replay；
- daemon restart reconcile。

Exit gate：现有 browse、computer_use 和 session conformance tests 不回归；testing 不支持时严格拒绝。

### M3：Runtime Browser 垂直链路

产出：

- local credential 和 operation-specific LocalQARequestAuthorization admission；
- SQLite Journal；
- exact Source workspace；
- approved Environment Profile/readiness；
- Playwright-controlled system Chrome process + temporary profile/downloads；
- 固定 Testing Package；
- typed actions/assertions；
- CaseResultSet；
- exact cleanup/CleanupReceipt。

Exit gate：成功、assertion failure、cancel、timeout、Chrome crash、Runtime restart 都能闭合且不留下未知资源。

### M4：Evidence 和 Proposed Hosted ArtifactStore（Decision pending）

产出：

- PNG/sanitized JSON quarantine；
- redaction/validation；
- EvidenceManifest；
- prepare/upload/commit/lookup；
- lost-ack reconcile；
- staging TTL；
- Artifact outage repair。

Exit gate：bytes 不进入 Tool/heartbeat；CaseResultSet 与 EvidenceManifest digest 绑定；cleanup 不等待云端恢复。

### M5：Canary E2E

~~~text
pool = qa-macos-canary
machine = one trusted macOS arm64 device
capacity = 1
browser = Playwright-controlled allowlisted system Chrome
runtime = local-qa-mvp/v1
secret_refs = []
~~~

Exit gate：

~~~text
PQL ProjectPackSnapshot
  -> approved TestSelection
  -> pql.testing-design-input-set.v1
  -> Testing Packages StructuredPlan
  -> PQL TestingToolClient
  -> NyxID Tool call
  -> Talos QARun
  -> Scheduler placement
  -> worker claim
  -> Runtime acceptance
  -> temporary system Chrome process
  -> typed assertion
  -> CaseResultSet
  -> EvidenceManifest
  -> CleanupReceipt
  -> Tool terminal Snapshot
  -> PQL TestingRunRecord
~~~

---

## 13. 验收矩阵

| 场景 | 必须结果 |
| --- | --- |
| PQL valid provenance | Snapshot -> Selection -> InputSet -> Plan 被接受并绑定到 QARun |
| PQL unapproved/revoked Asset | StructuredPlan 或 submit 前 fail closed；零 Talos task |
| PQL snapshot/selection revision mismatch | stable provenance_conflict；零 Talos task |
| PQL duplicate orchestration | replay 原 run/record；不创建第二次执行 |
| PQL attempts pool/machine selection | client/schema 拒绝；placement 只由 Talos policy 决定 |
| Happy path | task closed；execution passed；Evidence uploaded；cleanup complete |
| Assertion failure | task closed；execution failed；不是 infrastructure task failure |
| Duplicate submit，同 digest | replay 原 run；无第二个 task/workspace/browser |
| Duplicate submit，不同 digest | idempotency_conflict 或 run_identity_conflict |
| Unsupported pool/capability | placement 前拒绝；不降级 browse |
| Runtime admission rejection | 零本地资源副作用；bounded SafeError |
| User cancel | 停止新 effect；形成 CleanupReceipt；最终 cancelled/closed |
| Deadline | fenced cancel；deadline 后无新 effect；cleanup 收敛 |
| Worker crash，acceptance 前 | lease expiry 后允许新 attempt |
| Worker crash，acceptance 后 | same-machine reconcile；不跨机器重跑 |
| Runtime crash | Journal 恢复；不重跑已开始 Case；继续 cleanup |
| Chrome crash | execution error/inconclusive；cleanup complete |
| Artifact outage | execution/cleanup 可完成；delivery pending/expired 明确 |
| Upload ack lost | same object key + digest reconcile |
| Cleanup residual | residual 明确；testing slot 被阻塞 |
| Stale fence result | 拒绝状态/result/artifact 更新 |
| Secret/CDP/profile request | admission 前 fail closed |

### 13.1 首个自动化 acceptance case

1. PQL 从固定 Project Pack 生成 ProjectPackSnapshot。
2. PQL 从一个 published + approved + executable TestCaseAsset 生成 TestSelection。
3. PQL 生成 pql.testing-design-input-set.v1；Testing Packages 编译 StructuredPlan。
4. PQL TestingToolClient 经 NyxID submit，Talos execution policy 映射到 qa-macos-canary。
5. Source archive 启动固定 loopback Web app。
6. Environment Profile 使用固定、已批准的启动/readiness 定义。
7. Structured Plan 导航到 app，点击固定按钮，断言目标文本可见。
8. 生成一条 passed AssertionResult 和一个 CaseResult。
9. 生成一张 PNG 和一个 sanitized JSON Evidence。
10. 关闭本 Run 的 system Chrome process，停止环境，释放端口，删除 workspace/raw quarantine。
11. 上传 sanitized Evidence，返回三个 canonical refs/digests。
12. PQL 保存 TestingRunRecord，但不推断 Final Quality 或修改 Asset lifecycle。
13. 重放相同 orchestration，确认没有新的 QARun、task、本地资源、Artifact 或 PQL record identity。

---

## 14. 可观测性和发布

### 14.1 非敏感指标

- submit accepted/replayed/rejected；
- PQL snapshot/selection/input-set/plan provenance validation；
- PQL Tool client transport/application errors；
- placement latency；
- claim/local acceptance latency；
- active testing slots；
- heartbeat/lease expiry；
- execution duration；
- outcome counts；
- cleanup complete/residual；
- Artifact pending/uploaded/expired；
- idempotency conflict；
- stale fence rejection；
- bounded error code counts。

指标和日志只使用 opaque ID，不记录 Source/Plan 内容、cookie、header、token、local path 或 raw error。

### 14.2 Rollout

1. 默认关闭 testing_tool_mvp。
2. 仅对 qa-macos-canary pool 开启。
3. 只允许明确 NyxID group 调用 submit/cancel；read operations 单独配置 approval policy。
4. 先跑 PQL 固定 Project Pack + approved TestCaseAsset fixture，不运行真实项目。
5. 验收矩阵通过后，再允许一个批准项目、固定 Environment Profile 和服务端 Talos execution policy。
6. 任一 PQL provenance drift、stale fence、跨 Run Evidence、cleanup unknown ownership 或 Secret 泄露均立即关闭 feature flag。

---

## 15. MVP 后续扩展

MVP 验收后独立设计：

- Hosted Final Quality、Report、Settlement；
- HostedQualityFeedback ingestion、CoverageGap、AssetChangeProposal、ReviewDecision 和 PromotionReceipt 自动化；
- API 和 CLI testing backend；
- Firefox/WebKit/Windows/Linux matrix；
- Secret refs 和测试账号；
- richer Evidence；
- 多 machine 并发和组织级容量管理；
- hardened untrusted-code profile；
- signed recovery decision 和跨进程强隔离。

扩展不得改变 strict task、typed plan、digest binding、temporary profile、exact cleanup、bounded response 和 no silent fallback。

---

## 16. 完成定义

PQL + Talos Testing Tool MVP 只有在以下条件全部满足时完成：

1. PQL 发布 ProjectPackSnapshot、TestSelection、InputSet 和 TestingRunRecord schema/fixtures。
2. PQL 只允许 approved executable/regression Asset 进入 selection。
3. Testing Packages 能从 PQL input 编译 digest-bound StructuredPlan。
4. PQL TestingToolClient 实现五个 operation，且不选择 pool/machine、不直连 Runtime。
5. Talos OpenAPI 发布五个稳定 operationId。
6. Tool request 绑定 PQL Snapshot -> Selection -> InputSet -> StructuredPlan provenance。
7. Talos execution policy 根据 caller/project/profile 选择 qa-macos-canary，PQL 不传 pool/machine。
8. TaskCreate 成为 BrowserTask/TestingTask strict union。
9. machine 能广告可验证 runtime/package capability。
10. Scheduler 实现 reservation、attempt、lease、generation 和 fence。
11. worker 按 task kind dispatch，Testing 不进入 Browser autonomous planner。
12. Runtime 在原子 acceptance 前不创建本地资源。
13. 每个 Run 使用 allowlisted system Chrome executable 和临时 profile，不连接普通 Chrome/CDP/persistent profile，不使用 caller path 或 worker bundled Chromium。
14. 真实 PQL -> Talos -> Browser fixture 产生 AssertionResult、CaseResultSet 和 EvidenceManifest。
15. 成功、失败、取消、超时和 crash 都产生 CleanupReceipt 或明确 residual。
16. duplicate PQL orchestration/submit 不产生第二次执行、Artifact 或不同 identity 的 TestingRunRecord。
17. Artifact outage 不阻止 execution freeze 和 cleanup。
18. Tool/Event/Error 响应满足 bounds 且不泄露敏感数据。
19. browse、computer_use 和 interactive session 行为无回归。
20. 全部验收矩阵和 golden fixtures 在 PQL/Talos/Runtime CI 与真实 macOS arm64 canary machine 通过。

---

## 17. 与完整架构的关系

本文是完整 Talos Testing 架构的首个可交付切片。更完整的设计见：

- [Talos 有界 Testing 工具与本地 QA 执行架构设计提案](./talos-bounded-testing-tool-architecture.zh-CN.md)
- [PQL Testing 模块职责总结](./pql-testing-module-responsibilities.zh-CN.md)
- [FKST Local QA Host MVP 设计](../local-qa-host-mvp-design.zh-CN.md)
- [Local QA Runtime 实现缺口](../repo-gaps/local-qa-runtime-gap-analysis.zh-CN.md)
- [Testing Packages 调整方案](./repo-adjustments/fkst-packages-testing-adjustments.zh-CN.md)
- [product-quality-loop](https://github.com/YueZh127/product-quality-loop)
- [product-quality-loop 调整方案](./repo-adjustments/product-quality-loop-adjustments.zh-CN.md)

冲突处理：

1. 本文决定首个 PQL + Talos Testing MVP 的产品范围和交付门槛。
2. canonical Testing contracts 由 Testing Packages/qa-contracts owner 决定。
3. Talos owning repo 的正式 OpenAPI 和实现决定实际 route/operationId。
4. 任何差异必须通过版本化 contract 变更解决，不能静默放宽安全和幂等语义。
