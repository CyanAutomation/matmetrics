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

test("keeps both Kaseki workflows on main and uses a normal PR publish mode", () => {
  for (const workflow of [dryWorkflow, docsWorkflow]) {
    assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /REF: main/);
  }
  assert.match(dryWorkflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(dryWorkflow, /runs-on: ubuntu-24\.04/);
  for (const workflow of [dryWorkflow, docsWorkflow]) {
    assert.match(workflow, /publishMode: "pr"/);
    assert.doesNotMatch(workflow, /publishMode: "draft_pr"/);
  }
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
  assert.equal((ciWorkflow.match(/uses: actions\/checkout@/g) ?? []).length, 5);
  assert.equal(
    (ciWorkflow.match(/persist-credentials: false/g) ?? []).length,
    5,
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
  assert.equal(requests[1].url, `${baseUrl}/api/v1/gateway-test?stage=1`);
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
  const idempotencyKey = "123e4567-e89b-42d3-a456-426614174000";
  const payload = { ref: "abc123", idempotencyKey };
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
  assert.equal(request.url, `${baseUrl}/api/v1/runs`);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, `Bearer ${token}`);
  assert.equal(request.options.headers["Idempotency-Key"], idempotencyKey);
  assert.deepEqual(JSON.parse(request.options.body), payload);
});

test("rejects a non-v4 idempotency key before making a request", async () => {
  let requests = 0;

  await assert.rejects(
    submitKasekiRun({
      baseUrl,
      token,
      payload: { idempotencyKey: "123e4567-e89b-52d3-a456-426614174000" },
      fetchImpl: async () => {
        requests += 1;
        return jsonResponse({ id: runId });
      },
    }),
    /Kaseki idempotencyKey must be a UUID v4/,
  );

  assert.equal(requests, 0);
});

test("fails once on a permanent HTTP error and reports bounded problem details", async () => {
  let requests = 0;
  let sleeps = 0;

  await assert.rejects(
    submitKasekiRun({
      baseUrl,
      token,
      payload: {
        repoUrl: "https://github.com/example/repo",
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
      },
      fetchImpl: async () => {
        requests += 1;
        return new Response(
          JSON.stringify({
            title: "Bad Request",
            detail: "publishMode must be pr",
            requestId: "request-123",
            privateDiagnostic: "must not be logged",
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/problem+json",
              "x-request-id": "request-123",
            },
          },
        );
      },
      sleep: async () => {
        sleeps += 1;
      },
    }),
    (error) => {
      assert.match(error.message, /HTTP 400.*publishMode must be pr.*request-123/);
      assert.doesNotMatch(error.message, /must not be logged/);
      return true;
    },
  );

  assert.equal(requests, 1);
  assert.equal(sleeps, 0);
});

test("reuses the UUIDv4 idempotency key across transient submission retries", async () => {
  const idempotencyKey = "123e4567-e89b-42d3-a456-426614174000";
  const requests = [];

  const submittedRunId = await submitKasekiRun({
    baseUrl,
    token,
    payload: {
      repoUrl: "https://github.com/example/repo",
      idempotencyKey,
    },
    fetchImpl: async (_url, options) => {
      requests.push(options);
      if (requests.length === 1) {
        return jsonResponse({ title: "Unavailable", detail: "Retry" }, 503);
      }
      return jsonResponse({ id: runId });
    },
    sleep: async () => {},
  });

  assert.equal(submittedRunId, runId);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers["Idempotency-Key"], idempotencyKey);
  assert.equal(requests[1].headers["Idempotency-Key"], idempotencyKey);
  assert.equal(requests[0].body, requests[1].body);
});

test("preserves the final transient HTTP diagnostic after exhausting retries", async () => {
  let requests = 0;
  const delays = [];

  await assert.rejects(
    submitKasekiRun({
      baseUrl,
      token,
      payload: {
        repoUrl: "https://github.com/example/repo",
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
      },
      fetchImpl: async () => {
        requests += 1;
        return new Response(
          JSON.stringify({ title: "Unavailable", detail: "Queue is offline" }),
          {
            status: 503,
            headers: { "content-type": "application/problem+json" },
          },
        );
      },
      sleep: async (duration) => {
        delays.push(duration);
      },
    }),
    /failed after 4 attempts.*HTTP 503.*Queue is offline/,
  );

  assert.equal(requests, 4);
  assert.deepEqual(delays, [1_000, 2_000, 4_000]);
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
