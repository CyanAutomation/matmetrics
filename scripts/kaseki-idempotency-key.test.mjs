import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createKasekiIdempotencyKey } from "./kaseki-idempotency-key.mjs";

test("creates a UUIDv4 idempotency key", () => {
  const first = createKasekiIdempotencyKey();
  const second = createKasekiIdempotencyKey();

  assert.notEqual(first, second);
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
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
