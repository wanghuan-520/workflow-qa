import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

const host = "127.0.0.1";
const port = Number(process.env.PORT || 43190);
const chromePath =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rootDir = dirname(fileURLToPath(import.meta.url));
const artifactDir = join(rootDir, "artifacts");
const runs = new Map();

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendFixture(response) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>FKST Browser QA Fixture</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #f5f7f8; color: #17242b; }
      main { max-width: 680px; margin: 12vh auto; padding: 32px; background: white; border: 1px solid #cfd8dc; border-radius: 8px; }
      button { min-height: 42px; padding: 0 18px; border: 0; border-radius: 6px; background: #176f65; color: white; font-weight: 700; cursor: pointer; }
      #status { margin-top: 24px; padding: 14px; border-left: 4px solid #78909c; background: #edf1f2; }
      body[data-state="passed"] #status { border-color: #2e7d32; background: #e8f5e9; }
    </style>
  </head>
  <body data-state="ready">
    <main>
      <h1>FKST Local Browser Test</h1>
      <p>This page is served only on loopback for the NyxID Node POC.</p>
      <button id="run-check" type="button">Run browser assertion</button>
      <div id="status" role="status">Ready</div>
    </main>
    <script>
      document.querySelector("#run-check").addEventListener("click", () => {
        document.body.dataset.state = "passed";
        document.querySelector("#status").textContent = "Browser QA Passed";
      });
    </script>
  </body>
</html>`);
}

async function executeBrowserRun(runId) {
  const run = runs.get(runId);
  run.status = "running";
  run.started_at = new Date().toISOString();

  let browser;
  try {
    await mkdir(artifactDir, { recursive: true });
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-first-run", "--no-default-browser-check"],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const fixtureUrl = `http://${host}:${port}/fixture`;

    await page.goto(fixtureUrl, { waitUntil: "networkidle", timeout: 15_000 });
    const title = await page.title();
    if (title !== "FKST Browser QA Fixture") {
      throw new Error(`Unexpected page title: ${title}`);
    }

    await page.locator("#run-check").click();
    await page.locator("#status").waitFor({ state: "visible", timeout: 5_000 });
    const statusText = (await page.locator("#status").textContent())?.trim();
    const pageState = await page.locator("body").getAttribute("data-state");
    if (statusText !== "Browser QA Passed" || pageState !== "passed") {
      throw new Error(`Assertion failed: status=${statusText}, state=${pageState}`);
    }

    const screenshotPath = join(artifactDir, `${runId}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await context.close();

    Object.assign(run, {
      status: "completed",
      completed_at: new Date().toISOString(),
      result: {
        passed: true,
        browser: "Google Chrome via playwright-core",
        page_title: title,
        final_status: statusText,
        final_state: pageState,
        target_url: fixtureUrl,
        screenshot_path: screenshotPath,
      },
    });
  } catch (error) {
    Object.assign(run, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await browser?.close().catch(() => {});
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "fkst-nyxid-browser-loop-poc",
      browser: chromePath,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/fixture") {
    sendFixture(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/runs") {
    const runId = `qa_${randomUUID()}`;
    const run = {
      run_id: runId,
      status: "accepted",
      created_at: new Date().toISOString(),
    };
    runs.set(runId, run);
    sendJson(response, 202, run);
    setImmediate(() => executeBrowserRun(runId));
    return;
  }

  const match = request.method === "GET" && url.pathname.match(/^\/v1\/runs\/(qa_[a-f0-9-]+)$/);
  if (match) {
    const run = runs.get(match[1]);
    if (!run) {
      sendJson(response, 404, { error: "run_not_found" });
      return;
    }
    sendJson(response, 200, run);
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, host, () => {
  console.log(`FKST NyxID browser POC listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
