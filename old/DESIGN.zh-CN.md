# workflow-QA — 在沙箱内对所属项目进行自动化端到端测试

**状态：** 设计（已收敛）。**代码仓库：** `shining-fkst-packages`（fork — 软件包）+ `fkst-hosted`（环境配置文件扩展）。**模板：** 基于 `workflow.engine.*` 内核的 `packages/workflow-security`。**合并门禁：** fork 的 `scripts/check_repo.py` 棘轮测试套件；fkst-hosted 的五项检查 CI + OpenAPI 规范。

---

## 1. 概述

workflow-QA 是一个工作流适配器（workflow adapter）；当所属仓库中存在一个带 `fkst-qa` 标签的触发 issue 时，它会：

1. **分析** 已检出的所属项目（服务、启动命令、中间件依赖、必需的环境变量键）。
2. **提出测试用例**（合并触发 issue 正文中用户提出的任何用例）。
3. **引导启动并运行**：在 `127.0.0.1` 上以非特权二进制文件方式下载并启动必需的中间件，填充临时凭据，从会话环境中读取真实凭据，启动所属项目的服务，并执行每一个已提出的用例 — 所有操作都在会话沙箱中的**单个不受限 codex 步骤**内完成。
4. **提交失败结果**：通过 github-proxy 将失败结果创建为具备去重幂等性的 GitHub issue。

状态完全保存在触发 issue 的机器人评论中（即内核的评论线程总线）。幂等性、CAS 键、前沿推进和终态标记均由内核直接提供。

真实用户凭据（例如所属服务所需的 LLM API key）通过**现有的** fkst-hosted 环境配置文件功能进入 QA 环境，阶段 1 **无需任何后端变更**。阶段 2 会合入一些小型、增量式且范围内的 fkst-hosted PR，使引导启动过程具有确定性，并改善凭据用户体验。

---

## 2. 可行性 — 坦诚的结论

本设计基于**生产环境 OSB 沙箱安全态势**：gVisor 运行时、非 root uid 10001、镜像 = 基于 `debian:bookworm-slim` 的 fkst-control-plane（仅包含 git/bash/python3/codex/gh — 没有 node、docker、编译器，且非 root 用户不能使用 apt）、出站访问 = 仅公共互联网（`0.0.0.0/0` 排除 RFC1918 + GCP metadata；无法访问集群内部）、引擎 + codex + QA 启动的所有进程共享 2 CPU / 4Gi、无 SA token / 无 RBAC。注意：`k8s/isolation.rs` 中能够使用 apt 的 boxed-root pod 属于**旧版 k8s 后端** — 生产环境采用限制更严格的 OSB 安全态势；本设计以非 root/无 apt 为目标。

### 当前即可运行（无需基础设施/后端变更）

- 整个适配器：内核接缝、标签接入、codex 步骤、评论线程状态、通过 github-proxy 提交结果 — 以机械式方式克隆 workflow-security。
- **真实凭据**：环境配置文件 secrets → `userenv.<KEY>` 凭据文件 → 首先折叠进引擎子进程环境（剔除保留键）→ 作为普通进程环境，由软件包 Lua（`workflow.env.read_env`）及每一个 codex 子 shell 继承。
- **中间件自动引导启动 — 但需要改变机制**：不使用容器，而是通过开放的公共 HTTPS 出站访问下载并运行**非特权的预编译 Linux 二进制文件**，使用 `nohup … &` 启动并绑定到 `127.0.0.1`（NetworkPolicy 不影响 pod 回环网络）。兼容性阶梯：**Redis**（静态构建）— 安全；**可移植 Postgres**（在 `$HOME` 下以非 root 方式执行 initdb）— 很可能可行；**MongoDB**（bookworm-glibc tgz）— gVisor 系统调用兼容性**尚未验证，必须探测**。缺失的运行时（node、go、jdk）也可以通过相同方式获得（将官方 tarball 下载到 `$HOME`）。
- 对符合 2 CPU / 4Gi 资源预算的 API/CLI 形态服务执行无头端到端测试（E2E）。

