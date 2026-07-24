# 规范 — `workflow-QA`：用于自动化端到端测试的临时 QA 会话

> **状态：** 设计已批准，**尚未实现**。本文是构建规范。
> **架构：** **方案 B — 独立的临时 QA substrate 会话**（拥有自己的沙箱，每次运行后销毁）。
> **可行性研究（背景）：** 本仓库中的 `docs/specs/workflow-qa/DESIGN.md`。
> **跨越两个仓库：** `workflow-qa` 包（本 fork）+ **fkst-hosted** 中的控制平面接线。

---

## 0. 决策

**已锁定（由所有者决定）：**

| # | 决策 | 值 |
|---|---|---|
| D1 | 失败项去向 | **创建带 `fkst-dev` 标签的 issue**，以便开发部门自动修复它们（跨会话）。 |
| D2 | 沙箱模型 | **B — 独立的临时 QA 会话**，拥有自己的沙箱，运行结束后销毁；绝不触碰主 dev/company 会话。 |
| D3 | QA 资源 | 目前使用 **2 CPU / 4Gi**（标准会话规格）。 |
| D4 | QA 环境配置文件 | 一个**更丰富的配置文件**：环境变量 + 密钥 + 软件安装命令 + **中间件列表及版本**。 |

**开放项（推迟到构建时决定 — §7 中记录了建议）：**

| # | 问题 | 建议 |
|---|---|---|
| O1 | 什么会*触发*一次 QA 运行？ | 当 dev PR 合并时自动创建一个 `fkst-qa` 运行请求，**同时**允许手动创建 `fkst-qa` 请求 issue。 |
| O2 | 如何交付中间件？ | 阶段 1 中由 Codex 下载预构建二进制文件；阶段 2 中接通已经设计但尚未生效的 agent 启动前安装步骤。 |

---

## 1. 目标

为任意所有者项目提供由 GitHub 驱动的**全自动、无头端到端测试**：按需（或合并后）启动一个**隔离、用后即弃的沙箱**，使用真实凭据和临时凭据引导项目的中间件与服务，运行所有提出的测试用例，并将每个失败项作为 `fkst-dev` issue 回报，使开发部门进行修复，然后销毁沙箱。

**范围内：**无头、可通过二进制文件引导、使用公共依赖、可在 ≤ 4Gi 内运行且仅需一个轻量级数据存储的服务。
**范围外（沙箱硬限制，见 §3）：**Docker / docker-compose / testcontainers、root/`apt` 安装、浏览器 E2E、重量级多服务栈，以及对任何私有服务或集群内部服务的依赖。

---

## 2. 架构 — 方案 B：临时 QA 会话

核心思想：**QA 是自己的 substrate 会话**，而不是长期运行的 dev/company 会话中的一个部门。它复用*现有*会话生命周期（创建 pod → 运行 → idle-to-zero），从而直接获得隔离和自动拆除能力。

```
  MAIN dev/company session                 EPHEMERAL QA session
  (long-lived, keeps working)              (created per run, destroyed after)
  ┌───────────────────────────┐            ┌───────────────────────────────────┐
  │ sandbox A                 │            │ sandbox B  (own 2CPU/4Gi)          │
  │  • dev / security / …     │            │  • workflow-qa package             │
  │  • fkst-dev issues        │            │  • QA env-profile attached         │
  └───────────────────────────┘            │    (env+secrets+installs+mware)    │
            ▲                               │  • middleware on 127.0.0.1         │
            │ files fkst-dev issues         │  • owner services on 127.0.0.1     │
            │ (failing test cases)          │  • runs the E2E cases              │
            └───────────────────────────────┤                                    │
                                            └───────────────────────────────────┘
                                                    │ QA run issue closes
                                                    ▼
                                            session idles to zero → sandbox B destroyed
```

### 2.1 生命周期

