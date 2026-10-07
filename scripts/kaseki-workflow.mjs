import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

export const KASEKI_BASE_URL = "https://kaseki-tunnel.scheimann.xyz";

const MAX_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 60_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_MAX_WAIT_MS = 11_100_000;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

class KasekiResponseError extends Error {}
class KasekiDeadlineError extends Error {}

export function validateKasekiBaseUrl(baseUrl) {
  if (baseUrl !== KASEKI_BASE_URL) {
    throw new Error(
      "KASEKI_BASE_URL must use the approved Kaseki controller URL",
    );
  }
  return baseUrl;
}

function validateToken(token) {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("KASEKI_API_TOKEN is required");
  }
}

function validateRunId(runId) {
  if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
    throw new Error("invalid Kaseki run ID");
  }
}

function validatePositiveNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive number`);
  }
}

async function readResponseText(response) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new KasekiResponseError("Kaseki response exceeded the 1 MiB limit");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new KasekiResponseError("Kaseki response exceeded the 1 MiB limit");
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function requestJson(
  url,
  {
    fetchImpl,
    headers,
    method = "GET",
    body,
    now = () => performance.now(),
    sleep = (duration) =>
      new Promise((resolveSleep) => setTimeout(resolveSleep, duration)),
    deadline,
  },
) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const remainingMs =
      deadline === undefined ? REQUEST_TIMEOUT_MS : deadline - now();
    if (remainingMs <= 0)
      throw new KasekiDeadlineError("Kaseki polling deadline reached");

    try {
      const response = await fetchImpl(url, {
        method,
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(REQUEST_TIMEOUT_MS, remainingMs)),
        ),
      });

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Kaseki request returned HTTP ${response.status}`);
      }

      const responseText = await readResponseText(response);
      try {
        return JSON.parse(responseText);
      } catch {
        throw new KasekiResponseError("Kaseki returned invalid JSON");
      }
    } catch (error) {
      if (error instanceof KasekiResponseError) throw error;
      if (deadline !== undefined && now() >= deadline) {
        throw new KasekiDeadlineError("Kaseki polling deadline reached");
      }
      if (attempt === MAX_ATTEMPTS - 1) {
        throw new Error(`Kaseki request failed after ${MAX_ATTEMPTS} attempts`);
      }

      const delay = RETRY_DELAYS_MS[attempt];
      const timeLeft =
        deadline === undefined ? delay : Math.max(0, deadline - now());
      if (timeLeft <= 0)
        throw new KasekiDeadlineError("Kaseki polling deadline reached");
      await sleep(Math.min(delay, timeLeft));
    }
  }

  throw new Error("Kaseki request failed unexpectedly");
}

export async function verifyKasekiController({
  baseUrl,
  token,
  fetchImpl = fetch,
  sleep,
  now,
}) {
  validateKasekiBaseUrl(baseUrl);
  validateToken(token);

  const readiness = await requestJson(`${baseUrl}/ready`, {
    fetchImpl,
    headers: { Accept: "application/json" },
    sleep,
    now,
  });
  if (readiness?.status !== "ready") {
    throw new Error("Kaseki readiness check failed");
  }

  const gateway = await requestJson(`${baseUrl}/api/gateway-test?stage=1`, {
    fetchImpl,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    sleep,
    now,
  });
  if (gateway?.status !== "ok") {
    throw new Error("Kaseki gateway authentication check failed");
  }
}

export async function submitKasekiRun({
  baseUrl,
  token,
  payload,
  fetchImpl = fetch,
  sleep,
  now,
}) {
  validateKasekiBaseUrl(baseUrl);
  validateToken(token);
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new TypeError("Kaseki run payload must be a JSON object");
  }

  const response = await requestJson(`${baseUrl}/api/runs`, {
    fetchImpl,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(payload),
    sleep,
    now,
  });

  const runId = response?.id;
  validateRunId(runId);
  return runId;
}

export async function waitForKasekiRun({
  baseUrl,
  token,
  runId,
  fetchImpl = fetch,
  now = () => performance.now(),
  sleep = (duration) =>
    new Promise((resolveSleep) => setTimeout(resolveSleep, duration)),
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
}) {
  validateKasekiBaseUrl(baseUrl);
  validateToken(token);
  validateRunId(runId);
  validatePositiveNumber(pollIntervalMs, "pollIntervalMs");
  validatePositiveNumber(maxWaitMs, "maxWaitMs");

  const deadline = now() + maxWaitMs;

  while (now() < deadline) {
    let response;
    try {
      response = await requestJson(`${baseUrl}/api/runs/${runId}/status`, {
        fetchImpl,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        now,
        sleep,
        deadline,
      });
    } catch (error) {
      if (error instanceof KasekiDeadlineError) {
        return { status: "timed out", success: false };
      }
      throw error;
    }

    if (response?.status === "completed") {
      const exitCode = response.exitCode ?? 0;
      if (typeof exitCode !== "number" || !Number.isFinite(exitCode)) {
        throw new Error("Kaseki returned an invalid exit code");
      }
      if (exitCode === 0) {
        return { status: "completed", success: true, exitCode };
      }
      return {
        status: `failed (exit code ${exitCode})`,
        success: false,
        exitCode,
      };
    }

    if (response?.status === "failed" || response?.status === "cancelled") {
      return { status: response.status, success: false };
    }

    if (response?.status !== "queued" && response?.status !== "running") {
      throw new Error("unexpected Kaseki run status");
    }

    const timeLeft = deadline - now();
    if (timeLeft <= 0) break;
    await sleep(Math.min(pollIntervalMs, timeLeft));
  }

  return { status: "timed out", success: false };
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function writeGitHubOutput(name, value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || value.includes("\n")) {
    throw new Error("invalid GitHub Actions output");
  }
  appendFileSync(requireEnvironment("GITHUB_OUTPUT"), `${name}=${value}\n`);
}

async function runCli(command) {
  const baseUrl = process.env.KASEKI_BASE_URL ?? "";

  if (command === "validate") {
    validateKasekiBaseUrl(baseUrl);
    return;
  }

  const token = requireEnvironment("KASEKI_API_TOKEN");
  if (command === "preflight") {
    await verifyKasekiController({ baseUrl, token });
    process.stdout.write("Kaseki readiness and gateway checks succeeded.\n");
    return;
  }

  if (command === "submit") {
    let payload;
    try {
      payload = JSON.parse(readFileSync(0, "utf8"));
    } catch {
      throw new Error("Kaseki run payload must be valid JSON");
    }
    const runId = await submitKasekiRun({ baseUrl, token, payload });
    writeGitHubOutput("run_id", runId);
    process.stdout.write("Kaseki run submitted.\n");
    return;
  }

  if (command === "wait") {
    const runId = requireEnvironment("RUN_ID");
    try {
      const result = await waitForKasekiRun({ baseUrl, token, runId });
      writeGitHubOutput("status", result.status);
      if (!result.success) {
        process.stderr.write(
          `Kaseki run ${runId} ended with status ${result.status}.\n`,
        );
        process.exitCode = 1;
      }
    } catch (error) {
      writeGitHubOutput("status", "unexpected");
      throw error;
    }
    return;
  }

  throw new Error("expected one of: validate, preflight, submit, wait");
}

const scriptPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
  runCli(process.argv[2]).catch((error) => {
    process.stderr.write(`Kaseki operation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
