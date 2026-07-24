# NyxID Node → 本地 Google Chrome 最小闭环验证

> 验证日期：2026-07-24  
> 验证结论：**PASS**  
> 验证范围：NyxID Cloud → Node Proxy → Local Runtime → Google Chrome → 结果回传

## 1. 验证目标

本次验证不是一次性实现完整 FKST QA，而是验证当前架构中最关键、最不确定的一段：

> 云端请求能否通过 NyxID Node 到达用户电脑，并让本地程序启动真实 Google Chrome 完成自动化测试，再把结果沿原路返回。

## 2. 实际测试链路

```text
nyxid proxy request
    ↓
NyxID Cloud
    ↓
NyxID Node v0.8.0
    ↓
Node Proxy
    ↓
用户电脑 http://127.0.0.1:43190
    ↓
Browser QA Runtime
    ↓
系统 Google Chrome（playwright-core）
    ↓
本地测试页面
    ↓
点击 + DOM 断言 + 截图
    ↓
结构化 Run Result
    ↓
NyxID Node
    ↓
调用方
```

本次有效验证未使用 NyxID Oracle、IDE 或 ego-browser。浏览器由 Browser QA Runtime 通过 `playwright-core` 启动并控制系统 Google Chrome。

## 3. 测试环境

```text
操作系统：macOS
NyxID CLI：v0.8.0
Node profile：fkst-qa-poc
Node ID：39d9b872-822f-43ae-b03d-97140816186f
Node 状态：online / dispatchable
Runtime 地址：http://127.0.0.1:43190
浏览器：系统 Google Chrome
浏览器驱动：playwright-core
```

Runtime 源码：[server.mjs](server.mjs)

## 4. Runtime 接口

```text
GET  /health
GET  /fixture
POST /v1/runs
GET  /v1/runs/{run_id}
```

`POST /v1/runs` 立即返回 `accepted` 和 `run_id`，浏览器测试在后台执行；调用方通过 `GET /v1/runs/{run_id}` 轮询终态。

## 5. NyxID 临时服务

```text
Service slug：fkst-browser-poc-20260724
Endpoint：http://127.0.0.1:43190
Node ID：39d9b872-822f-43ae-b03d-97140816186f
Auth method：none（仅用于 POC）
```

## 6. 实际执行步骤

1. 升级 NyxID CLI，并恢复浏览器登录。
2. 创建隔离的 `fkst-qa-poc` Node profile，并确认 Cloud 侧显示 `online`。
3. 启动只监听 `127.0.0.1:43190` 的 Browser QA Runtime。
4. 创建绑定该 Node 的 NyxID custom service。
5. 通过 `nyxid proxy request` 调用 `/health`。
6. 通过 NyxID Proxy 调用 `POST /v1/runs`。
7. Runtime 启动系统 Google Chrome。
8. Chrome 打开本地 `/fixture` 页面。
9. 验证页面标题。
10. Chrome 真实点击 `Run browser assertion`。
11. 断言状态文本和 `body[data-state]`。
12. 保存截图并关闭浏览器。
13. 通过同一 NyxID Node Proxy 查询并返回结构化结果。

## 7. 已验证 Run

```text
run_id：qa_64ee74e9-1c4d-45c6-b6e2-516dff9a9b37
status：completed
page title：FKST Browser QA Fixture
final status：Browser QA Passed
final state：passed
screenshot：artifacts/qa_64ee74e9-1c4d-45c6-b6e2-516dff9a9b37.png
```

结构化结果：

```json
{
  "run_id": "qa_64ee74e9-1c4d-45c6-b6e2-516dff9a9b37",
  "status": "completed",
  "result": {
    "passed": true,
    "browser": "Google Chrome via playwright-core",
    "page_title": "FKST Browser QA Fixture",
    "final_status": "Browser QA Passed",
    "final_state": "passed",
    "target_url": "http://127.0.0.1:43190/fixture"
  }
}
```

截图证据：[查看 Google Chrome 测试截图](artifacts/qa_64ee74e9-1c4d-45c6-b6e2-516dff9a9b37.png)

## 8. Node 侧证据

```text
total_requests：5
success_count：4
error_count：1
success_rate：80%
last_success_at：2026-07-24T07:28:02Z
```

其中一次错误发生在初始路由配置阶段，不是浏览器测试失败。

## 9. 重要发现

临时 custom service 使用了 `auth_method=none`，但当前 Node Agent 仍要求本地 credential store 中存在与 service slug 对应的路由条目。

缺少该条目时：

```text
HTTP 502 Bad Gateway
Node credential missing
```

添加 loopback 路由条目后，健康检查、创建 Run 和查询结果全部成功。

生产实现应：

1. 为 Local QA Runtime 配置真正的本地认证凭据，由 Node 在本地注入；或者
2. 在 NyxID 中明确并修正 `auth_method=none` 的 node-routed service 行为。

## 10. 本次验证已经证明

- NyxID Node 可以接收 Cloud Proxy 请求并到达 loopback-only Local QA Runtime。
- 用户电脑不需要开放公网入站端口。
- Local QA Runtime 可以无 IDE 地启动并控制系统 Google Chrome。
- Chrome 可以执行真实点击、验证页面状态并保存截图。
- Runtime 可以采用异步 `POST /v1/runs + GET /v1/runs/{id}` 协议。
- 结构化 Pass/Fail 可以通过 NyxID Node Proxy 返回。
- 该路径不依赖 NyxID Oracle。

## 11. 本次验证尚未证明

- NyxID Node 在 Runtime 未运行时自动安装或启动 Runtime。
- Environment Factory 启动独立 Middleware 或真实产品 App。
- NyxID 用户批准和 scoped one-time QA Grant。
- PQL 驱动的 Structured Plan。
- Codex CLI 自动执行。
- Artifact 上传、质量裁决和 GitHub 发布。

因此，本次验证能够支持的准确结论是：

> `NyxID Cloud → NyxID Node → 已运行的 Local QA Runtime → Google Chrome → 浏览器断言 → 结果回传` 已经真实跑通。

## 12. 清理状态

验证结束后已删除或停止：

- 临时 NyxID custom service。
- 临时 Node routing credential。
- `fkst-qa-poc` profile-aware Node daemon。
- 临时 Cloud Node 记录。
- Local Browser QA Runtime。
- 本地 `43190` 监听端口。

保留内容：

- POC 源码。
- `package-lock.json`。
- 本验证文档。
- Google Chrome 结果截图。

下一步应把 Runtime 自带 fixture 替换为由 Environment Factory 临时启动的独立 App，完成：

```text
NyxID
→ Local QA Runtime
→ 启动 App / Middleware
→ Readiness
→ Google Chrome 测试
→ Cleanup
→ 结果回传
```