### 在当前沙箱模板下永远不可行 — 不要围绕这些能力进行设计

- `docker` / `docker-compose` / testcontainers：镜像中没有容器运行时、使用非 root、gVisor + RuntimeDefault seccomp、禁止提权、不能嵌套 userns。Compose 文件属于**发现数据**，步骤 1 会将其转换为原生二进制方案；端到端测试确实依赖 Docker 镜像的项目**不在范围内**。
- root / apt 安装；源码构建（没有编译器）。
- 启动同级沙箱或 k8s 对象（`automountServiceAccountToken: false`、无 RBAC 的 SA，k8s API + OSB 生命周期服务器均位于被阻止的私有地址范围内）。
- 访问任何私有/集群内部/公司内部依赖 — 每个外部依赖都必须具有公共 URL。
- 人工检查运行中的应用（无 ingress/port-forward）— QA 完全无头运行；结果只能通过 GitHub 出站。
- 实际上也不可行的还有：基于浏览器的 E2E（Chromium 在 gVisor 下使用 4Gi 内存时容易发生 OOM）以及繁重的多服务栈。

### 在承诺支持特定中间件前，必须进行实证探测（阶段 0）

1. 精确锁定的 mongod/postgres 版本与 gVisor 系统调用的兼容性。
2. 引擎在 exec 超时时是否会终止已生成的**进程组**（这会回收同一调用中启动的 nohup 守护进程）— 属于 substrate 侧行为，尚未验证。孤儿进程存活原则（fork CLAUDE.md:168）表明守护进程会继续存在，但本设计不依赖这一点。
3. 守护进程能否跨步骤持续运行（仅影响未来的多步骤蓝图）。
4. 尚未量化的临时磁盘预算（batchsandbox 模板中没有 `ephemeral-storage` 限制）。

一次低成本的一次性探测会话（一次性的 fkst-qa dry-run 蓝图：由一个不受限步骤启动每个候选项，并以 issue 评论形式报告严格 JSON 能力矩阵）即可确定上述四项。

### README 的范围声明

> workflow-QA 为满足以下条件的项目运行无头端到端测试：不使用 docker；仅有公共外部依赖；可在引擎旁占用约 2 CPU / 4Gi 的资源范围内运行；所需中间件能够以非特权预编译二进制文件提供（Redis/Postgres 级别；Mongo 尚待探测）。在沙箱模板本身发生变化之前，Docker 镜像形态的技术栈、root 安装、私有端点和浏览器 E2E 均不在范围内。

---

## 3. workflow-QA 软件包（fork）

这是一个工作流**适配器** — 而非定制的部门流水线 — 按接缝从 `packages/workflow-security` 逐一复制。内核零变更（空的代码去重允许列表无论如何都禁止复制引擎逻辑）。

### 身份标识（`qa_logic.lua`）

| 项目 | 值 |
|---|---|
| Namespace | `fkst:workflow-qa`（`engine.marker.for_namespace`） |
| 标签 | `fkst-qa`（绝不与另一个触发 issue 共用 — 一个会话 = 一个工作标签） |
| Workflow id | `qa-e2e`（不得与任何 `FKST_WORKFLOW_CATALOG_ROOT` 模板 id 冲突 — 重复 id 会静默取消双方的资格） |
| 队列 | `qa_run_request`、`workflow_qa_tick`、`workflow_qa_materialization_tick` |
| 错误类别 | 可通过 grep 检索的 `workflow-qa: <class>:` 前缀（`results-not-array`、`qa-run-timeout`，…） |

### fkst.toml

`kind = "package.composed"`、`persistence_class = "saga"`、`lib_deps = [contract, workflow, testkit, forge, devloop]`、`event_deps = [github-proxy]`。

### 部门与认领路径