1. **触发器**（O1）在所有者仓库中创建一个带 `fkst-qa` 标签的**运行请求** issue（合并后自动创建，或手动创建）。
2. fkst-hosted reconciler 识别 `fkst-qa` 工作标签，并**配置一个独立的 QA 会话**（拥有自己的 OSB 沙箱），同时附加该仓库的 **QA 环境配置文件**。
3. agent 启动前，控制平面运行配置文件中的**安装步骤**（软件 + 中间件二进制文件），形成确定性的 agent 启动前引导流程（阶段 2；阶段 1 在 codex 步骤内完成此操作）。
4. 在 sandbox B 内，**`workflow-qa` 包**运行 E2E blueprint（§5）：发现 → 提出测试用例 → 引导并运行 → 创建失败 issue。
5. 失败用例会作为 **`fkst-dev` issue** 创建到所有者仓库中 → 由**主** dev 会话接收（通过标签实现跨会话传递）。
6. QA 运行请求关闭 → QA 会话不再有开放工作 → **idle-to-zero → sandbox B 被销毁**（临时拆除，不留残余）。

### 2.2 为什么选择 B

- **隔离：**中间件、服务及其内存/CPU 绝不会与实时 dev 沙箱争用资源或污染该沙箱。
- **彻底拆除：**每次运行都会丢弃沙箱，不会泄漏 daemon，也不会在运行之间发生状态串扰。
- **复用现有机制：**create→idle-to-zero 会话生命周期已经会在工作完成后销毁沙箱；QA 只需要自己的触发器、标签和配置文件附件，不需要全新的沙箱原语。
- **必须使用会话而不能通过包技巧实现的不可协商原因：**在沙箱*内部*运行的包**无法创建另一个沙箱**（没有 service-account token；OpenSandbox 生命周期服务器位于集群内部，并被出口封锁策略阻止访问 — 见 §3）。只有**控制平面**能够创建沙箱。独立的 QA *会话*正是控制平面授予 QA 自有沙箱的方式。

---

## 3. 可行性与沙箱约束（有事实依据）

以下内容均已依据 fkst-hosted 的 OSB manifest、配置以及本 fork 的 package SDK 进行验证。

**QA 沙箱能够执行的操作：**
- **通过所有端口访问公共互联网出口** — 下载预构建的中间件二进制文件（Redis tgz、便携式 Postgres、Mongo tgz）、执行 `pip install`、调用 LLM API、从 GitHub 克隆。（集群内部的 `*.svc`、RFC1918 地址和 GCP metadata IP 均被阻止。）
- **运行非特权用户空间进程** — `exec_sync` 是真正的 shell；可将二进制文件下载到 `$HOME`/`$FKST_RUNTIME_ROOT`，执行 `chmod +x`，并在 gVisor 下以 uid 10001 运行。Redis/Postgres/Mongo 都是能够以 rootless 方式运行的 daemon。
- **运行后台 daemon**：在 `exec_sync` 内执行 `nohup <mware> … &`，然后通过后续调用轮询健康状态。其他沙箱内进程可以访问 loopback（`127.0.0.1:PORT`），因此服务能够连接其中间件。
- **真实凭据已经能够流入** — 环境配置文件流水线会将配置文件中的密钥注入会话进程环境；每个 `exec_sync`/codex 子进程都会继承它们（`OPENAI_API_KEY`、`DATABASE_URL` 和任意应用密钥都会透传）。

**它无法执行的操作（设计时应规避，不要与这些限制对抗）：**
- ❌ **不能使用 Docker / docker-compose / testcontainers** — 没有容器运行时，使用非 root 用户，并受 gVisor + `RuntimeDefault` seccomp 限制。
- ❌ **不能使用 root / `apt` 安装** — uid 10001，无法写入 `/usr`。中间件只能使用下载的二进制文件。
- ❌ **不能从内部创建同级沙箱或 k8s 资源** — 没有 SA token，OSB 服务器和 RFC1918 地址均被阻止。（这正是 B 必须由控制平面驱动的原因。）
- ❌ **不能依赖私有服务/集群内部服务**，也**不能由人工通过端口转发**进入正在运行的应用（只能无头运行）。
- ⚠️ **资源紧张** — engine + codex + 服务 + 中间件共享 2 CPU / 4Gi。浏览器 E2E 和重量级栈会发生 OOM。

**在宣传支持特定中间件之前，必须进行实证探测（阶段 0）：**针对固定 `mongod`/`postgres` 版本的 gVisor syscall 兼容性（Redis 安全、Postgres 很可能可用、**Mongo 尚未验证**）、daemon 在多次 `exec_sync` 调用之间的存活情况，以及尚未量化的临时磁盘预算。

