# workflow-QA — Automated E2E Testing of the Owner Project In-Sandbox

**Status:** Design (converged). **Repos:** `shining-fkst-packages` (fork — the package) + `fkst-hosted` (environment-profile extensions). **Template:** `packages/workflow-security` on the `workflow.engine.*` kernel. **Merge gates:** fork `scripts/check_repo.py` ratchet suite; fkst-hosted five-check CI + OpenAPI discipline.

---

## 1. Overview

workflow-QA is a workflow adapter that, given a trigger issue labeled `fkst-qa` on an owner repo:

1. **Profiles** the checked-out owner project (services, boot commands, middleware deps, required env keys).
2. **Proposes test cases** (merging any user-proposed cases from the trigger-issue body).
3. **Bootstraps and runs**: downloads and starts required middleware as unprivileged binaries on `127.0.0.1`, fills temporary credentials, reads real credentials from the session environment, boots the owner services, and executes every proposed case — all inside **one unrestricted codex step** in the session sandbox.
4. **Files failures** as dedup-idempotent GitHub issues via github-proxy.

State lives entirely in bot comments on the trigger issue (the kernel's comment-thread bus). Idempotency, CAS keys, frontier advancement, and terminal markers come from the kernel for free.

Real user credentials (e.g. an LLM API key the owner service needs) reach the QA environment through the **existing** fkst-hosted environment-profile feature with **zero backend changes** in phase 1. Phase 2 lands small, additive, in-scope fkst-hosted PRs that make bootstrap deterministic and the creds UX clean.

---

## 2. Feasibility — the honest verdict

Grounded in the **prod OSB sandbox posture**: gVisor runtime, non-root uid 10001, image = fkst-control-plane on `debian:bookworm-slim` (only git/bash/python3/codex/gh — no node, no docker, no compilers, no apt as non-root), egress = public internet only (`0.0.0.0/0` minus RFC1918 + GCP metadata; cluster-internal unreachable), 2 CPU / 4Gi shared by engine + codex + everything QA starts, no SA token / no RBAC. Note: the apt-capable boxed-root pod in `k8s/isolation.rs` is the **legacy k8s backend** — prod is the stricter OSB posture; this design targets non-root/no-apt.

### Works NOW (zero infra / backend change)

- The whole adapter: kernel seams, label intake, codex steps, comment-thread state, github-proxy filing — a mechanical clone of workflow-security.
- **Real credentials**: environment-profile secrets → `userenv.<KEY>` creds files → folded first into the engine child env (reserved keys stripped) → plain process env inherited by package Lua (`workflow.env.read_env`) and every codex child shell.
- **Middleware auto-bootstrap — with a mechanism change**: NOT containers, but download-and-run of **unprivileged prebuilt Linux binaries** over the open public HTTPS egress, started via `nohup … &` bound to `127.0.0.1` (NetworkPolicy does not touch pod loopback). Compat ladder: **Redis** (static build) — safe; **portable Postgres** (non-root initdb under `$HOME`) — likely; **MongoDB** (bookworm-glibc tgz) — gVisor syscall compat **unverified, must be probed**. Missing runtimes (node, go, jdk) are obtainable the same way (official tarballs to `$HOME`).
- Headless E2E for API/CLI-shaped services fitting the 2 CPU / 4Gi budget.

### NEVER feasible under the current sandbox template — do not design around it

- `docker` / `docker-compose` / testcontainers: no container runtime in the image, non-root, gVisor + RuntimeDefault seccomp, no privilege escalation, no userns nesting. Compose files are **discovery data** that step 1 translates into native binary plans; projects whose E2E genuinely requires Docker images are **out of scope**.
- Root / apt installs; source builds (no compilers).
- Spawning sibling sandboxes or k8s objects (`automountServiceAccountToken: false`, RBAC-less SA, k8s API + OSB lifecycle server both in blocked private ranges).
- Reaching any private / cluster-internal / company-internal dependency — every external dependency must have a public URL.
- Human inspection of the live app (no ingress/port-forward) — QA is fully headless; results egress only via GitHub.
- Realistically also: browser-based E2E (Chromium under gVisor at 4Gi is OOM-prone) and heavy multi-service stacks.

### Must be EMPIRICALLY PROBED before promising specific middleware (Phase 0)

1. gVisor syscall compat for the exact pinned mongod/postgres versions.
2. Whether the engine kills the spawned **process group** on exec timeout (would reap nohup daemons started in the same call) — substrate-side, unverified. Orphan-survival doctrine (fork CLAUDE.md:168) suggests daemons persist, but the design does not depend on it.
3. Cross-step daemon persistence (only matters for a future multi-step blueprint).
4. The unquantified ephemeral-disk budget (no `ephemeral-storage` limit in the batchsandbox template).

A cheap one-off probe session (throwaway fkst-qa dry-run blueprint: one unrestricted step boots each candidate, reports a strict-JSON capability matrix as an issue comment) settles all four.

### Scope statement for the README

> workflow-QA runs headless end-to-end tests for projects that are docker-free, have only public external dependencies, fit ~2 CPU / 4Gi alongside the engine, and need middleware available as unprivileged prebuilt binaries (Redis/Postgres-class; Mongo pending probe). Docker-image-shaped stacks, root installs, private endpoints, and browser E2E are out of scope until the sandbox template itself changes.

---

## 3. The workflow-QA package (fork)

A workflow **adapter** — not a bespoke department pipeline — copied seam-for-seam from `packages/workflow-security`. Zero kernel changes (the empty code-dedup allowlist forbids copying engine logic anyway).

### Identity (`qa_logic.lua`)

| Item | Value |
|---|---|
| Namespace | `fkst:workflow-qa` (`engine.marker.for_namespace`) |
| Label | `fkst-qa` (never shared with another trigger issue — one session = one work label) |
| Workflow id | `qa-e2e` (must not collide with any `FKST_WORKFLOW_CATALOG_ROOT` template id — duplicate ids silently disqualify BOTH) |
| Queues | `qa_run_request`, `workflow_qa_tick`, `workflow_qa_materialization_tick` |
| Error classes | greppable `workflow-qa: <class>:` prefixes (`results-not-array`, `qa-run-timeout`, …) |

### fkst.toml

`kind = "package.composed"`, `persistence_class = "saga"`, `lib_deps = [contract, workflow, testkit, forge, devloop]`, `event_deps = [github-proxy]`.

### Departments and claim path

- **qa_select** — consumes `qa_run_request` + `workflow_qa_tick`; for each discovered open, unterminalized `fkst-qa` scope: stamp the blueprint marker if absent, raise the materialization tick. (intake.lua pattern verbatim.)
- **qa_materialize_next** — `reconcile.handlers(bindings.seams())` over the four kernel seams.
- **dead_letter** — `workflow.dead_letter.handlers({package = "workflow-qa"})`.
- **Raiser** `qa_poll` — 30-minute cron producing `workflow_qa_tick`, with the producer-liveness test.
- **Claim** = own-label search (`github.issue_search 'label:fkst-qa'` via the forge.github handle); `lease.verify_claim` returns true — the label IS the claim. workflow-QA **never** consumes `github-devloop-intake.devloop_intake_candidate` (INTAKE_POLICY_SET admits only the two dev implementations; a third consumer fails `check_repo_intake_routing.py`).

### Blueprint `qa-e2e` (fkst.workflow.v1 — linear, 4 of max 16 steps, generators ≤ 8000 B)

1. **discover-stack** — read-only judgment codex (`judgment_codex_opts`, worktree `.`): emits strict JSON `{services, boot_commands, middleware_deps, required_env_keys, credential_gaps}`. Treats docker-compose/Dockerfiles as discovery data to translate into native plans.
2. **propose-test-cases** — read-only codex: merges derived cases with user-proposed cases read from the trigger-issue body/thread; emits strict JSON `[{id, title, preconditions, steps, expected}]`. Kept as its own step so the case list is a durable, human-reviewable comment before anything runs.
3. **bootstrap-and-run** — **the one unrestricted step** (`unrestricted_codex_opts`, production precedent `packages/workflow-writer/bindings.lua:46-49`; `opts.timeout = 3600`; exit 124 → `workflow-qa: qa-run-timeout`). The generator prompt (+ `prompts/bootstrap-recipes.md`) carries ALL shell content: download probe-pinned middleware binaries to `$HOME/qa/bin` over HTTPS, verify checksums, `chmod +x`, datadirs under `$HOME/qa/data`, `nohup <daemon> --bind 127.0.0.1 … & `, health-poll ports, synthesize temp creds, export injected real creds from process env, boot owner services, execute **every** proposed case, clean up datadirs; emits strict JSON `[{case_id, status: pass|fail|error|skipped, evidence, logs_excerpt}]`. Collapsing bootstrap+run into one step means daemons only need to outlive this single step — sidestepping the unverified cross-step-persistence question. Missing env keys produce `skipped` results plus a credential-gap finding ("add key X to your environment profile"), not a mystery boot failure.
4. **file-results** — final step. The **Lua executor** (not codex) decodes step-3 output via `qa_logic.decode_results` (strict dense-array decode, fatal error classes) and raises one `github-proxy.github_issue_create_request` per failing case with a deterministic dedup key (finding_dedup_key mold), severity-sorted and capped; label = `fkst-qa-finding` by default (see Decisions). File-then-marker ordering guarantees "results filed" precedes the step's created marker.

### Executor / completion

- `raise_step` idempotent on `child_dedup_key` (facts-first: created → `exists`, generated → `wait`), spawns codex sync, posts step JSON + created marker as bot comments — the issue thread is the only inter-step bus (~12 KB/body; only bounded summaries cross steps, full logs stay in-sandbox).
- If the substrate clamps `opts.timeout` below what heavy runs need, fall back to async `spawn_codex` + `fkst.codex_runs` with completion status `running`.
- `completion.lua` = byte-identical pure reader (created + `result.state == ready` → `result_ready`).

### Ratchet compliance

- All gh/git egress rides `forge.github` / `forge.git` adapters (shrink-only empty allowlist).
- Every concrete shell command lives in generator/prompt **data**, never package Lua ("commands run inside the codex agent, never in this Lua" — workflow-writer idiom).
- Tests: the required trio — `core_test.lua` (decode/dedup/builder), `namespaced_dispatch_test.lua` (prefixed + bare queue names, foreign rejection), `fire_raiser_qa_poll_test.lua` (consumer_result/source_payload/raised/routed_to trace fields). Lua tests execute in CI only.

---

## 4. Middleware bootstrap

**Mechanism:** prompt-driven download-and-run of unprivileged prebuilt binaries, executed **by the step-3 codex agent** — never by package Lua, never by containers, never by k8s.

- Egress: public HTTPS is fully open (GitHub releases, vendor CDNs, PyPI).
- Writable roots: `$HOME`, `/tmp`, `FKST_RUNTIME_ROOT` (no `/usr` writes as uid 10001).
- Loopback: NetworkPolicy governs pod-to-pod traffic only — in-sandbox services connect to `127.0.0.1:PORT` normally.
- Budget discipline: the prompt instructs codex to start **only** the middleware step 1 identified as required, cap datadir size, and clean up (no ephemeral-storage limit is quantified).
- Version pinning: `bootstrap-recipes.md` pins probe-verified versions; unpinned middleware gets a best-effort attempt with an honest `error` result.

**Phase-2 structural upgrade (the proper fix):** wire the session pre-agent install step (§6) so a profile's install commands run deterministically **once per session, outside the codex wall clock** — middleware comes up before the agent starts. Optionally later: bake a curated middleware layer into the sandbox image (`backend/Dockerfile`, a hosted user-facing artifact — in scope) to eliminate download flakiness and pre-verify gVisor compat in CI. Deferred unless demand proves it (fattens the image for all sessions).

---

## 5. Credentials and environment flow

**Two credential classes, two paths:**

1. **Temporary creds** (DB users/passwords, service-to-service tokens): synthesized by the step-3 codex agent — random values exported into daemons and services, never persisted or egressed. Pure prompt convention, no plumbing.
2. **Real creds** (LLM API keys, third-party tokens the owner service needs): the **existing** environment-profile pipeline, end-to-end, zero new plumbing in phase 1:
   - User `PUT`s a profile (write-only secrets; phase 1 requires a stub install command like `true` — removed by phase 2(b)).
   - Names it in the trigger issue's `### Environment` section (exactly ONE profile per session; must be `status=ready` or launch is blocked fail-closed with an issue comment).
   - At spawn, resolved variables + secret values ride the creds channel as `userenv.<KEY>` files (K8s Secret mount / OSB `upload_file` + sentinel), read once at pod boot, folded FIRST into the engine child env with platform vars written LAST — user values can never override `FKST_*` / `LLM_API_KEY` / `GITHUB_TOKEN` / `GIT_CONFIG_*` / PATH-class keys (`reserved_env.rs` is load-bearing).
   - Result: every key is plain process env, visible to package Lua (`workflow.env.read_env` over `exec_sync` printf) and inherited by the unrestricted codex shell and every service it launches.

**Conventions to document, not fight:** users supply keys under their own names (e.g. `OPENAI_API_KEY`, never the reserved `LLM_API_KEY`); QA creds live in (or are duplicated into) the single profile the session uses; secrets are write-only over HTTP forever (contract-locked) — the only read surface is in-sandbox process env. Step 1 declares `required_env_keys`; step 3 maps them against the actual env and reports gaps actionably.

---

## 6. Environment-profile extension (fkst-hosted)

All items are additive, on existing seams, inside fkst-hosted's user-facing scope (no kernel-engine code). Each is a separate small PR into `develop` with a linked issue; every route/DTO change follows the OpenAPI contract (`#[utoipa::path]`, `ToSchema`/`IntoParams`, `OpenApiRouter`/`routes!`, utoipa 5 / utoipa-axum 0.1 pins, `tests/openapi.rs` green).

- **PR A — creds-only profiles:** relax `validate_install` (`routes/environments.rs:195-201`) to permit an empty install list and skip the validation pod when `install=[]`. ~20 lines + tests. Removes the `true` stub.
- **PR B — wire the session install step (the load-bearing extension):** `install/mod.rs:4-8` explicitly reserves this second call site. Carry `install` through `EnvResolution::Proceed` instead of dropping it (`reconcile/execute.rs:441-482`), deliver it as one more creds artifact (`install.json` alongside `userenv.*` in `credential_secret_data`, `session_spec/creds.rs:85-117` — works unchanged for both the K8s Secret-volume mount and the OSB upload path), and have the in-pod driver run `install::run_ordered` **before** supervise, failing the session fail-closed with the `InstallValidationError` detail shape. Caveats to verify: commands must be non-root-safe (curl/tar to `$HOME`) under the OSB posture, and the validation-pod image should match the sandbox image or PUT-validated commands can still fail at run time.
- **PR C — frontend profile CRUD page (optional, parallel):** list/create/edit/delete with write-only secret entry; the REST API is complete and the dashboard auth flow already holds the GitHub token (today provisioning is documented as out-of-band).
- **PR D — per-work-label resource override (after verification):** OSB's create-time `resourceLimits` map is free-form, but fkst-hosted applies one global `FKST_OSB_SESSION_CPU/_MEMORY` pair; add e.g. `FKST_OSB_QA_SESSION_CPU/_MEMORY` applied when the session's work label is the QA label, bounded by the 20-pod / 40-CPU / 80-Gi fleet quota. Blocked on verifying the map's per-session behavior.
- **Deferred (phase 3):** `qa_variables`/`qa_secrets` DTO+store scoping with a `qaenv.*` creds prefix; a `### QA Environment` second trigger section / profile composition; per-repo default profiles. One profile per session with plain keys is sufficient for v1 and every extension seam is additive.

---

## 7. Reuse vs new

**Reuse (fork):** `packages/workflow-security` wholesale as the mold (bindings/executor/intake/discovery/completion/catalog/records, department shells, raiser, test trio); `libraries/workflow/engine/*` untouched; `libraries/workflow/codex.lua` (judgment for steps 1-2, unrestricted for step 3); `libraries/workflow/env.lua` read_env; `once`/`cache_*`/`with_lock`; forge.github/forge.git + github-proxy `issue-create.v1` / `issue-comment.v1`; `security_logic.lua` as the `qa_logic.lua` mold; archaudit's `opts.timeout` + label-probing patterns.

**Reuse (fkst-hosted):** the entire environment-profile stack (store trait, EnvStore ConfigMap/Secret, routes + validators + 422 shape, `reserved_env.rs`, GithubUser extractor + access policy, `userenv.*` creds delivery, driver/plan injection layering); `install::run_ordered` + the validate-env holder pattern.

**New (fork):** `packages/workflow-qa` itself (all copy-shape, no new kernel or host primitives) + the throwaway capability-probe prompt.

**New (fkst-hosted):** PRs A-D above.

---

## 8. Phasing

| Phase | Contents | Backend change |
|---|---|---|
| **0 — Probe** | One-off in-sandbox dry-run: gVisor compat matrix for pinned redis/postgres/mongod, daemon-reap semantics, cross-step persistence, disk budget. Gates the blueprint's advertised middleware. | none |
| **1 — Package** | `packages/workflow-qa` complete (3 fork PRs: skeleton → pipeline → content) + documented creds convention (profile secrets + `### Environment` + `true` stub) + live validation run. | none |
| **2 — Hosted extensions** | PR A (empty install list), PR B (session install step), PR C (profile CRUD page), PR D (per-label resources). | small, additive, in-scope |
| **3 — Deferred** | qa-scoped env fields; multi-step persistent-daemon blueprint (only if probe proved survival); image-baked middleware; profile composition. | on demand |

---

## 9. Decisions for the user

1. **Failure routing:** dedicated `fkst-qa-finding` label (human triage — **recommended** for v1) vs the repo's devloop work label (auto-fix loop; risk of thrashing on flaky-test noise). One-line builder choice.
2. **QA creds modeling:** plain profile keys by convention (**recommended**, zero backend change) vs additive `qa_variables`/`qa_secrets` scoping (defer to phase 3).
3. **Resources:** stay at 2 CPU / 4Gi (**recommended** for phases 0-1) vs global bump vs per-label override (pursue as PR D).
4. **Middleware delivery long-term:** per-run codex download (phase 1) → wired session install step as primary (**recommended**, PR B) → image baking only if download flakiness proves material.

---

## 10. Definition of Done

**Phase 0:** capability matrix posted as an issue comment; verdicts (per-middleware yes/no + pinned versions, daemon-reap answer, disk budget) recorded in fork docs.

**Phase 1 (fork):** `scripts/check_repo.py` fully green (namespaced queues, saga shape, gh/git adapter backstop, error-class prefixes, producer-liveness, empty code-dedup allowlist untouched); the test trio passes in CI; a live fkst-qa run against a known-good small project completes all 4 steps, posts step comments, and files at least one seeded failing case as a dedup-keyed issue; a re-reconcile of the same scope re-runs nothing and double-files nothing; README states the honest scope + creds convention.

**Phase 2 (fkst-hosted), per PR:** linked issue; the five CI checks green; `tests/openapi.rs` green on any route/DTO change; PR A — a creds-only profile PUTs without a stub and skips the validation pod; PR B — a profile's install commands execute in the real session before the agent starts on BOTH backends (K8s + OSB), and a failing command blocks the session with the detailed error shape; PR C — profile CRUD works end-to-end with write-only secrets; PR D — a QA-labeled session demonstrably receives the override limits while non-QA sessions keep the global pair.

**Honesty gate:** the package never advertises middleware the probe did not verify, and the README says plainly that docker-shaped, root-requiring, private-dependency, or >4Gi projects are out of scope until the sandbox template changes.