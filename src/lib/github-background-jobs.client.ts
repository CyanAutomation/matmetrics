import {
  isBackgroundJobResult,
  isKeikoBackgroundJobResult,
  type BackgroundJobResult,
  type KeikoBackgroundJobResult,
} from './background-jobs';

type AnyBackgroundJob = BackgroundJobResult | KeikoBackgroundJobResult;
type JobFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GitHubJobWaitOptions = {
  getAuthHeaders: (headers?: Record<string, string>) => Promise<HeadersInit>;
  fetchImpl?: JobFetch;
  sleep?: (durationMs: number) => Promise<void>;
  signal?: AbortSignal;
  attempts?: number;
};

function isJob(value: unknown): value is AnyBackgroundJob {
  return isBackgroundJobResult(value) || isKeikoBackgroundJobResult(value);
}

function pause(durationMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Request canceled', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, durationMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function waitForGitHubJobResponse(
  response: Response,
  options: GitHubJobWaitOptions
): Promise<unknown> {
  let initial: unknown;
  try {
    initial = await response.json();
  } catch {
    throw new Error(`GitHub operation returned an invalid response (HTTP ${response.status})`);
  }
  if (response.status !== 202) {
    return initial;
  }
  if (!isJob(initial)) throw new Error('GitHub operation returned an invalid background job');

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((durationMs: number) => pause(durationMs, options.signal));
  const attempts = options.attempts ?? 120;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(500);
    const headers = await options.getAuthHeaders();
    const statusResponse = await fetchImpl(`/api/background-jobs/${encodeURIComponent(initial.id)}`, {
      headers,
      signal: options.signal,
      cache: 'no-store',
    });
    let current: unknown;
    try { current = await statusResponse.json(); } catch { current = null; }
    if (!statusResponse.ok || !isJob(current)) {
      throw new Error('Unable to read GitHub operation status');
    }
    if (current.status === 'completed') return current.result;
    if (current.status === 'failed') throw new Error(current.error || 'GitHub operation failed');
  }
  throw new Error('GitHub operation is taking longer than expected');
}
