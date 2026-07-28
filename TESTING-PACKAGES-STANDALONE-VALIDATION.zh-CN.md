# Testing Packages 独立联调与验证方案

> 状态：实施建议，尚未表示对应联调已经完成
>
> 日期：2026-07-28
>
> 验证范围：不依赖真实 PQL、NyxID 或 FKST Local QA Runtime，先验证 testing packages 自身闭环；Standalone 聚合结果只使用版本化 testkit report，不冒充生产 Runtime 契约

## 1. 结论

Testing Packages 可以并且应该先单独联调，不需要等待 PQL 或 FKST Local QA Runtime 完成。

推荐顺序为：

```text
Testing Packages Standalone
→ 接入真实 PQL ProjectPackSnapshot
→ 接入 workflow-qa
→ 使用 FKST Local QA Runtime 替换测试 Harness
→ 经 NyxID 在用户设备执行
```

PQL 是“测试策略和测试资产”的上游来源，Local QA Runtime 是“用户设备本地执行”的控制宿主。`testing-design`、`testing-runner`、`environment-factory`、`test-artifacts` 和 `quality-evaluation` 的领域逻辑不应在运行时硬依赖这两个系统。

Standalone 阶段使用符合正式契约的静态 Fixture 替代 PQL，使用受信任的测试 Harness 替代 Local QA Runtime。未来接入真实系统时只替换 Adapter 和数据来源，不修改 testing packages 的核心逻辑。

## 2. 本文回答的问题

本文明确以下事项：

- Testing Packages 在没有 PQL 时如何获得测试策略和资产输入。
- 在没有 Local QA Runtime 时如何启动 Fixture App 并执行测试。
- 哪些模块使用真实实现，哪些边界暂时使用 Test Adapter。
- Standalone 联调可以证明什么，不能证明什么。
- 如何为后续 PQL、workflow-qa、Local QA Runtime 和 NyxID 接入保留稳定契约。
- 第一轮应该实现哪些测试场景和验收标准。

## 3. 组件关系

```text
PQL
    负责“测什么”
    输出 ProjectPackSnapshot
                ↓
Testing Packages
    负责“生成什么计划、怎样执行、怎样断言、怎样组织证据”
    输出 StructuredPlan / CaseResult / EvidenceManifest
    这些是模块正式契约，不是 Standalone Harness 聚合报告
                ↓
FKST Local QA Runtime
    负责“在用户电脑上安全、可恢复地执行计划”
                ↓
NyxID
    负责“云端请求如何到达用户设备”
```

因此：

- `testing-runner` 不应调用 PQL API。
- `testing-design` 只消费版本化的 PQL Snapshot，不依赖 PQL 内部数据库和实现。
- Testing Packages 不应直接依赖 NyxID。
- Testing Packages 不应直接依赖 Local QA Runtime 的 SQLite、LaunchAgent、VM 或本地接口实现。
- Local QA Runtime 后续通过稳定的 Plan、Command、Event、Receipt 和 Artifact 契约调用 Testing Packages。

## 4. Standalone 验证的两条链路

### 4.1 链路 A：Runner 最小闭环

第一条链路不调用 `testing-design`，直接使用手写的 Structured Plan：

```text
手写 StructuredPlan Fixture
    ↓
testing-runner
    ↓
Environment Factory Test Adapter
    ↓
Fixture App
    ↓
Deterministic / Browser Backend
    ↓
结构化 Assertion
    ↓
CaseResult
    ↓
EvidenceManifest
    ↓
Test Cleanup
```

该链路优先验证：

- Structured Plan 是否能被严格解析。
- Plan DAG 和 Step dependency 是否正确推进。
- Backend 选择是否正确。
- Shell、CLI、HTTP 和 Browser Observation 是否可以转换为结构化 AssertionResult。
- Pass/Fail 是否由 `testing-runner` 根据 Assertion 决定。
- required Evidence 缺失时是否禁止 Case 通过。
- 无论执行成功或失败，Fixture App 和 Chrome 是否都会停止。

### 4.2 链路 B：Testing Packages 完整闭环

第二条链路使用符合 PQL 正式 schema 的静态 Snapshot Fixture：