**控制平面工作所基于的关键 fkst-hosted 事实：**
- 当前的环境配置文件 = *安装命令* + *非密钥变量* + *只写密钥*，存储在 ConfigMap/Secret 对中（`backend/src/environment_profile.rs`、`k8s/env_store.rs`）；REST 路由位于 `routes/environments.rs`，并通过 `fkst-control-plane validate-env` 在一次性 holder 中进行验证。
- 配置文件的 **env 能够到达会话**，但针对会话 agent 启动前路径的**安装步骤虽已设计却尚未接线** — `install::run_ordered` 有第二个预期调用点，但 `reconcile/execute.rs` 当前将其丢弃（`install/mod.rs` 注释为 "later"）。接通此调用点是确定性中间件引导流程的合理归属（阶段 2）。
- **保留环境变量策略**（`backend/src/reserved_env.rs`）禁止配置文件设置 `FKST_*`、`GITHUB_TOKEN`、`GH_TOKEN` 和 git-config key；其他所有内容（LLM key、DB URL）都会透传。

---

## 4. 组件（优先复用）

### 4.1 Fork — `packages/workflow-qa`（QA workflow adapter）

基于共享 kernel（`workflow.engine.*`）对 `packages/workflow-security` 进行逐扩展接口仿制。**复用**整个 engine，只编写 QA 专用的粘合代码。

| 文件 | 新增/复用 | 用途 |
|---|---|---|
| `fkst.toml` | 新增 | `package.composed`、`persistence_class="saga"`、`lib_deps=[contract, workflow, testkit, forge, devloop]`、`event_deps=[github-proxy]`。**仅认领自身标签 — 绝不使用 dev intake candidate 接口。** |
| `qa_logic.lua` | 新增（以 `security_logic.lua` 为模板） | 纯逻辑：`NAMESPACE="fkst:workflow-qa"`、`LABEL="fkst-qa"`、`WORKFLOW_ID="qa-e2e"`；队列 `qa_run_request` / `workflow_qa_tick` / `workflow_qa_materialization_tick`；`decode_results()`（严格 JSON）、`finding_dedup_key()`，以及为失败用例构建 **`fkst-dev` issue-create 请求的 builder**（遵循 D1）。错误字面量以 `workflow-qa: <class>:` 为前缀。 |
| `bindings.lua` | 新增 | 通过 `engine.make_departments` 组合四个 kernel 接口（executor/completion/catalog/platform）。 |
| `executor.lua` | 新增 | `raise_step` 基于 `child_dedup_key` 保持幂等；最终步骤先创建 finding issue，再写入 "created" marker。 |
| `completion.lua` | 新增（替换 security 的标签） | 将 child 状态映射为 `result_ready \| running \| fatal \| …`。 |
| `catalog.lua`、`discovery.lua`、`intake.lua` | 新增（仿制模板） | 发现带自身 `fkst-qa` 标签的开放请求；catalog 提供内置 blueprint。 |
| `blueprints/qa-e2e.json` | 新增 | 4 步 `fkst.workflow.v1` 模板（§5）。 |
| `records.lua` + `prompts/*.md` | 新增 | 4 个 generator（每个 ≤ 8000B）+ `bootstrap-recipes.md`（由探测结果固定的中间件版本）、discover/propose/results-contract prompt。 |
| `departments/{qa_select,qa_materialize_next,dead_letter}/main.lua` | 新增 | 对 kernel 延迟创建的 `make_departments` closure 进行约 3 行封装。 |
| `raisers/qa_poll.lua` | 新增 | 30m cron fallback tick（作为请求触发之外的补充）。 |
| `tests/{core_test,namespaced_dispatch_conformance_test,fire_raiser_qa_poll_test,run_graph_qa_smoke_test}.lua` | 新增 | 棘轮测试三件套（结构性测试，由 CI 执行）。 |
| `conformance/pack.toml`、`README.md` | 新增 | 包一致性 + 如实说明范围（§1）。 |

**复用（不复制）：**`workflow.engine.*`（blueprint、catalog、digest、marker、materialization、frontier、generator、reconcile、departments）、`workflow.codex/env/saga/dead_letter`、`github-proxy` issue-create 接口、`contract.strings`、`devloop.github_factory`。

### 4.2 fkst-hosted — QA 会话 + QA 环境配置文件

每一项都是**合入 `develop` 的小型 PR，并关联一个 issue**（遵循 fkst-hosted CLAUDE.md）。保持在面向用户/公共接口的范围内；**不修改 kernel engine**。