- **qa_select** — 消费 `qa_run_request` + `workflow_qa_tick`；对于发现的每一个仍开放、未终止且带 `fkst-qa` 的作用域：如果缺少蓝图标记，则盖上该标记，并触发物化 tick。（逐字采用 intake.lua 模式。）
- **qa_materialize_next** — 在四个内核接缝上执行 `reconcile.handlers(bindings.seams())`。
- **dead_letter** — `workflow.dead_letter.handlers({package = "workflow-qa"})`。
- **触发器** `qa_poll` — 每 30 分钟生成 `workflow_qa_tick` 的 cron，并带有生产者活性测试。
- **认领** = 自有标签搜索（通过 forge.github handle 执行 `github.issue_search 'label:fkst-qa'`）；`lease.verify_claim` 返回 true — 标签本身就是认领凭据。workflow-QA **绝不**消费 `github-devloop-intake.devloop_intake_candidate`（INTAKE_POLICY_SET 仅允许两种 dev 实现；第三个消费者会导致 `check_repo_intake_routing.py` 失败）。

### 蓝图 `qa-e2e`（fkst.workflow.v1 — 线性，使用最多 16 个步骤中的 4 个，生成器 ≤ 8000 B）

1. **discover-stack** — 只读判断 codex（`judgment_codex_opts`，worktree `.`）：输出严格 JSON `{services, boot_commands, middleware_deps, required_env_keys, credential_gaps}`。将 docker-compose/Dockerfiles 视为发现数据，并转换为原生方案。
2. **propose-test-cases** — 只读 codex：将派生用例与从触发 issue 正文/线程中读取的用户建议用例合并；输出严格 JSON `[{id, title, preconditions, steps, expected}]`。将其保留为独立步骤，使测试用例列表能够在任何内容运行前成为持久且可供人工审查的评论。
3. **bootstrap-and-run** — **唯一一个不受限步骤**（`unrestricted_codex_opts`，生产环境先例 `packages/workflow-writer/bindings.lua:46-49`；`opts.timeout = 3600`；退出码 124 → `workflow-qa: qa-run-timeout`）。生成器提示词（+ `prompts/bootstrap-recipes.md`）承载全部 shell 内容：通过 HTTPS 将探测后锁定版本的中间件二进制文件下载到 `$HOME/qa/bin`、验证校验和、执行 `chmod +x`、在 `$HOME/qa/data` 下创建 datadir、执行 `nohup <daemon> --bind 127.0.0.1 … & `、健康轮询端口、生成临时凭据、从进程环境导出已注入的真实凭据、启动所属项目服务、执行**每一个**已提出的用例、清理 datadir；输出严格 JSON `[{case_id, status: pass|fail|error|skipped, evidence, logs_excerpt}]`。将引导启动和运行合并为一个步骤，意味着守护进程只需存活到这一单个步骤结束 — 从而绕开尚未验证的跨步骤持久性问题。缺失环境变量键会产生 `skipped` 结果以及一条凭据缺口发现（“将键 X 添加到你的环境配置文件”），而不是难以解释的启动失败。
4. **file-results** — 最后一步。**Lua executor**（而非 codex）通过 `qa_logic.decode_results` 解码步骤 3 的输出（严格的稠密数组解码、致命错误类别），并针对每个失败用例触发一个 `github-proxy.github_issue_create_request`，使用确定性的去重键（finding_dedup_key 模具），按严重程度排序并限制数量；默认 label = `fkst-qa-finding`（参见“决策项”）。先提交结果再写标记的顺序可保证“结果已提交”先于该步骤的 created 标记出现。

### 执行器/完成条件

- `raise_step` 基于 `child_dedup_key` 保持幂等（事实优先：created → `exists`，generated → `wait`），同步启动 codex，将步骤 JSON + created 标记作为机器人评论发布 — issue 线程是唯一的步骤间总线（约 12 KB/body；步骤间仅传递有界摘要，完整日志保留在沙箱内）。
- 如果 substrate 将 `opts.timeout` 限制在繁重运行所需时间以下，则回退到异步 `spawn_codex` + `fkst.codex_runs`，完成状态为 `running`。
- `completion.lua` = 字节完全一致的纯读取器（created + `result.state == ready` → `result_ready`）。

### 棘轮规范符合性

