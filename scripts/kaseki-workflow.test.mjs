import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  submitKasekiRun,
  validateKasekiBaseUrl,
  verifyKasekiController,
  waitForKasekiRun,
} from "./kaseki-workflow.mjs";

const baseUrl = "https://kaseki-tunnel.scheimann.xyz";
const token = "test-token";
const runId = "run_123";

const dryWorkflow = readFileSync(
  new URL("../.github/workflows/kaseki-dry.yaml", import.meta.url),
  "utf8",
);
const docsWorkflow = readFileSync(
  new URL("../.github/workflows/kaseki-docs.yaml", import.meta.url),
  "utf8",
);
const ciWorkflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("accepts only the approved Kaseki controller URL", () => {
  assert.equal(validateKasekiBaseUrl(baseUrl), baseUrl);
  assert.throws(() =>
    validateKasekiBaseUrl("http://kaseki-tunnel.scheimann.xyz"),
  );
  assert.throws(() => validateKasekiBaseUrl("https://other.example"));
  assert.throws(() => validateKasekiBaseUrl(`${baseUrl}/`));
});

test("keeps both Kaseki workflows on main and pins the DRY run to its commit", () => {
  for (const workflow of [dryWorkflow, docsWorkflow]) {
    assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  }
  assert.match(dryWorkflow, /REF: \$\{\{ github\.sha \}\}/);
  assert.match(dryWorkflow, /runs-on: ubuntu-24\.04/);
});

test("pins the Kaseki health action to a commit in upstream main history", () => {
  const action =
    "CyanAutomation/kaseki-agent/.github/actions/verify-controller-health@0400e036f8bd03d3c6a8ad1dd68ee74d85ac0aa6";

  for (const workflow of [dryWorkflow, docsWorkflow]) {
    assert.ok(workflow.includes(action));
  }
});

test("routes both Kaseki workflows through the shared API and poll helper", () => {
  for (const workflow of [dryWorkflow, docsWorkflow]) {
    assert.match(workflow, /node scripts\/kaseki-workflow\.mjs preflight/);
    assert.match(workflow, /node scripts\/kaseki-workflow\.mjs submit/);
    assert.match(workflow, /node scripts\/kaseki-workflow\.mjs wait/);
  }
});

test("runs zizmor in CI and disables persisted checkout credentials", () => {
  assert.match(
    ciWorkflow,
    /zizmorcore\/zizmor-action@cc914d7f3750a2d13d75c7f184a1060aa0e9d482/,
  );
  assert.match(ciWorkflow, /advanced-security: false/);
  assert.equal((ciWorkflow.match(/uses: actions\/checkout@/g) ?? []).length, 4);
  assert.equal(
    (ciWorkflow.match(/persist-credentials: false/g) ?? []).length,
    4,
  );
});

test("checks readiness before authenticated gateway connectivity", async () => {
  const requests = [];
  const responses = [
    jsonResponse({ status: "ready" }),
    jsonResponse({ status: "ok" }),
  ];

  await verifyKasekiController({
    baseUrl,
    token,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return responses.shift();
    },
  });

  assert.equal(requests[0].url, `${baseUrl}/ready`);
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[1].url, `${baseUrl}/api/gateway-test?stage=1`);
  assert.equal(requests[1].options.headers.Authorization, `Bearer ${token}`);
});

test("stops preflight when readiness is not ready", async () => {
  let requests = 0;

  await assert.rejects(
    verifyKasekiController({
      baseUrl,
      token,
      fetchImpl: async () => {
        requests += 1;
        return jsonResponse({ status: "starting" });
      },
    }),
    /readiness check failed/,
  );
  assert.equal(requests, 1);
});

test("submits JSON and validates the returned run ID", async () => {
  const payload = { ref: "abc123", idempotencyKey: "stable-key" };
  let request;

  const submittedRunId = await submitKasekiRun({
    baseUrl,
    token,
    payload,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({ id: runId });
    },
  });

  assert.equal(submittedRunId, runId);
  assert.equal(request.url, `${baseUrl}/api/runs`);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(request.options.body), payload);
});

test("rejects unsafe run IDs before using them in a URL", async () => {
  let requests = 0;
  await assert.rejects(
    waitForKasekiRun({
      baseUrl,
      token,
      runId: "../other",
      fetchImpl: async () => {
        requests += 1;
        return jsonResponse({ status: "completed" });
      },
    }),
    /invalid Kaseki run ID/,
  );
  assert.equal(requests, 0);
});

test("waits through running states and accepts a successful completion", async () => {
  const states = ["queued", "running", "completed"];
  const delays = [];
  let now = 0;

  const result = await waitForKasekiRun({
    baseUrl,
    token,
    runId,
    fetchImpl: async () => jsonResponse({ status: states.shift() }),
    now: () => now,
    sleep: async (duration) => {
      delays.push(duration);
      now += duration;
    },
    pollIntervalMs: 60,
    maxWaitMs: 180,
  });

  assert.deepEqual(result, { status: "completed", success: true, exitCode: 0 });
  assert.deepEqual(delays, [60, 60]);
});

test("reports task failures and nonzero completion codes", async (t) => {
  const cases = [
    [{ status: "completed", exitCode: 7 }, "failed (exit code 7)"],
    [{ status: "failed" }, "failed"],
    [{ status: "cancelled" }, "cancelled"],
  ];

  for (const [response, expectedStatus] of cases) {
    await t.test(expectedStatus, async () => {
      const result = await waitForKasekiRun({
        baseUrl,
        token,
        runId,
        fetchImpl: async () => jsonResponse(response),
      });
      assert.equal(result.status, expectedStatus);
      assert.equal(result.success, false);
    });
  }
});

test("uses a deadline and shortens the final sleep to the remaining time", async () => {
  let now = 0;
  const delays = [];

  const result = await waitForKasekiRun({
    baseUrl,
    token,
    runId,
    fetchImpl: async () => jsonResponse({ status: "running" }),
    now: () => now,
    sleep: async (duration) => {
      delays.push(duration);
      now += duration;
    },
    pollIntervalMs: 60,
    maxWaitMs: 125,
  });

  assert.deepEqual(result, { status: "timed out", success: false });
  assert.deepEqual(delays, [60, 60, 5]);
});

test("retries transient HTTP failures before polling again", async () => {
  let requests = 0;
  let now = 0;
  const delays = [];

  const result = await waitForKasekiRun({
    baseUrl,
    token,
    runId,
    fetchImpl: async () => {
      requests += 1;
      if (requests === 1) return jsonResponse({ error: "temporary" }, 503);
      return jsonResponse({ status: "completed" });
    },
    now: () => now,
    sleep: async (duration) => {
      delays.push(duration);
      now += duration;
    },
    maxWaitMs: 10_000,
  });

  assert.equal(result.success, true);
  assert.equal(requests, 2);
  assert.deepEqual(delays, [1_000]);
});

test("rejects unexpected remote run states", async () => {
  await assert.rejects(
    waitForKasekiRun({
      baseUrl,
      token,
      runId,
      fetchImpl: async () => jsonResponse({ status: "unknown" }),
    }),
    /unexpected Kaseki run status/,
  );
});
