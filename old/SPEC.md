# Specification — `workflow-QA`: Ephemeral QA Sessions for Automated End-to-End Testing

> **Status:** design-approved, **not implemented**. This is the build spec.
> **Architecture:** **Option B — a separate, ephemeral QA substrate session** (own sandbox, torn down after each run).
> **Feasibility study (background):** `docs/specs/workflow-qa/DESIGN.md` in this repo.
> **Spans two repos:** the `workflow-qa` package (this fork) + control-plane wiring in **fkst-hosted**.

---

## 0. Decisions

**Locked (by the owner):**

| # | Decision | Value |
|---|---|---|
| D1 | Where failures go | **File `fkst-dev`-labelled issues** so the development department auto-fixes them (cross-session). |
| D2 | Sandbox model | **B — separate, ephemeral QA session** with its own sandbox, destroyed after the run; the main dev/company session is never touched. |
| D3 | QA resources | **2 CPU / 4Gi** (the standard session size) for now. |
| D4 | QA environment profile | A **richer profile**: env vars + secrets + software-install commands + **middleware list & versions**. |

**Open (deferred to build time — recommendations noted in §7):**

| # | Question | Recommendation |
|---|---|---|
| O1 | What *triggers* a QA run? | Auto-file an `fkst-qa` run request when a dev PR merges, **plus** allow a manual `fkst-qa` request issue. |
| O2 | How is middleware delivered? | Codex downloads prebuilt binaries in phase 1; wire the (designed-but-dead) pre-agent install step in phase 2. |

---

## 1. Goal

Give any owner project **fully automated, headless end-to-end testing** driven from GitHub: on demand (or after a merge), spin up an **isolated, throwaway sandbox**, bootstrap the project's middleware and services with real + temporary credentials, run all proposed test cases, and file every failure back as a `fkst-dev` issue so the development department fixes it — then destroy the sandbox.

**In scope:** headless, binary-bootstrappable services with public dependencies that fit in ≤ 4Gi and one lightweight datastore.
**Out of scope (hard sandbox limits, see §3):** Docker / docker-compose / testcontainers, root/`apt` installs, browser E2E, heavy multi-service stacks, any dependency on a private/cluster-internal service.

---

## 2. Architecture — Option B: the ephemeral QA session

The core idea: **QA is its own substrate session**, not a department inside the long-lived dev/company session. It reuses the *existing* session lifecycle (create pod → run → idle-to-zero) to get isolation and automatic teardown for free.

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

### 2.1 Lifecycle

1. **Trigger** (O1) opens an `fkst-qa` **run request** issue on the owner repo (auto after a merge, or manually).
2. The fkst-hosted reconciler recognises the `fkst-qa` work label and **provisions a separate QA session** (its own OSB sandbox), with the repo's **QA environment profile** attached.
3. Before the agent starts, the control plane runs the profile's **install step** (software + middleware binaries) — a deterministic pre-agent bootstrap (phase 2; phase 1 does this inside the codex step).
4. Inside sandbox B, the **`workflow-qa` package** runs the E2E blueprint (§5): discover → propose test cases → bootstrap & run → file failures.
5. Failing cases are filed as **`fkst-dev` issues** on the owner repo → picked up by the **main** dev session (cross-session via labels).
6. The QA run request closes → the QA session has no open work → **idles to zero → sandbox B is destroyed** (ephemeral teardown, no residue).

### 2.2 Why B

- **Isolation:** middleware + services + their memory/CPU never compete with or pollute the live dev sandbox.
- **Clean teardown:** the sandbox is thrown away every run — no leaked daemons, no state bleed between runs.
- **Reuses existing machinery:** the create→idle-to-zero session lifecycle already destroys sandboxes when work is done; QA just needs its own trigger + label + profile attachment, not a net-new sandbox primitive.
- **Non-negotiable reason it must be a session, not a package trick:** a package running *inside* a sandbox **cannot create another sandbox** (no service-account token; the OpenSandbox lifecycle server is cluster-internal and blocked by the egress lockdown — see §3). Only the **control plane** can. A separate QA *session* is how the control plane grants QA its own sandbox.

---

## 3. Feasibility & sandbox constraints (grounded)

All verified against fkst-hosted's OSB manifests + config and this fork's package SDK.