- 所有 gh/git 出站访问都通过 `forge.github` / `forge.git` 适配器（只能收缩的空允许列表）。
- 每一条具体 shell 命令都存在于生成器/提示词**数据**中，绝不出现在软件包 Lua 中（“命令在 codex agent 内运行，绝不在此 Lua 中运行” — workflow-writer 惯用法）。
- 测试：必需的三项 — `core_test.lua`（解码/去重/builder）、`namespaced_dispatch_test.lua`（带前缀和裸队列名、拒绝外部队列）、`fire_raiser_qa_poll_test.lua`（consumer_result/source_payload/raised/routed_to 跟踪字段）。Lua 测试仅在 CI 中执行。

---

## 4. 中间件引导启动

**机制：** 由提示词驱动，下载并运行非特权预编译二进制文件，且**由步骤 3 的 codex agent 执行** — 绝不由软件包 Lua、容器或 k8s 执行。

- 出站访问：公共 HTTPS 完全开放（GitHub releases、供应商 CDN、PyPI）。
- 可写根目录：`$HOME`、`/tmp`、`FKST_RUNTIME_ROOT`（uid 10001 无法写入 `/usr`）。
- 回环网络：NetworkPolicy 只控制 pod 间流量 — 沙箱内服务可正常连接 `127.0.0.1:PORT`。
- 预算纪律：提示词要求 codex **仅**启动步骤 1 认定为必需的中间件、限制 datadir 大小并执行清理（尚未量化 ephemeral-storage 限制）。
- 版本锁定：`bootstrap-recipes.md` 锁定探测验证过的版本；对于未锁定版本的中间件，只进行尽力尝试，并如实返回 `error` 结果。

**阶段 2 结构性升级（正确的修复方式）：** 接通会话的 agent 前安装步骤（§6），使配置文件的安装命令能够在**每个会话中、codex 计时范围之外**确定性地运行一次 — 中间件在 agent 启动前就绪。后续可选方案：将精选的中间件层烘焙进沙箱镜像（`backend/Dockerfile`，属于托管侧面向用户的产物 — 在范围内），从而消除下载不稳定性，并在 CI 中预先验证 gVisor 兼容性。除非需求证明有此必要，否则延后处理（因为会增大所有会话使用的镜像）。

---

## 5. 凭据与环境流

**两类凭据，两条路径：**

1. **临时凭据**（数据库用户/密码、服务间 token）：由步骤 3 的 codex agent 生成 — 随机值被导出到守护进程和服务中，永不持久化或出站。纯提示词约定，无需管道支持。
2. **真实凭据**（LLM API key、所属服务所需的第三方 token）：使用**现有的**环境配置文件管道，端到端工作，阶段 1 无需任何新管道：
   - 用户对配置文件执行 `PUT`（只写 secrets；阶段 1 需要类似 `true` 的占位安装命令 — 在阶段 2(b) 中移除）。
   - 在触发 issue 的 `### Environment` 部分指定其名称（每个会话只能使用一个配置文件；其状态必须为 `status=ready`，否则启动会以 fail-closed 方式被阻止，并发布一条 issue 评论）。
   - 启动时，已解析的变量 + secret 值通过凭据通道以 `userenv.<KEY>` 文件形式传递（K8s Secret mount / OSB `upload_file` + sentinel），在 pod 启动时读取一次，首先折叠进引擎子进程环境，平台变量最后写入 — 用户值绝不能覆盖 `FKST_*` / `LLM_API_KEY` / `GITHUB_TOKEN` / `GIT_CONFIG_*` / PATH 类键（`reserved_env.rs` 至关重要）。
   - 结果：每个键都是普通进程环境变量，对软件包 Lua 可见（通过 `exec_sync` printf 调用 `workflow.env.read_env`），并由不受限 codex shell 及其启动的每个服务继承。