1. **QA 环境配置文件 schema（D4）。**在现有 env/secrets/install 字段旁，扩展 profile DTO/store（`environment_profile.rs`），增加结构化的**中间件条目** `{name, version, source_url?, start_cmd, health_check}`。保持增量兼容；根据 OpenAPI contract 使用 `#[utoipa::path]` + `ToSchema` 注解；遵守 `reserved_env`。REST CRUD 已存在，只需扩展。
2. **接通 agent 启动前安装步骤（O2，阶段 2）。**通过 `EnvResolution::Proceed`（`reconcile/execute.rs`）传递 `install`（以及新的中间件引导命令），在 K8s-Secret-mount 和 OSB-upload 两条路径上都将其作为 `install.json` credential entry（`session_spec/creds.rs`）交付，并在 `session_pod/driver.rs` 中于 supervise **之前**运行 `install::run_ordered`。使用 `InstallValidationError` shape 执行 fail-closed；验证 validation-pod image 与 sandbox image 的一致性。（这就是已设计但尚未生效的第二个调用点。）
3. **QA 会话配置 + 临时拆除（D2）。**将 `fkst-qa` 工作标签识别为一个 **QA 会话**，该会话：(a) 附加仓库的 QA profile；(b) 使用标准 2/4Gi 规格（D3）；(c) **没有持久触发器** — 仅在 `fkst-qa` 运行请求保持开放时存在，请求关闭后 idle-to-zero（沙箱被销毁）。确认一旦将 QA 标签注册为独立会话，reconciler 的 pending-gate + idle-to-zero 已能提供此行为；仅增加最少接线（标签注册、profile 附加、one-shot 语义）。
4. **（可选，阶段 2）前端 CRUD**：通过现有 REST API + dashboard auth 管理 QA profile（env/secret/install/middleware）。
5. **（可选，阶段 2）按 QA 标签覆盖资源**（`FKST_OSB_QA_SESSION_*`）：在验证 OSB 的 `resourceLimits` 按会话行为后实施 — 仅当 2/4Gi 确实不足时才启用。

### 4.3 触发器 / QA 循环（O1）

- **自动：**当 dev pipeline 合并 PR 时，创建一个 `fkst-qa` 运行请求（在 dev flow 中增加一行，或使用控制平面 post-merge hook）。
- **手动：**maintainer 创建一个描述此次运行的 `fkst-qa` 请求 issue。
- 无论采用哪种方式，请求都会携带（或引用）仓库的 QA profile 名称，以及可选的限定范围测试用例集合。

---

## 5. E2E 流程（`qa-e2e` blueprint）

包含四个有序 slot。步骤 1–2 是只读判断；步骤 3 是一个执行全部 shell 工作的**不受限** codex 步骤；步骤 4 是确定性的 Lua。

1. **discover-stack**（*只读 codex*）— 读取 checkout（`package.json`、`Makefile`、`docker-compose.yml`，后者仅作为*需要读取而非运行的 manifest*，以及 README、CI）→ 输出严格 JSON manifest：服务、每个服务的启动方式、必需的中间件及版本、必需的 env/secrets，以及应用的 health endpoint。
2. **propose-test-cases**（*只读 codex*）— 根据 manifest + repo，输出**拟议 E2E 测试用例**的有序列表（名称、步骤、预期结果）。（“拟议测试用例”= codex 根据应用的 route/contract 以及仓库中任何现有 test spec 生成。）
3. **bootstrap-and-run**（*一个不受限的 codex 步骤 — 特意合并为一个步骤，以规避尚未验证的跨步骤 daemon 持久性问题*）：
   - 通过公共 HTTPS 将固定版本的中间件二进制文件下载到 `$HOME`；使用 `nohup` 在 `127.0.0.1` 上启动；轮询健康状态。
   - 生成临时凭据；从进程 env 中读取**真实**凭据（由 QA profile 注入）。
   - 按 manifest 在 loopback 上启动所有者服务；轮询健康状态。
   - 执行每个拟议测试用例；捕获 pass/fail + log。
   - 输出严格 JSON **results** 文档。
4. **file-results**（*确定性 Lua — 仿照 `security_logic`*）— 严格解码 results JSON；针对每个**失败**用例，通过 `github-proxy` issue-create 接口创建一个**去重幂等的 `fkst-dev` issue**（遵循 D1）；发布运行摘要 comment。re-reconcile 时不会重复运行或重复创建 issue（kernel 的 CAS key 保证这一点）。

