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

type Sleep = (duration: number) => Promise<void>;
type KasekiDependencies = {
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
  now?: () => number;
};
type JsonRequestOptions = {
  fetchImpl: typeof fetch;
  headers: HeadersInit;
  method?: string;
  body?: BodyInit;
  now?: () => number;
  sleep?: Sleep;
  deadline?: number;
};
type KasekiRunResult = {
  status: string;
  success: boolean;
  exitCode?: number;
};

class KasekiResponseError extends Error {}
class KasekiDeadlineError extends Error {}

class KasekiHttpError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor({
    status,
    statusText,
    title,
    detail,
    requestId,
  }: {
    status: number;
    statusText?: string;
    title?: string;
    detail?: string;
    requestId?: string;
  }) {
    const parts = [
      `HTTP ${status}${statusText ? ` ${statusText}` : ""}`,
      title,
      detail,
      requestId ? `request ID ${requestId}` : undefined,
    ].filter(Boolean);

    super(`Kaseki request returned ${parts.join(": ")}`);
    this.status = status;
    this.retryable =
      status === 408 ||
      status === 425 ||
      status === 429 ||
      status >= 500;
  }
}

function safeDiagnosticText(
  value: unknown,
  maxLength = 512
): string | undefined {
  if (typeof value !== "string") return undefined;
  const safeValue = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
  return safeValue || undefined;
}

export function validateKasekiBaseUrl(baseUrl: string): string {
  if (baseUrl !== KASEKI_BASE_URL) {
    throw new Error(
      "KASEKI_BASE_URL must use the approved Kaseki controller URL",
    );
  }
  return baseUrl;
}

function validateToken(token: unknown): asserts token is string {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("KASEKI_API_TOKEN is required");
  }
}

function validateRunId(runId: unknown): asserts runId is string {
  if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
    throw new Error("invalid Kaseki run ID");
  }
}

function validatePositiveNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive number`);
  }
}

async function readResponseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new KasekiResponseError("Kaseki response exceeded the 1 MiB limit");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
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

async function createHttpError(response: Response): Promise<KasekiHttpError> {
  let problemDetails: unknown;
  try {
    const responseText = await readResponseText(response);
    problemDetails = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    // Keep the HTTP status even if the body is missing, oversized, or malformed.
  }

  const details = isRecord(problemDetails) ? problemDetails : {};

  return new KasekiHttpError({
    status: response.status,
    statusText: safeDiagnosticText(response.statusText, 80),
    title: safeDiagnosticText(details.title, 160),
    detail: safeDiagnosticText(details.detail),
    requestId:
      safeDiagnosticText(response.headers.get("x-request-id"), 128) ??
      safeDiagnosticText(details.requestId, 128),
  });
}

function getRequestTimeoutMs(
  deadline: number | undefined,
  now: () => number
): number {
  const remainingMs =
    deadline === undefined ? REQUEST_TIMEOUT_MS : deadline - now();
  if (remainingMs <= 0) {
    throw new KasekiDeadlineError("Kaseki polling deadline reached");
  }
  return Math.max(1, Math.min(REQUEST_TIMEOUT_MS, remainingMs));
}

function parseResponseJson(responseText: string): unknown {
  try {
    return JSON.parse(responseText);
  } catch {
    throw new KasekiResponseError("Kaseki returned invalid JSON");
  }
}

async function performJsonRequest(
  url: string,
  options: Pick<JsonRequestOptions, 'fetchImpl' | 'headers' | 'method' | 'body'>,
  timeoutMs: number
): Promise<unknown> {
  const { fetchImpl, headers, method, body } = options;
  const response = await fetchImpl(url, {
    method,
    headers,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw await createHttpError(response);

  const responseText = await readResponseText(response);
  return parseResponseJson(responseText);
}

function throwIfRequestCannotRetry(
  error: unknown,
  deadline: number | undefined,
  now: () => number
): void {
  if (error instanceof KasekiResponseError) throw error;
  if (error instanceof KasekiHttpError && !error.retryable) throw error;
  if (deadline !== undefined && now() >= deadline) {
    throw new KasekiDeadlineError("Kaseki polling deadline reached");
  }
}

function createRetryExhaustedError(error: unknown): Error {
  const lastError = safeDiagnosticText(
    error instanceof Error ? error.message : String(error),
  );
  return new Error(
    `Kaseki request failed after ${MAX_ATTEMPTS} attempts${lastError ? `: ${lastError}` : ""}`,
    { cause: error },
  );
}

async function waitBeforeRequestRetry(
  attempt: number,
  deadline: number | undefined,
  now: () => number,
  sleep: Sleep
): Promise<void> {
  const delay = RETRY_DELAYS_MS[attempt];
  const timeLeft =
    deadline === undefined ? delay : Math.max(0, deadline - now());
  if (timeLeft <= 0) {
    throw new KasekiDeadlineError("Kaseki polling deadline reached");
  }
  await sleep(Math.min(delay, timeLeft));
}

async function requestJson(
  url: string,
  {
    fetchImpl,
    headers,
    method = "GET",
    body,
    now = () => performance.now(),
    sleep = (duration) =>
      new Promise<void>((resolveSleep) => setTimeout(resolveSleep, duration)),
    deadline,
  }: JsonRequestOptions
): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const timeoutMs = getRequestTimeoutMs(deadline, now);
      return await performJsonRequest(
        url,
        { fetchImpl, headers, method, body },
        timeoutMs,
      );
    } catch (error) {
      throwIfRequestCannotRetry(error, deadline, now);
      if (attempt === MAX_ATTEMPTS - 1) {
        throw createRetryExhaustedError(error);
      }
      await waitBeforeRequestRetry(attempt, deadline, now, sleep);
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
}: KasekiDependencies & {
  baseUrl: string;
  token: string;
}): Promise<void> {
  validateKasekiBaseUrl(baseUrl);
  validateToken(token);

  const readiness = await requestJson(`${baseUrl}/ready`, {
    fetchImpl,
    headers: { Accept: "application/json" },
    sleep,
    now,
  });
  if (!isRecord(readiness) || readiness.status !== "ready") {
    throw new Error("Kaseki readiness check failed");
  }

  const gateway = await requestJson(`${baseUrl}/api/v1/gateway-test?stage=1`, {
    fetchImpl,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    sleep,
    now,
  });
  if (!isRecord(gateway) || gateway.status !== "ok") {
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
}: KasekiDependencies & {
  baseUrl: string;
  token: string;
  payload: unknown;
}): Promise<string> {
  validateKasekiBaseUrl(baseUrl);
  validateToken(token);
  if (!isRecord(payload)) {
    throw new TypeError("Kaseki run payload must be a JSON object");
  }
  const idempotencyKey = payload.idempotencyKey;
  if (
    idempotencyKey !== undefined &&
    (typeof idempotencyKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idempotencyKey,
      ))
  ) {
    throw new TypeError("Kaseki idempotencyKey must be a UUID v4");
  }

  const response = await requestJson(`${baseUrl}/api/v1/runs`, {
    fetchImpl,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    method: "POST",
    body: JSON.stringify(payload),
    sleep,
    now,
  });

  const runId = isRecord(response) ? response.id : undefined;
  validateRunId(runId);
  return runId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getKasekiRunResult(response: unknown): KasekiRunResult | null {
  if (!isRecord(response)) throw new Error("unexpected Kaseki run status");

  if (response.status === "completed") {
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

  if (response.status === "failed" || response.status === "cancelled") {
    return { status: response.status, success: false };
  }

  if (response.status !== "queued" && response.status !== "running") {
    throw new Error("unexpected Kaseki run status");
  }

  return null;
}

async function pollKasekiRunOnce({
  url,
  token,
  fetchImpl,
  now,
  sleep,
  deadline,
}: {
  url: string;
  token: string;
  fetchImpl: typeof fetch;
  now: () => number;
  sleep: Sleep;
  deadline: number;
}): Promise<KasekiRunResult | null> {
  try {
    const response = await requestJson(url, {
      fetchImpl,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      now,
      sleep,
      deadline,
    });
    return getKasekiRunResult(response);
  } catch (error) {
    if (error instanceof KasekiDeadlineError) {
      return { status: "timed out", success: false };
    }
    throw error;
  }
}

export async function waitForKasekiRun({
  baseUrl,
  token,
  runId,
  fetchImpl = fetch,
  now = () => performance.now(),
  sleep = (duration) =>
    new Promise<void>((resolveSleep) => setTimeout(resolveSleep, duration)),
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
}: KasekiDependencies & {
  baseUrl: string;
  token: string;
  runId: string;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}): Promise<KasekiRunResult> {
  validateKasekiBaseUrl(baseUrl);
  validateToken(token);
  validateRunId(runId);
  validatePositiveNumber(pollIntervalMs, "pollIntervalMs");
  validatePositiveNumber(maxWaitMs, "maxWaitMs");

  const deadline = now() + maxWaitMs;
  const url = `${baseUrl}/api/v1/runs/${runId}/status`;

  while (now() < deadline) {
    const result = await pollKasekiRunOnce({
      url,
      token,
      fetchImpl,
      now,
      sleep,
      deadline,
    });
    if (result) return result;

    const timeLeft = deadline - now();
    if (timeLeft <= 0) break;
    await sleep(Math.min(pollIntervalMs, timeLeft));
  }

  return { status: "timed out", success: false };
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function writeGitHubOutput(name: string, value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || value.includes("\n")) {
    throw new Error("invalid GitHub Actions output");
  }
  appendFileSync(requireEnvironment("GITHUB_OUTPUT"), `${name}=${value}\n`);
}

async function runCli(command: string | undefined): Promise<void> {
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
    let payload: unknown;
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
      process.stderr.write(
        `Kaseki operation failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`
      );
    process.exitCode = 1;
  });
}