**应记录而非抵触的约定：** 用户以自己的名称提供键（例如 `OPENAI_API_KEY`，绝不使用保留的 `LLM_API_KEY`）；QA 凭据位于会话所使用的单一配置文件中（或复制到其中）；secrets 通过 HTTP 永久只写（由契约锁定）— 唯一的读取面是沙箱内进程环境。步骤 1 声明 `required_env_keys`；步骤 3 将这些键与实际环境进行映射，并以可操作的方式报告缺口。

---

## 6. 环境配置文件扩展（fkst-hosted）

所有项目均为增量式变更，基于现有接缝，位于 fkst-hosted 面向用户的范围内（无内核引擎代码）。每项都是一个单独的小型 PR，合入 `develop` 并关联 issue；每个路由/DTO 变更都遵循 OpenAPI 契约（`#[utoipa::path]`、`ToSchema`/`IntoParams`、`OpenApiRouter`/`routes!`、锁定 utoipa 5 / utoipa-axum 0.1、`tests/openapi.rs` 通过）。

- **PR A — 仅凭据配置文件：** 放宽 `validate_install`（`routes/environments.rs:195-201`），允许安装列表为空，并在 `install=[]` 时跳过验证 pod。约 20 行 + 测试。移除 `true` 占位命令。
- **PR B — 接通会话安装步骤（关键扩展）：** `install/mod.rs:4-8` 明确保留了第二个调用位置。通过 `EnvResolution::Proceed` 传递 `install`，而不是将其丢弃（`reconcile/execute.rs:441-482`）；将其作为又一个凭据产物进行传递（在 `credential_secret_data` 中，将 `install.json` 与 `userenv.*` 并列，`session_spec/creds.rs:85-117` — 对 K8s Secret-volume mount 和 OSB upload 路径都无需修改即可工作）；让 pod 内 driver 在 supervise **之前**运行 `install::run_ordered`，并在失败时以 fail-closed 方式终止会话，同时使用 `InstallValidationError` 的详细信息结构。需要验证的注意事项：在 OSB 安全态势下，命令必须能够以非 root 方式安全运行（curl/tar 到 `$HOME`）；验证 pod 的镜像应与沙箱镜像一致，否则通过 PUT 验证的命令在运行时仍可能失败。
- **PR C — 前端配置文件 CRUD 页面（可选，可并行）：** 支持列表/创建/编辑/删除，并提供只写 secret 输入；REST API 已完整，dashboard 的身份验证流程也已持有 GitHub token（当前已记录通过带外方式完成配置）。
- **PR D — 按工作标签覆盖资源（验证后）：** OSB 创建时的 `resourceLimits` map 是自由形式，但 fkst-hosted 仅应用一组全局 `FKST_OSB_SESSION_CPU/_MEMORY`；增加例如 `FKST_OSB_QA_SESSION_CPU/_MEMORY`，在会话工作标签为 QA 标签时应用，同时受限于 20-pod / 40-CPU / 80-Gi 集群配额。需先验证该 map 的按会话行为，因此当前受阻。
- **延后（阶段 3）：** 使用 `qaenv.*` 凭据前缀限定 `qa_variables`/`qa_secrets` DTO+store 作用域；第二个 `### QA Environment` 触发部分/配置文件组合；每仓库默认配置文件。对于 v1，每个会话使用一个含普通键的配置文件已足够，并且每个扩展接缝都是增量式的。

---

## 7. 复用与新增

**复用（fork）：** 将 `packages/workflow-security` 整体作为模具（bindings/executor/intake/discovery/completion/catalog/records、department shells、raiser、三项测试）；不改动 `libraries/workflow/engine/*`；使用 `libraries/workflow/codex.lua`（步骤 1-2 使用 judgment，步骤 3 使用 unrestricted）；使用 `libraries/workflow/env.lua` read_env；使用 `once`/`cache_*`/`with_lock`；使用 forge.github/forge.git + github-proxy `issue-create.v1` / `issue-comment.v1`；以 `security_logic.lua` 作为 `qa_logic.lua` 的模具；使用 archaudit 的 `opts.timeout` + 标签探测模式。