```text
ProjectPackSnapshot Fixture
    ↓
testing-design
    ↓
StructuredPlan
    ↓
Policy Gate Test Adapter
    ↓
Environment Factory Test Adapter
    ↓
testing-runner
    ├── Deterministic Backend
    ├── Browser Backend
    └── Codex Backend Replay
    ↓
CaseResult
    ↓
test-artifacts
    ↓
EvidenceManifest
    ↓
quality-evaluation
    ↓
QualityEvaluation
    ↓
CoverageGap / AssetChangeProposal Fixture
```

这条链路验证 Testing Packages 之间的正式数据契约，但不调用真实 PQL 服务，也不创建伪造的批准或 Promotion 结果。`CoverageGap`、`AssetChangeProposal`、`PQLReviewDecision` 和 `ProjectPackPromotionReceipt` 是四种独立的权威对象；Standalone 只生成前两者的 Fixture，后两者必须留到真实 Review/Promotion 联调。

## 5. Standalone 阶段使用真实实现和 Test Adapter 的边界

| 组件 | Standalone 策略 | 说明 |
| --- | --- | --- |
| `qa-contracts` | 真实实现 | 所有输入输出必须经过正式 schema 和 digest 校验 |
| `testing-design` | 真实实现 | 消费固定 ProjectPackSnapshot Fixture |
| `testing-runner` | 真实实现 | 负责 Step、Assertion 和 Case 聚合 |
| Deterministic Backend | 真实实现 | 执行受信任 Fixture 的 CLI、HTTP 和测试命令 |
| Browser Backend | 真实实现 | 只使用系统 Google Chrome，不使用 ego-browser |
| Codex Backend | Replay/Test Adapter | 第一阶段不调用真实 Codex，使用固定 Action/Observation Fixture |
| `environment-factory` | Test Adapter | 创建临时 Workspace、启动 Fixture App、Readiness 和 Cleanup |
| `test-artifacts` | 真实实现 | 生成 Artifact metadata、digest 和 EvidenceManifest |
| `quality-evaluation` | 真实实现 | 根据 CaseResult 和 Evidence 生成质量分类 |
| PQL | Snapshot Fixture | 不连接真实 PQL API 或数据库 |
| PQL Promotion | 不执行 | 只生成 Proposal Fixture，不修改正式 Project Pack |
| workflow-qa | 不要求 | 后续可通过 Runtime Event Simulator 联调 |
| Local QA Runtime | 不使用 | Standalone Test Harness 暂时代替执行宿主 |
| NyxID | 不使用 | Standalone 测试不验证设备通道 |

## 6. PQL 输入 Fixture

即使暂时不连接 PQL，也不能为 Testing Packages 发明一套临时简化格式。Fixture 必须使用未来 PQL 正式输出的 schema。

示例：

```json
{
  "schema_version": "qa.pql-project-pack/v1",
  "project_pack_id": "sample-web-app",
  "version": "1.0.0",
  "content_digest": "sha256:...",
  "product_map": {
    "surfaces": [
      {
        "id": "login-page",
        "type": "web"
      }
    ]
  },
  "test_catalog": [
    {
      "case_id": "login-success",
      "title": "用户使用正确凭据登录",
      "priority": "P0",
      "backend": "browser",
      "expected_assertions": [
        {
          "type": "url",
          "operator": "equals",
          "value": "/dashboard"
        }
      ]
    }
  ],
  "fixtures": [],
  "selectors": [
    {
      "id": "login-button",
      "strategy": "test_id",
      "value": "login-submit"
    }
  ],
  "scope_policy": {
    "network": [
      "127.0.0.1"
    ],
    "secrets": []
  }
}
```

后续接入真实 PQL 时，只把数据来源从：

```text
fixtures/pql/sample-project-pack.v1.json
```

替换为：

```text
PQL ProjectPackSnapshot API / Artifact Pointer
```

`testing-design` 和后续模块不应因此修改。

PQL 闭环中的名称必须与正式契约一致：缺口使用 `CoverageGap`，设计变更使用不可变的 `AssetChangeProposal`，审批使用独立的 `PQLReviewDecision`，晋升结果使用 strict union `ProjectPackPromotionReceipt`。禁止使用宽泛的 `PQLProposal`、把 proposal 原地改为 approved，或用 Standalone 报告代替 review/promotion receipt。

## 7. 测试资产可追溯性

`testing-design` 生成的每个测试 Case 必须保留 PQL 资产引用：

```json
{
  "case_id": "case_login_001",
  "source": {
    "project_pack_id": "sample-web-app",
    "project_pack_version": "1.0.0",
    "asset_id": "scenario_login",
    "asset_version": "3",
    "asset_digest": "sha256:..."
  }
}
```

