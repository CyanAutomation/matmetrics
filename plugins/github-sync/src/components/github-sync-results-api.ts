import type {
  GitHubSyncHistoryData,
  GitHubSyncHistoryFile,
  GitHubSyncSurfaceState,
  LoadGitHubSyncHistoryOptions,
} from './github-sync-results-types';

const parseErrorMessage = async (
  response: Response,
  fallback: string
): Promise<string> => {
  try {
    const payload = (await response.json()) as unknown;
    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string' &&
      payload.message.trim()
    ) {
      return payload.message;
    }
  } catch {
    // The endpoint may return an empty or non-JSON error body.
  }
  return fallback;
};

const normalizeHistoryData = (
  payload: Record<string, unknown>
): GitHubSyncSurfaceState<GitHubSyncHistoryData> => {
  const summary =
    payload.summary && typeof payload.summary === 'object'
      ? (payload.summary as Record<string, unknown>)
      : null;
  const files = Array.isArray(payload.files) ? payload.files : [];
  const totalFiles =
    summary && typeof summary.totalFiles === 'number'
      ? summary.totalFiles
      : files.length;
  const invalidFiles =
    summary && typeof summary.invalidFiles === 'number'
      ? summary.invalidFiles
      : 0;

  if (files.length === 0) {
    return {
      status: 'empty',
      message:
        'No sync history is available yet. Run sync to generate repository diagnostics.',
    };
  }

  const normalizedFiles: GitHubSyncHistoryFile[] = files.map((file) => {
    const normalized = file as Record<string, unknown>;
    return {
      path: typeof normalized.path === 'string' ? normalized.path : 'unknown',
      status:
        typeof normalized.status === 'string' ? normalized.status : 'unknown',
      errors: Array.isArray(normalized.errors)
        ? normalized.errors.filter(
            (entry): entry is string => typeof entry === 'string'
          )
        : [],
      id: typeof normalized.id === 'string' ? normalized.id : undefined,
      date: typeof normalized.date === 'string' ? normalized.date : undefined,
    };
  });

  const warnings = [
    ...(invalidFiles > 0
      ? [
          `${invalidFiles} file${invalidFiles === 1 ? '' : 's'} have validation issues and need attention.`,
        ]
      : []),
    ...normalizedFiles.flatMap((file) =>
      file.errors.map((error) => `${file.path}: ${error}`)
    ),
  ];

  return {
    status: 'success',
    warnings,
    data: {
      message:
        typeof payload.message === 'string'
          ? payload.message
          : 'Sync history loaded.',
      branch: typeof payload.branch === 'string' ? payload.branch : undefined,
      totalFiles,
      invalidFiles,
      files: normalizedFiles,
    },
  };
};

export async function runLoadGitHubSyncHistory(
  options: LoadGitHubSyncHistoryOptions
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  options.onStateChange({ status: 'loading' });

  try {
    const headers = await options.getHeaders({
      'Content-Type': 'application/json',
    });
    const response = await fetchImpl('/api/github/log-doctor', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        owner: options.owner,
        repo: options.repo,
        branch: options.branch,
      }),
    });

    if (!response.ok) {
      options.onStateChange({
        status: 'error',
        message: await parseErrorMessage(
          response,
          `Failed to load sync history (HTTP ${response.status}).`
        ),
      });
      return;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      options.onStateChange({
        status: 'error',
        message:
          'Sync history response could not be parsed. Please retry the request.',
      });
      return;
    }

    if (!payload || typeof payload !== 'object') {
      options.onStateChange({
        status: 'error',
        message: 'Sync history response was malformed. Please retry.',
      });
      return;
    }

    options.onStateChange(
      normalizeHistoryData(payload as Record<string, unknown>)
    );
  } catch (error) {
    options.onStateChange({
      status: 'error',
      message:
        error instanceof Error
          ? `Unable to load sync history: ${error.message}`
          : 'Unable to load sync history due to a network error.',
    });
  }
}

export { normalizeHistoryData };
