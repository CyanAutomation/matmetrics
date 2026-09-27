import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createKasekiIdempotencyKey,
  createUuidV5,
} from "./kaseki-idempotency-key.mjs";

const run = {
  repository: "CyanAutomation/matmetrics",
  workflow: "Kaseki Docs Sweep",
  runId: "123456789",
};

test("creates a stable UUIDv5 for the same GitHub Actions run", () => {
  const first = createKasekiIdempotencyKey(run);
  const second = createKasekiIdempotencyKey(run);

  assert.equal(first, second);
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("matches the RFC UUIDv5 example for www.example.com", () => {
  assert.equal(
    createUuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com"),
    "2ed6657d-e927-568b-95e1-2665a8aea6a2",
  );
});

test("creates different keys for different workflows and run IDs", () => {
  const docsKey = createKasekiIdempotencyKey(run);
  const dryKey = createKasekiIdempotencyKey({
    ...run,
    workflow: "Kaseki DRY Sweep",
  });
  const nextRunKey = createKasekiIdempotencyKey({ ...run, runId: "123456790" });

  assert.notEqual(docsKey, dryKey);
  assert.notEqual(docsKey, nextRunKey);
});

test("requires the repository, workflow, and run ID", () => {
  assert.throws(
    () =>
      createKasekiIdempotencyKey({ repository: "CyanAutomation/matmetrics" }),
    /repository, workflow, and runId are required/,
  );
});

for (const missingVariable of [
  "GITHUB_REPOSITORY",
  "GITHUB_WORKFLOW",
  "GITHUB_RUN_ID",
]) {
  test(`reports a clear error when ${missingVariable} is missing`, () => {
    const env = {
      ...process.env,
      GITHUB_REPOSITORY: "CyanAutomation/matmetrics",
      GITHUB_WORKFLOW: "Kaseki Docs Sweep",
      GITHUB_RUN_ID: "123456789",
    };
    delete env[missingVariable];

    const scriptPath = fileURLToPath(
      new URL("./kaseki-idempotency-key.mjs", import.meta.url),
    );
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env,
    });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "GITHUB_REPOSITORY, GITHUB_WORKFLOW, and GITHUB_RUN_ID environment variables are required\n",
    );
  });
}