该引用必须继续出现在：

```text
StructuredPlan
→ CaseResult
→ EvidenceManifest
→ QualityEvaluation
→ CoverageGap
→ AssetChangeProposal
```

否则测试失败后无法区分产品问题、Fixture 问题、Selector 失效、Flaky 或测试资产版本过旧。

## 8. Standalone Test Harness

第一阶段不需要实现一个假的生产 Local QA Runtime，也不需要新建独立仓库。应建立一个明确标记为测试用途的 Harness，例如：

```text
qa-runtime-testkit
```

或者：

```text
standalone-qa-harness
```

禁止把它命名为正式的 `local-qa-runtime`，避免后续把不具备安全边界的测试组件误用于生产。

Harness 只负责：

- 在受控 testkit 根目录下创建权限收紧的 Run 专属临时目录；所有创建、打开、删除和归档操作必须 no-follow，并在每次操作前验证 realpath 仍位于该 Run 根内。
- 只把 Fixture App、readiness endpoint 和 Browser 控制通道绑定到 loopback；允许 `127.0.0.1` 或 `::1`，禁止 `0.0.0.0`、`::`、LAN 地址和自动跟随到非 loopback redirect。
- 启动受信任 Fixture App 并记录完整 child process tree、process group 和动态端口。
- 等待 Readiness。
- 调用真实 `testing-runner`。
- 允许 Browser Backend 启动系统 Google Chrome，但必须使用 Run 专属临时 Profile 和独立 process group。
- 收集日志、截图、CaseResult 和 EvidenceManifest；在输入与输出中注入测试专用 secret canary，验证日志、Error、Artifact 和最终报告均只保留脱敏后内容。
- 在 `finally` 路径停止 Chrome、Fixture App 及其全部 descendant process。
- 删除临时 Workspace 和 Chrome Profile，确认端口释放，并生成版本化 testkit-only Standalone 报告。

Harness 不负责：

- 验证生产 Design/Execution Grant。
- 执行不可信 Fork PR。
- 注入真实 Secret。
- 提供 VM 隔离。
- 实现 Runtime crash recovery。
- 连接 NyxID。
- 模拟完整 Local Runtime 安全语义。

## 9. 安全限制

Standalone Harness 直接运行在 CI 或开发机上，因此只允许执行仓库内受信任、固定版本的 Fixture Project。

它不得：

- Checkout 或执行外部 Fork PR。
- 运行用户输入的任意 shell。
- 使用生产 Secret。
- 访问用户个人 Chrome Profile。
- 复用用户已经打开的 Chrome Session。
- 连接生产内网和未批准服务。
- 监听 wildcard 或 LAN 地址、跟随 redirect 到非 loopback 目标，或把 Fixture App 暴露给其他主机。
- 跟随临时根、Workspace、Artifact、日志或 Chrome Profile 中的 symlink；任何 realpath 越出 Run 根必须立即失败并 Cleanup。
- 把 secret canary、Authorization header、cookie、token、用户绝对路径或未脱敏 stdout/stderr 写入报告和可发布 Artifact。
- 被 `fkst-hosted` 当作生产 Local QA Runtime 派发目标。

Browser 测试必须启动独立的系统 Google Chrome 进程和临时 Profile。测试结束后必须终止完整 Chrome process tree，并以 no-follow 删除该 Profile；删除前后都要验证路径仍位于 Run 专属临时根。

## 10. Fixture Project

建议建立一个确定性 Sample Web App：

```text
test-fixtures/sample-web-app/
├── package.json
├── server.ts
├── public/
│   ├── index.html
│   └── dashboard.html
└── expected/
    ├── project-pack.json
    ├── structured-plan.json
    ├── case-results.json
    ├── evidence-manifest.json
    └── quality-evaluation.json
```

Fixture App 至少提供：

```text
GET  /health
GET  /
POST /api/login
GET  /dashboard
GET  /api/items
GET  /api/failure
```

Fixture 必须满足：

- 无外部数据库依赖。
- 不需要真实 Secret。
- 使用系统动态分配端口，并只监听 `127.0.0.1` 或 `::1`。
- 启动时间短且 Readiness 可判定；Readiness client 禁止跟随到非 loopback redirect。
- 正常、失败、超时、Selector 失效、child process 泄漏和 secret canary 泄漏场景可以确定性复现。
- Cleanup 后端口、主进程、child process、Chrome process tree、临时 Workspace 和 Chrome Profile 可以明确验证为已释放或删除。