---

## 6. 阶段划分

- **阶段 0 — 能力探测**（*一次性工作，最先交付，在实时 QA 沙箱中运行*）。一次 `fkst-qa` dry-run，其唯一的不受限 codex 步骤会在 gVisor 下以 uid 10001 启动固定版本的 `redis`/便携式 `postgres`/`mongod`，测试 `nohup` daemon 的存活情况，测量可用临时磁盘，并发布严格 JSON **能力矩阵**。该结果决定真正 blueprint 宣传支持哪些中间件。（*无需合并代码 — 只需要一个 prompt + 一个触发 issue。*）
- **阶段 1 — 包 + QA 会话**（*fork 包，零行为变更地复用 kernel；加上 fkst-hosted QA 会话和 profile-schema 接线*）。在隔离、用后即弃的沙箱内，通过一个约 60 分钟的 codex 步骤，为不使用 Docker、依赖公共服务且使用一个轻量级数据存储的项目提供无头 E2E。中间件由 codex 下载（O2 阶段 1）。
- **阶段 2 — 确定性引导 + 完善。**接通 agent 启动前安装步骤（O2）、可选前端 CRUD、可选按 QA 标签覆盖资源。
- **阶段 3 — 推迟到需求证明其必要性后再实施。**具有持久 daemon 的多步骤 blueprint（仅当探测证明能够跨步骤存活）、将精选中间件烘焙进 sandbox image、每仓库默认 QA profile。

---

## 7. 开放决策（构建时解决）

- **O1 — 触发器：***建议*同时支持合并后自动运行和手动 `fkst-qa` 请求。自动方式形成真实 CI 循环；手动方式提供控制能力。
- **O2 — 中间件交付：***建议*阶段 1 使用 codex 下载 → 阶段 2 接通安装步骤并将其作为主要方式，同时为未列出的中间件保留下载 fallback。除非下载不稳定性被证明影响显著，否则推迟 image baking。
- **Mongo 支持：**受阶段 0 探测结果阻塞。如果 `mongod` 无法在 gVisor 下运行，profile 只宣传 Redis + Postgres，依赖 Mongo 的项目在 image baking 完成前均属于范围外。

---

## 8. 完成定义（Definition of Done）

**阶段 1（包，本 fork）：**
- [ ] 按 §4.1 完成 `packages/workflow-qa`；`scripts/check_repo.py` → exit 0（结构性棘轮为绿色）。
- [ ] 仅认领自身标签 — 不使用 dev intake candidate 接口（保持 INTAKE_POLICY_SET 完整）。
- [ ] 失败用例会创建 `fkst-dev` issue，保持去重幂等，re-reconcile 时不会重复创建。
- [ ] 棘轮测试三件套齐备（`fire_raiser`、`run_graph`/coverage、namespaced-dispatch）；PR 合入后 CI（`scripts/run.sh test`）为绿色。
- [ ] README 如实说明范围（无头、可通过二进制文件引导、公共依赖、≤4Gi、无 Docker）。

**阶段 1（fkst-hosted）：**
- [ ] QA environment-profile schema 已扩展（env+secrets+install+middleware），带有 `#[utoipa::path]`+`ToSchema`；`tests/openapi.rs` 为绿色。
- [ ] 带 `fkst-qa` 标签的工作会配置一个拥有自有沙箱并附加 QA profile 的**独立**会话，并在运行请求关闭时 **idle-to-zero（沙箱被销毁）**。
- [ ] `cargo fmt`/`clippy`/`test` + docker build + gitleaks 均为绿色；每项变更都是合入 `develop` 的小型 PR，关联 issue，且没有 `Co-Authored-By`。

**验收（实时）：**针对一个小型、已知正常的所有者项目执行真实 `fkst-qa` 运行，使用带凭据的 QA profile 在隔离沙箱中启动中间件 + 服务，运行拟议用例，将真实失败用例创建为 `fkst-dev` issue，并在之后销毁 QA 沙箱 — 整个过程中主 dev 会话不受触碰。

---

*本规范所依据的可行性事实，以及它最终收敛自的务实方案与雄心方案设计研究：`docs/specs/workflow-qa/DESIGN.md`。*
