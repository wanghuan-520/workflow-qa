# NyxID Node to local browser POC

This POC proves the narrow vertical path:

```text
NyxID Proxy -> NyxID Node -> loopback HTTP runtime -> Google Chrome -> assertion result
```

The PoC service is intentionally restricted to its own loopback fixture page. It does not accept an arbitrary URL or shell command.

## Non-production limits

This is not the production Local QA Agent or the future Hardened Runtime. It has no request authentication, strict body schema, signed authorization, nonce/replay protection, durable idempotency, cancellation, SQLite journal, source checkout, container/Compose environment, readiness orchestration, generic test runner, artifact upload, cloud report composition, resource limits, or compensating resource cleanup.

Run state exists only in an in-memory `Map`. The returned screenshot value is a local absolute path; the screenshot bytes are not sent through NyxID or uploaded to cloud storage.

## Local run

```bash
npm install
npm start
```

Endpoints:

```text
GET  /health
GET  /fixture
POST /v1/runs
GET  /v1/runs/{run_id}
```

Successful runs save a screenshot under `artifacts/`.

See `RESULT.md` for the verified NyxID Node round trip and its scope.