**复用（fkst-hosted）：** 整个环境配置文件栈（store trait、EnvStore ConfigMap/Secret、routes + validators + 422 shape、`reserved_env.rs`、GithubUser extractor + access policy、`userenv.*` 凭据传递、driver/plan 注入分层）；`install::run_ordered` + validate-env holder 模式。

**新增（fork）：** `packages/workflow-qa` 本身（全部沿用复制形态，不新增内核或宿主原语）+ 一次性的能力探测提示词。

**新增（fkst-hosted）：** 上述 PR A-D。

---

## 8. 阶段划分

| 阶段 | 内容 | 后端变更 |
|---|---|---|
| **0 — 探测** | 一次性沙箱内 dry-run：锁定版本的 redis/postgres/mongod 的 gVisor 兼容性矩阵、守护进程回收语义、跨步骤持久性、磁盘预算。作为蓝图所宣称支持中间件的门禁。 | 无 |
| **1 — 软件包** | 完成 `packages/workflow-qa`（3 个 fork PR：骨架 → 流水线 → 内容）+ 记录凭据约定（配置文件 secrets + `### Environment` + `true` 占位命令）+ 实时验证运行。 | 无 |
| **2 — 托管扩展** | PR A（空安装列表）、PR B（会话安装步骤）、PR C（配置文件 CRUD 页面）、PR D（按标签分配资源）。 | 小型、增量式、在范围内 |
| **3 — 延后** | QA 作用域环境字段；多步骤持久守护进程蓝图（仅当探测证明可以存活时）；镜像内置中间件；配置文件组合。 | 按需 |

---

## 9. 需要用户决定的事项

1. **失败路由：** 专用 `fkst-qa-finding` 标签（人工分诊 — v1 **推荐**）与仓库的 devloop 工作标签（自动修复循环；可能因不稳定测试噪声而反复震荡）二选一。builder 只需一行配置即可选择。
2. **QA 凭据建模：** 按约定使用普通配置文件键（**推荐**，后端零变更），或增加 `qa_variables`/`qa_secrets` 作用域（延后到阶段 3）。
3. **资源：** 保持 2 CPU / 4Gi（阶段 0-1 **推荐**），或全局提升，或按标签覆盖（作为 PR D 推进）。
4. **中间件长期交付方式：** 每次运行由 codex 下载（阶段 1）→ 以接通的会话安装步骤为主（**推荐**，PR B）→ 仅当下载不稳定性被证明影响显著时才烘焙进镜像。

---

## 10. 完成定义（Definition of Done）

**阶段 0：** 能力矩阵以 issue 评论形式发布；结论（各中间件的是/否结果 + 锁定版本、守护进程回收答案、磁盘预算）记录在 fork 文档中。

**阶段 1（fork）：** `scripts/check_repo.py` 完全通过（命名空间队列、saga 形态、gh/git 适配器兜底、错误类别前缀、生产者活性、不改动空的代码去重允许列表）；三项测试在 CI 中通过；针对一个已知正常的小型项目执行实时 fkst-qa 运行，完成全部 4 个步骤、发布步骤评论，并将至少一个预置的失败用例提交为带去重键的 issue；对同一作用域再次 reconcile 时不重新运行任何内容，也不重复提交任何内容；README 说明真实范围 + 凭据约定。

**阶段 2（fkst-hosted），每个 PR：** 关联 issue；五项 CI 检查通过；任何路由/DTO 变更均保证 `tests/openapi.rs` 通过；PR A — 仅凭据配置文件无需占位命令即可执行 PUT，并跳过验证 pod；PR B — 配置文件的安装命令在两个后端（K8s + OSB）的真实会话中都能于 agent 启动前执行，且失败命令会阻止会话并提供详细错误结构；PR C — 配置文件 CRUD 端到端工作，secrets 保持只写；PR D — 能够明确证明带 QA 标签的会话获得覆盖后的限制，而非 QA 会话继续使用全局配置对。

**诚信门禁：** 软件包绝不宣称支持未经探测验证的中间件；README 明确说明，在沙箱模板发生变化之前，Docker 形态、需要 root、依赖私有资源或占用超过 4Gi 的项目均不在范围内。
