import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function createKasekiIdempotencyKey() {
  // Kaseki requires UUIDv4; the submit client reuses this value across retries.
  return randomUUID();
}

const scriptPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (scriptPath === fileURLToPath(import.meta.url)) {
  try {
    const repository = process.env.GITHUB_REPOSITORY;
    const workflow = process.env.GITHUB_WORKFLOW;
    const runId = process.env.GITHUB_RUN_ID;

    if (!repository || !workflow || !runId) {
      throw new TypeError(
        "GITHUB_REPOSITORY, GITHUB_WORKFLOW, and GITHUB_RUN_ID environment variables are required",
      );
    }

    const key = createKasekiIdempotencyKey();
    process.stdout.write(`${key}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