## 11. 第一轮测试场景

### 11.1 Contract 与 Plan

- 合法 ProjectPackSnapshot 可以生成 Structured Plan。
- Schema 版本不支持时 fail closed。
- Snapshot digest 不匹配时拒绝生成 Plan。
- Structured Plan 中每个 Case 都保留 PQL Asset reference。
- 相同输入产生稳定的 Plan digest。
- 未知 Backend 和未知 Assertion 类型被拒绝。

### 11.2 Deterministic Backend

- `/health` 返回 `200` 时 Assertion 通过。
- HTTP status、header 和 JSON body Assertion 正确计算。
- CLI 退出码 `0` 和非 `0` 正确映射为 Observation。
- Backend 输出 malformed JSON 时产生 execution error，而不是默认失败或通过。
- Backend 自报 `passed` 不能覆盖结构化 Assertion。

### 11.3 Browser Backend

- 启动系统 Google Chrome 和临时 Profile。
- 打开 Fixture 登录页面。
- 填写表单并点击登录。
- 断言 URL、DOM 文本和页面状态。
- 保存截图和可选 Trace。
- Selector 失效时返回结构化失败。
- Chrome 异常退出时返回 execution error 并执行 Cleanup。
- 测试不得附加用户现有 Chrome，也不得使用个人 Profile。
- Chrome 创建的 renderer、GPU、utility 和 crash handler 等 descendant process 必须全部纳入 Cleanup 验证。
- Chrome Profile 路径必须位于 Run 临时根，禁止 symlink，并在成功、失败、超时和取消后验证目录不存在。

### 11.4 Evidence 与 Quality

- required screenshot 存在时 EvidenceRequirement fulfilled。
- required Evidence 缺失时 Case 不得标记为 passed。
- Screenshot、日志和报告具有 byte digest。
- 产品断言失败与环境启动失败使用不同 Outcome。
- Selector 失效可以生成 `CoverageGap(gap_type="stale_selector")` 和不可变 `AssetChangeProposal` Fixture。
- Coverage Gap 使用正式 `CoverageGap`，需要资产变更时再生成 `AssetChangeProposal`；不得伪造 `PQLReviewDecision` 或 `ProjectPackPromotionReceipt`。
- 重复 QualityEvaluation 不产生重复 CoverageGap 或 AssetChangeProposal。
- secret canary 可以进入原始 Fixture 输入，但不得出现在 Sanitized Observation、Artifact、Error message/details 或 Standalone 报告。
- redaction 失败、输出仍命中 secret canary 或 unsafe error details 时禁止 publication，并保持已生成的 QualityEvaluation 不变。

### 11.5 Cleanup

- 成功后停止 Fixture App 和 Chrome。
- Assertion 失败后仍然 Cleanup。
- Readiness 超时后仍然 Cleanup。
- Browser 启动失败后仍然 Cleanup。
- Test Harness 被取消时仍然 Cleanup。
- Cleanup 后确认端口不再监听，Fixture App、全部 child process 和 Chrome process tree 均不存在。
- Cleanup 后确认 Run Workspace 与 Chrome Profile 已通过 no-follow 路径删除，且没有 symlink escape 或 Run 根外删除。
- Cleanup 失败必须单独记录，不能覆盖原测试 Outcome；残留 process/profile/path 必须在 testkit report 中单独列出。

## 12. 输出结果示例

```json
{
  "schema_version": "qa.testing-packages-standalone-report/v1",
  "report_id": "standalone-report-001",
  "run_id": "standalone_001",
  "execution_mode": "testing-packages-standalone",
  "pql_mode": "fixture",
  "runtime_mode": "test-harness",
  "transport_mode": "none",
  "report_kind": "testkit_only",
  "harness_status": "completed",
  "module_output_refs": {
    "case_result_refs": [
      "case-result-health",
      "case-result-login"
    ],
    "evidence_manifest_refs": [
      "evidence-manifest-1"
    ],
    "quality_evaluation_ref": "quality-evaluation-1"
  },
  "testkit_summary": {
    "execution": "passed",
    "cleanup": "succeeded",
    "evidence": "sufficient",
    "publication": "skipped"
  },
  "cleanup_verification": {
    "fixture_app_process_tree_absent": true,
    "chrome_process_tree_absent": true,
    "ports_released": true,
    "workspace_absent": true,
    "chrome_profile_absent": true
  },
  "security_verification": {
    "loopback_only": true,
    "no_follow_temp_roots": true,
    "secret_canary_absent_from_outputs": true
  }
}
```

