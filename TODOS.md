# Deferred Work and Delivery Backlog

## MVP A0-A3

> Track: `local_qa_agent_mvp`.
> These items are the current implementation path. A0 blocks A1-A3. The first release is Browser-only, one active execution Run per device, no Secret refs, and screenshot + bounded JSON evidence.
> The audited implementation currently lives under `apps/local-qa-runtime`; renaming that directory to `apps/local-qa-host` requires a separate migration PR and is not part of these MVP work items.

### MVP-A0: Normative contract and failpoint corpus

- **What:** Implement the machine-verifiable MVP contract, shared contract fixtures, transition/error matrix, and deterministic failpoint corpus.
- **Why:** The MVP design cannot be implemented consistently while wire/state/error semantics remain prose-only.
- **Owner:** `packages/qa-contracts` plus `fixtures/` and the Local QA Host contract test owner.
- **Depends on / blocked by:** MVP profile/scope freeze only; blocks MVP-A1, MVP-A2, and MVP-A3.
- **Affected contract:** `local-qa-host-mvp-design.zh-CN.md` 第 2 节、`fixtures/local-qa-host-mvp-contract-v1.json`、`fixtures/local-qa-host-mvp-failpoint-matrix-v1.json`.
- **Acceptance / exit:** valid, duplicate, conflict, expired, wrong-binding, Hardened-profile, malformed, cursor, upload-expiry, and all symbolic failpoint cases have deterministic expected mutations, errors, outcomes, and side-effect assertions.

### MVP-A1: Signed installer, pairing, admission, and Browser skeleton

- **What:** Deliver the signed user-level Host artifact, explicit Node pairing, local credential lifecycle, Journal admission, single-active gate, and Browser walking skeleton.
- **Why:** The POC assumes a manually started and manually credentialed service; MVP needs a real install and authenticated entry path.
- **Owner:** `apps/local-qa-runtime` installation/ingress/Journaling owners and macOS release CI.
- **Depends on / blocked by:** MVP-A0 and the target workspace/macOS build scaffold.
- **Affected contract:** authorization, transport mapping, acceptance transaction, Snapshot/Event, single-active Run, Browser capability.
- **Acceptance / exit:** signed install/update/rollback/uninstall smoke, explicit pairing/rotation/revoke/reset, offline/wrong-binding fail-closed behavior, atomic acceptance, duplicate submit suppression, one active execution Run, isolated Chrome Profile, and restart admission gate.

### MVP-A2: Source, Environment Profile, Browser runner, and reconcile

- **What:** Add Hosted immutable Source Object acquisition, versioned Environment Profile digest, controlled Compose/readiness, Browser runner adapter, stable-key ownership, cancel/timeout, and restart reconcile.
- **Why:** The POC has no Source, Compose, readiness, or resource lifecycle; the MVP must execute a reproducible approved target without leaking resources.
- **Owner:** `apps/local-qa-runtime/environment`, `apps/local-qa-runtime/browser`, and `apps/local-qa-runtime/reconcile` with Testing Packages adapter owners.
- **Depends on / blocked by:** MVP-A0 and MVP-A1.
- **Affected contract:** SourceObject, EnvironmentProfile, OwnedHandle, ReadinessReceipt, CaseResult projection, CleanupReceipt, residual classifications.
- **Acceptance / exit:** Source and environment digest validation before effects, controlled Compose readiness, Browser pass/failure/crash/timeout/cancel/Host-kill cleanup, stable-key recovery after uncertain create, no guessed deletion, and no automatic Case rerun after restart.

### MVP-A3: Bounded Evidence, upload reconcile, and report handoff

- **What:** Add screenshot + bounded JSON Evidence, raw quarantine, safe projection, redaction/canary validation, cleanup-before-upload, per-object upload, lost-ack reconcile, terminal continuation, and explicit expiry outcomes.
- **Why:** The MVP needs reviewable evidence without making unprovable claims about raw DOM, traces, headers, downloads, or Secret handling.
- **Owner:** `apps/local-qa-runtime/evidence`, `apps/local-qa-runtime/upload`, and Hosted Artifact/Report adapter owners.
- **Depends on / blocked by:** MVP-A0, MVP-A1, and MVP-A2.
- **Affected contract:** EvidenceStagingManifest, RedactionReceipt, ArtifactUploadReceipt, versioned upload outcome continuation, local `upload_expired`, and Hosted-owned `report_impossible` projection.
- **Acceptance / exit:** only validated screenshot/bounded JSON uploads, no raw/Secret output, cleanup before cloud wait, stable key/digest upload reconciliation, local terminal during Hosted outage, explicit TTL/report failure closure, and no local authority to derive `report_impossible`.

## Hardened Future Track

> Track: `hardened_untrusted_code`.
> These items are intentionally not MVP blockers. They require their own normative contract, platform feasibility gates, and R0-R3 implementation sequence.