**What the QA sandbox CAN do:**
- **Public-internet egress on all ports** — download prebuilt middleware binaries (Redis tgz, portable Postgres, Mongo tgz), `pip install`, call LLM APIs, clone from GitHub. (Cluster-internal `*.svc`, RFC1918, and the GCP metadata IP are blocked.)
- **Run unprivileged user-space processes** — `exec_sync` is a genuine shell; download a binary to `$HOME`/`$FKST_RUNTIME_ROOT`, `chmod +x`, run it as uid 10001 under gVisor. Redis/Postgres/Mongo are all rootless-capable daemons.
- **Background daemons** via `nohup <mware> … &` inside `exec_sync`, then health-poll with subsequent calls. Loopback (`127.0.0.1:PORT`) is reachable by other in-sandbox processes, so services connect to their middleware.
- **Real credentials already flow in** — the environment-profile pipeline injects a profile's secrets into the session process env; every `exec_sync`/codex child inherits them (`OPENAI_API_KEY`, `DATABASE_URL`, arbitrary app secrets all pass through).

**What it CANNOT do (design around these, don't fight them):**
- ❌ **No Docker / docker-compose / testcontainers** — no container runtime, non-root, gVisor + `RuntimeDefault` seccomp.
- ❌ **No root / `apt` installs** — uid 10001, no write under `/usr`. Middleware = downloaded binaries only.
- ❌ **No sibling-sandbox or k8s spawning from inside** — no SA token, OSB server + RFC1918 blocked. (This is *why* B is control-plane-driven.)
- ❌ **No private/cluster-internal dependency** and **no human port-forward** into the running app (headless only).
- ⚠️ **Tight resources** — 2 CPU / 4Gi shared by engine + codex + services + middleware. Browser E2E and heavy stacks will OOM.

**Must be empirically probed before advertising specific middleware (phase 0):** gVisor syscall compat for pinned `mongod`/`postgres` versions (Redis is safe, Postgres likely, **Mongo unverified**), daemon survival across `exec_sync` calls, and the unquantified ephemeral-disk budget.

**Key fkst-hosted facts the control-plane work builds on:**
- Environment profile today = *install commands* + *non-secret variables* + *write-only secrets*, stored in a ConfigMap/Secret pair (`backend/src/environment_profile.rs`, `k8s/env_store.rs`), REST routes in `routes/environments.rs`, validated in a throwaway holder via `fkst-control-plane validate-env`.
- Profile **env reaches the session**, but the **install step is designed-but-unwired** for the session pre-agent path — `install::run_ordered` has a second, intended call site that `reconcile/execute.rs` currently drops (`install/mod.rs` comments it as "later"). Wiring this is the clean home for deterministic middleware bootstrap (phase 2).
- **Reserved-env policy** (`backend/src/reserved_env.rs`) blocks a profile from setting `FKST_*`, `GITHUB_TOKEN`, `GH_TOKEN`, git-config keys — everything else (LLM keys, DB URLs) passes through.

---

## 4. Components (reuse-first)

### 4.1 Fork — `packages/workflow-qa` (the QA workflow adapter)

A seam-for-seam clone of `packages/workflow-security` on the shared kernel (`workflow.engine.*`). **Reuses** the entire engine; writes only QA-specific glue.

| File | New/Reuse | Purpose |
|---|---|---|
| `fkst.toml` | new | `package.composed`, `persistence_class="saga"`, `lib_deps=[contract, workflow, testkit, forge, devloop]`, `event_deps=[github-proxy]`. **Own-label claim only — never the dev intake candidate seam.** |
| `qa_logic.lua` | new (mold of `security_logic.lua`) | Pure logic: `NAMESPACE="fkst:workflow-qa"`, `LABEL="fkst-qa"`, `WORKFLOW_ID="qa-e2e"`; queues `qa_run_request` / `workflow_qa_tick` / `workflow_qa_materialization_tick`; `decode_results()` (strict JSON), `finding_dedup_key()`, and the **`fkst-dev` issue-create request builder** for failing cases (per D1). Error literals prefixed `workflow-qa: <class>:`. |
| `bindings.lua` | new | Composes the four kernel seams (executor/completion/catalog/platform) via `engine.make_departments`. |
| `executor.lua` | new | `raise_step` idempotent on `child_dedup_key`; final step files findings then writes the "created" marker. |
| `completion.lua` | new (label swap of security's) | Maps child status → `result_ready \| running \| fatal \| …`. |
| `catalog.lua`, `discovery.lua`, `intake.lua` | new (mold) | Own-label discovery of open `fkst-qa` requests; catalog serves the built-in blueprint. |
| `blueprints/qa-e2e.json` | new | The 4-step `fkst.workflow.v1` template (§5). |
| `records.lua` + `prompts/*.md` | new | The 4 generators (≤ 8000B each) + `bootstrap-recipes.md` (probe-pinned middleware versions), discover/propose/results-contract prompts. |
| `departments/{qa_select,qa_materialize_next,dead_letter}/main.lua` | new | ~3-line wrappers over the kernel's lazy `make_departments` closures. |
| `raisers/qa_poll.lua` | new | 30m cron fallback tick (in addition to request-triggered). |
| `tests/{core_test,namespaced_dispatch_conformance_test,fire_raiser_qa_poll_test,run_graph_qa_smoke_test}.lua` | new | The ratchet trio (structural, CI-executed). |
| `conformance/pack.toml`, `README.md` | new | Package conformance + honest scope statement (§1). |

**Reuses (no copy):** `workflow.engine.*` (blueprint, catalog, digest, marker, materialization, frontier, generator, reconcile, departments), `workflow.codex/env/saga/dead_letter`, `github-proxy` issue-create seam, `contract.strings`, `devloop.github_factory`.

### 4.2 fkst-hosted — QA sessions + the QA environment profile

Each item is a **small PR into `develop` with a linked issue** (per fkst-hosted CLAUDE.md). Stay within the user-facing/public-interface scope; **no kernel-engine changes**.

1. **QA environment-profile schema (D4).** Extend the profile DTO/store (`environment_profile.rs`) with structured **middleware entries** `{name, version, source_url?, start_cmd, health_check}` alongside the existing env/secrets/install fields. Keep it additive; annotate with `#[utoipa::path]` + `ToSchema` per the OpenAPI contract; respect `reserved_env`. REST CRUD already exists — extend it.
2. **Wire the pre-agent install step (O2, phase 2).** Carry `install` (+ the new middleware bootstrap commands) through `EnvResolution::Proceed` (`reconcile/execute.rs`), deliver as an `install.json` credential entry (`session_spec/creds.rs`) on both K8s-Secret-mount and OSB-upload paths, and run `install::run_ordered` in `session_pod/driver.rs` **before** supervise. Fail-closed with the `InstallValidationError` shape; verify validation-pod image parity with the sandbox image. (This is the designed-but-dead second call site.)
3. **QA session provisioning + ephemeral teardown (D2).** Recognise the `fkst-qa` work label as a **QA session** that (a) attaches the repo's QA profile, (b) uses the standard 2/4Gi size (D3), and (c) has **no persistent trigger** — it exists only while an `fkst-qa` run request is open, then idles-to-zero (sandbox destroyed). Confirm the reconciler's pending-gate + idle-to-zero already give this once the QA label is registered as its own session; add the minimum wiring (label registration, profile attach, one-shot semantics).
4. **(Optional, phase 2) Frontend CRUD** for QA profiles (env/secret/install/middleware) on the existing REST API + dashboard auth.
5. **(Optional, phase 2) Per-QA-label resource override** (`FKST_OSB_QA_SESSION_*`) once OSB's `resourceLimits` per-session behaviour is verified — only if 2/4Gi proves tight.

### 4.3 The trigger / QA loop (O1)

- **Auto:** when the dev pipeline merges a PR, file an `fkst-qa` run request (a one-line addition in the dev flow, or a control-plane post-merge hook).
- **Manual:** a maintainer files an `fkst-qa` request issue describing the run.
- Either way the request carries (or references) the repo's QA profile name and (optionally) a scoped test-case set.

---

## 5. The E2E flow (the `qa-e2e` blueprint)

Four ordered slots. Steps 1–2 are read-only judgment; step 3 is one **unrestricted** codex step that does all shell work; step 4 is deterministic Lua.

1. **discover-stack** *(read-only codex)* — read the checkout (`package.json`, `Makefile`, `docker-compose.yml` as a *manifest to read, not run*, README, CI) → emit a strict-JSON manifest: services, how each boots, required middleware + versions, required env/secrets, and the app's health endpoints.
2. **propose-test-cases** *(read-only codex)* — from the manifest + repo, emit the ordered list of **proposed E2E test cases** (name, steps, expected result). ("Proposed test cases" = codex-generated from the app's routes/contracts + any existing test specs in the repo.)
3. **bootstrap-and-run** *(one unrestricted codex step — deliberately one step to sidestep the unverified cross-step daemon-persistence question)*:
   - Download the pinned middleware binaries over public HTTPS to `$HOME`; `nohup`-start them on `127.0.0.1`; health-poll.
   - Synthesize temp creds; read **real** creds from the process env (injected by the QA profile).
   - Boot the owner services (per the manifest) on loopback; health-poll.
   - Execute every proposed test case; capture pass/fail + logs.
   - Emit a strict-JSON **results** document.
4. **file-results** *(deterministic Lua — the `security_logic` mold)* — strictly decode the results JSON; for each **failing** case, file a **dedup-idempotent `fkst-dev` issue** via the `github-proxy` issue-create seam (per D1); post a run-summary comment. No double-run / double-file on re-reconcile (the kernel's CAS keys guarantee this).

---

## 6. Phasing

- **Phase 0 — capability probe** *(throwaway, ships first, runs in a live QA sandbox).* A one-off `fkst-qa` dry-run whose single unrestricted codex step boots pinned `redis`/portable-`postgres`/`mongod` under gVisor as uid 10001, tests `nohup`-daemon survival, measures usable ephemeral disk, and posts a strict-JSON **capability matrix**. Gates which middleware the real blueprint advertises. *(No code to merge — a prompt + a trigger issue.)*
- **Phase 1 — the package + QA sessions** *(fork package, zero-behaviour-change reuse of the kernel; + the fkst-hosted QA-session + profile-schema wiring).* Delivers headless E2E for docker-free, public-dependency projects with one lightweight datastore, in one ~60-min codex step, in an isolated throwaway sandbox. Middleware via codex download (O2 phase-1).
- **Phase 2 — deterministic bootstrap + polish.** Wire the pre-agent install step (O2), optional frontend CRUD, optional per-QA-label resource override.
- **Phase 3 — deferred until demand proves them.** Multi-step blueprints with persistent daemons (only if the probe proved cross-step survival), curated middleware baked into the sandbox image, per-repo default QA profiles.

---

## 7. Open decisions (resolve at build time)

- **O1 — trigger:** *recommend* auto-on-merge **and** manual `fkst-qa` request. Auto gives a real CI loop; manual gives control.
- **O2 — middleware delivery:** *recommend* codex download (phase 1) → wire the install step (phase 2) as the primary, keep download as fallback for unlisted middleware. Defer image-baking unless download flakiness proves material.
- **Mongo support:** blocked on the phase-0 probe. If `mongod` fails under gVisor, the profile advertises Redis + Postgres only, and Mongo-dependent projects are out-of-scope until image-baking.

---

## 8. Definition of Done

**Phase 1 (package, this fork):**
- [ ] `packages/workflow-qa` complete per §4.1; `scripts/check_repo.py` → exit 0 (structural ratchet green).
- [ ] Own-label claim only — no consumption of the dev intake candidate seam (INTAKE_POLICY_SET intact).
- [ ] Failing cases file `fkst-dev` issues, dedup-idempotent, no double-file on re-reconcile.
- [ ] Ratchet test trio present (`fire_raiser`, `run_graph`/coverage, namespaced-dispatch); CI (`scripts/run.sh test`) green after PR.
- [ ] README states the honest scope (headless, binary-bootstrappable, public deps, ≤4Gi, no Docker).

**Phase 1 (fkst-hosted):**
- [ ] QA environment-profile schema extended (env+secrets+install+middleware) with `#[utoipa::path]`+`ToSchema`; `tests/openapi.rs` green.
- [ ] `fkst-qa`-labelled work provisions a **separate** session with its own sandbox + attached QA profile, and **idles-to-zero (sandbox destroyed)** when the run request closes.
- [ ] `cargo fmt`/`clippy`/`test` + docker build + gitleaks green; each change a small PR into `develop` with a linked issue; no `Co-Authored-By`.

**Acceptance (live):** a real `fkst-qa` run against a small known-good owner project with a creds-bearing QA profile boots middleware + services in an isolated sandbox, runs the proposed cases, files a real failing case as a `fkst-dev` issue, and the QA sandbox is destroyed afterward — with the main dev session untouched throughout.

---

*Feasibility grounding and the pragmatic-vs-ambitious design study this spec converges from: `docs/specs/workflow-qa/DESIGN.md`.*