`qa.testing-packages-standalone-report/v1` 是 testkit-only 聚合报告，不是 `CaseResult`、`QualityEvaluation`、`WorkflowState` 或 `RunSettlement`，也不得被任何生产 adapter 当作这些对象解析。正式模块输出只能通过 digest-bound ref 或测试内定位符列在 `module_output_refs` 中；`testkit_summary` 仅汇总 Harness 观察，不复用生产状态机判定权。因为本阶段不调用 GitHub/PQL adapter，publication 必须显式为 `skipped`。

测试报告必须显式声明：

```text
PQL: fixture only
NyxID: not used
FKST Local QA Runtime: not used
Execution host: CI/local test harness
Browser: system Google Chrome
Security scope: trusted fixture only
```

## 13. 建议目录结构

如果 Testing Packages 当前仍位于 `ChronoAIProject/fkst-packages-testing`，可以采用：

```text
fkst-packages-testing/
├── packages/
│   ├── qa-contracts/
│   ├── testing-design/
│   ├── testing-runner/
│   ├── environment-factory/
│   ├── test-artifacts/
│   └── quality-evaluation/
├── testkit/
│   └── standalone-qa-harness/
├── fixtures/
│   ├── pql/
│   │   └── sample-project-pack.v1.json
│   ├── plans/
│   │   ├── deterministic-plan.v1.json
│   │   └── browser-plan.v1.json
│   ├── results/
│   │   ├── expected-case-results.v1.json
│   │   └── standalone-report.v1.json
│   └── projects/
│       └── sample-web-app/
└── tests/
    ├── contract/
    ├── testing-design/
    ├── testing-runner/
    └── integration/
        └── standalone-qa-run.test.ts
```

如果 Testing Packages 已迁移到 `fkst-hosted/packages/*`，沿用相同逻辑结构。两个仓库之间禁止复制两套实现，迁移期间必须明确唯一 source of truth。

## 14. 分阶段实施

### S0：冻结契约

交付：

- `ProjectPackSnapshot`。
- `StructuredPlan`。
- `AssertionResult` 和 `CaseResult`。
- `EvidenceManifest`。
- `QualityEvaluation`。
- `CoverageGap` 和不可变 `AssetChangeProposal`。
- `PQLReviewDecision` 与 `ProjectPackPromotionReceipt` 只提供 contract fixture，不由 Standalone Harness 签发或伪造成功结果。
- `qa.testing-packages-standalone-report/v1` testkit-only schema。
- 合法和非法 Golden Fixture。

Exit Gate：同一 Fixture 产生稳定 canonical digest；未知 schema、字段和 enum 按安全规则拒绝。

### S1：Runner 最小闭环

交付：

- 手写 Deterministic Structured Plan。
- Fixture App。
- Environment Factory Test Adapter。
- Deterministic Backend。
- CaseResult 和 Test Cleanup。

Exit Gate：HTTP 和 CLI Case 可重复执行，成功、失败和 Cleanup 结果可以区分。

### S2：Browser 闭环

交付：

- Browser Structured Plan。
- 系统 Google Chrome 控制。
- 临时 Chrome Profile。
- DOM、URL 和截图 Assertion。
- Browser Artifact。

Exit Gate：真实 Chrome 点击、断言、截图和 Cleanup 可重复通过，不使用个人浏览器状态。

### S3：Testing Packages 完整链

交付：

- ProjectPackSnapshot Fixture。
- `testing-design` 生成 Structured Plan。
- `testing-runner` 执行。
- `test-artifacts` 生成 EvidenceManifest。
- `quality-evaluation` 生成 QualityEvaluation。

Exit Gate：Asset reference 从 Snapshot 一直保留到质量结果；required Evidence 不足时禁止通过。

### S4：PQL 联调

交付：

- 用真实 PQL Snapshot 替换 Fixture。
- `CoverageGap` 转换为不可变 `AssetChangeProposal`。
- `PQLReviewDecision` 与 `ProjectPackPromotionReceipt` contract test。

Exit Gate：Testing Packages 不调用 PQL 内部实现；Project Pack 使用 `qa.pql-project-pack/v1`，Proposal 不可原地批准，只有独立的 approved `PQLReviewDecision` 与成功 `ProjectPackPromotionReceipt` 才能产生后续 Run 可用的新 Project Pack。

