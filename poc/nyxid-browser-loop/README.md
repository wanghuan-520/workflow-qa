# NyxID Node to local browser POC

This POC proves the narrow vertical path:

```text
NyxID Proxy -> NyxID Node -> loopback HTTP runtime -> Google Chrome -> assertion result
```

The runtime is intentionally restricted to its own loopback fixture page. It does not accept an arbitrary URL or shell command.

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