### TODO-1: Hardened R1 cleanup authority

- **What:** Move the minimum cancel, terminate, reconcile, seal, cleanup, and blocking-residual path before the first Hardened untrusted execution.
- **Why:** The current R1 plan can execute untrusted code before crash recovery has a complete cleanup authority path, so VM, port, browser, or Secret lease residuals may remain indefinitely.
- **Owner:** Hardened Runtime Supervisor/adapter owners.
- **Pros:** Prevents the R1/R2 ordering blocker and makes the first Hardened release converge after a Runtime or VM crash.
- **Cons:** Adds a cleanup-only capability subset to R1 and requires a clear boundary with full Recovery Resume in R2.
- **Context:** Start from the [Runtime R0-R3 implementation plan](hardened-local-qa-runtime-design.zh-CN.md#30-runtime-r0-r3-%E5%AE%9E%E6%96%BD%E8%AE%A1%E5%88%92%E6%98%A0%E5%B0%84%E7%B3%BB%E7%BB%9F-m0-m5), especially R1, then reconcile it with [Startup Recovery](hardened-local-qa-runtime-design.zh-CN.md#24-startup-recovery).
- **Depends on / blocked by:** Hardened platform feasibility Step 0, normative domain contract, inventory model, and adapter ownership rules.

### TODO-2: Complete Hardened R0 backlog

- **What:** Add and sequence Hardened R0 issues for normative domain contracts, atomic command admission/outbox, inventory/CleanupCapability, production adapter conformance, and real Ledger failpoint integration.
- **Why:** The current `r0-a-1`, `r0-a-2`, and `r0-a-3` drafts explicitly exclude the domain and production integration needed by `R0-CONTRACT-LEDGER`.
- **Owner:** Hardened Runtime contract, Ledger, and test-infrastructure owners.
- **Pros:** Prevents foundational PRs from being mistaken for a passing R0 and gives each missing authority a clear owner.
- **Cons:** Expands the Hardened backlog and requires convergence after the currently independent foundation lanes.
- **Context:** Mark the existing drafts as `profile=hardened_untrusted_code`, `milestone=H-R0`, `not_mvp=true`, `mvp_blocking=false`.
- **Depends on / blocked by:** Final canonical digest contract, Hardened normative contract, and workspace scaffold.

### TODO-3: Freeze cross-language JCS and digest contract

- **What:** Specify hash algorithm, domain-separation tag, digest encoding, version envelope, accepted number domain, duplicate-key rejection, Unicode rules, and bounded SafeErrorDetails; publish shared golden vectors.
- **Why:** Rust and TypeScript can otherwise produce different accepted input sets or authoritative digest references while both pass local tests.
- **Owner:** Shared contract owners across the MVP and Hardened tracks.
- **Pros:** Makes signatures, idempotency, and future authorization bindings stable across languages and releases.
- **Cons:** Requires deciding which canonical primitives are shared by MVP and which remain Hardened-only.
- **Context:** Start from the tracked [RFC 8785/JCS fixture](fixtures/rfc8785-v1.json) and [Talos canonicalization boundary](design-proposals/talos-bounded-testing-tool-architecture.zh-CN.md#61-canonicalization); keep Hardened Grant/Effect fields out of the MVP contract.
- **Depends on / blocked by:** MVP normative contract boundary and selected Rust/TypeScript package locations.

### TODO-4: Add API and CLI testing backends

- **What:** Add API and CLI backend capabilities after the Browser-only release, reusing the shared Testing Packages Adapter and CaseResult contract.
- **Why:** The first release is intentionally Browser-only, but the product direction still includes API and CLI testing.
- **Owner:** Testing Packages backend owners with Host adapter owners.
- **Pros:** Preserves the broader product goal without putting three backend implementations into the first vertical slice.
- **Cons:** Requires new process, HTTP, argv, environment, timeout, and result-normalization contracts.
- **Context:** Do not move these back into A2 until the Browser vertical slice passes admission, cancel, restart, reconcile, cleanup, and evidence gates.
- **Depends on / blocked by:** Browser MVP exit gate, shared CaseResult contract, and backend capability design.

### TODO-5: Expand Evidence and Hosted reports

- **What:** Add DOM, trace, network/download metadata, QualityEvaluation, and multi-format JSON/HTML/Markdown/Narrative reports as a later Hosted track.
- **Why:** The first release is limited to controlled screenshots and bounded JSON so redaction and retention are actually provable.
- **Owner:** Hosted Artifact/Report and Testing Packages artifact owners.
- **Pros:** Restores richer diagnostics and report presentation without weakening the first release's data boundary.
- **Cons:** Each media type needs its own redaction, size, retention, digest, and failure contract.
- **Context:** Keep raw observation local and bounded; never let this work reassign LocalQARunState or execution cleanup authority from the Host.
- **Depends on / blocked by:** MVP terminal/upload contract, Artifact authority, and per-media redaction design.