### S5：Local QA Runtime 联调

交付：

- 用正式 Runtime Client 替换 Standalone Harness。
- Structured Plan 通过 Runtime Command 提交。
- Runtime Event、Receipt 和 Artifact Pointer 回传。
- 真实 Environment Factory、Cleanup 和恢复路径。

Exit Gate：Testing Packages 核心逻辑不因 Runtime 替换而修改。

## 15. Standalone 验收标准

- [ ] Testing Packages 不需要连接真实 PQL 即可运行。
- [ ] PQL Fixture 使用正式版本化 schema，而不是临时输入格式。
- [ ] `testing-design` 输出稳定、可验证的 Structured Plan。
- [ ] 每个 Case 可以追溯到 PQL Asset ID、version 和 digest。
- [ ] `testing-runner` 而不是 Backend 或 Codex 决定 Pass/Fail。
- [ ] Deterministic Backend 可以执行 HTTP、CLI 和测试框架步骤。
- [ ] Browser Backend 只使用系统 Google Chrome。
- [ ] Browser 测试使用独立临时 Profile，不附加个人 Chrome。
- [ ] Fixture App、readiness 和 Browser 控制通道只使用 loopback，且不跟随到非 loopback redirect。
- [ ] Run Workspace 和 Chrome Profile 使用 no-follow 操作并持续验证 realpath containment。
- [ ] required Evidence 缺失时 Case 不得通过。
- [ ] secret canary 不出现在 Sanitized Observation、Artifact、Error 或 Standalone 报告；redaction/unsafe details 失败会阻止 publication 且不修改 QualityEvaluation。
- [ ] Product Failure、Environment Failure、Test Asset Failure 和 Cleanup Failure 分开表达。
- [ ] 成功、失败、超时和取消都会执行 Test Cleanup。
- [ ] Cleanup 后 Fixture App、全部 child process、Chrome process tree、端口、Workspace 和 Profile 均已收敛。
- [ ] Standalone 聚合结果使用 `qa.testing-packages-standalone-report/v1`，不冒充 `CaseResult`、`QualityEvaluation` 或 `RunSettlement`。
- [ ] Standalone Harness 只执行受信任 Fixture，不接收外部 PR 和真实 Secret。
- [ ] 未来接入真实 PQL 时只替换 Snapshot 来源。
- [ ] 未来接入 Local QA Runtime 时只替换执行 Harness 和 Adapter。
- [ ] Standalone 结果不会被描述为完整 FKST Local QA E2E。

## 16. 本阶段明确不在范围内

- NyxID Cloud、NyxID Node 和用户设备路由。
- Local QA Runtime LaunchAgent、SQLite Ledger、Grant、fencing 和 crash recovery。
- Virtualization.framework VM 和不可信 PR 隔离。
- 生产 Secret Broker 和 CredentialLease。
- 真实 Codex CLI 自动执行；第一阶段仅做 Backend Replay。
- workflow-qa Durable Orchestration。
- GitHub 正式发布和外部副作用。
- 真实 `PQLReviewDecision`、`ProjectPackPromotionReceipt` 和正式 Project Pack 更新；Standalone 只验证对应 schema 与冲突路径。
- Runtime 安装、签名、升级和回滚。

上述能力后续分别联调，不能由 Standalone Harness 的通过结果代替验收。

## 17. 最终建议

第一轮先实现链路 A：

```text
手写 Structured Plan
→ Fixture App
→ testing-runner
→ Deterministic Backend
→ CaseResult
→ Cleanup
→ qa.testing-packages-standalone-report/v1
```

第二轮增加系统 Google Chrome：

```text
Browser Structured Plan
→ Fixture App
→ Google Chrome
→ DOM Assertion
→ Screenshot
→ EvidenceManifest
→ Cleanup
→ qa.testing-packages-standalone-report/v1
```

第三轮再加入 `testing-design` 和 PQL 格式 Fixture：

```text
ProjectPackSnapshot Fixture
→ testing-design
→ StructuredPlan
→ testing-runner
→ quality-evaluation
```

这条实施路径能先把 Testing Packages 自身的不确定性消掉。后续接入 PQL 和 Local QA Runtime 时，问题会集中在真实边界和 Adapter 上，而不是同时调试测试策略、Plan、Runner、本地设备、Chrome、授权和 Cleanup。
