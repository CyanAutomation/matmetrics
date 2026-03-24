import type {
  PluginManifest,
  PluginMaturityScorecard,
  PluginValidationIssue,
} from '@/lib/plugins/types';

export type PluginListRow = {
  manifest: unknown;
  maturity?: PluginMaturityScorecard;
  validation?: {
    isValid?: boolean;
    rows?: PluginValidationIssue[];
  };
};

export type InstalledPluginManifestRow = {
  manifest: PluginManifest;
  issues: PluginValidationIssue[];
  maturity?: PluginMaturityScorecard;
};

export type PluginManagerAccessState =
  | 'ready'
  | 'sign-in-required'
  | 'auth-unavailable';

type PluginApiErrorPayload = {
  error?: string;
  details?: string;
};

type AuthHeadersLoader = (headers?: HeadersInit) => Promise<HeadersInit>;

type FetchInstalledPluginsOptions = {
  fetchImpl?: typeof fetch;
  getHeaders?: AuthHeadersLoader;
  endpoint?: string;
};

type ToggleInstalledPluginOptions = {
  pluginId: string;
  enabled: boolean;
  fetchImpl?: typeof fetch;
  getHeaders?: AuthHeadersLoader;
  endpoint?: string;
};

const defaultAuthHeadersLoader: AuthHeadersLoader = async (
  headers?: HeadersInit
) => headers ?? {};

export const getPluginManagerAccessState = ({
  authAvailable,
  userPresent,
}: {
  authAvailable: boolean;
  userPresent: boolean;
}): PluginManagerAccessState => {
  if (!authAvailable) {
    return 'auth-unavailable';
  }

  if (!userPresent) {
    return 'sign-in-required';
  }

  return 'ready';
};

const parsePluginApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as PluginApiErrorPayload;
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
    if (typeof payload.details === 'string' && payload.details.trim()) {
      return payload.details;
    }
  } catch {
    // Fall back to status text below when the response is not valid JSON.
  }

  if (response.statusText) {
    return response.statusText;
  }

  return `Request failed with status ${response.status}`;
};

export const normalizeInstalledPluginRows = (
  pluginRows: PluginListRow[]
): InstalledPluginManifestRow[] =>
  pluginRows.flatMap((pluginRow) => {
    if (!pluginRow || typeof pluginRow !== 'object') {
      return [];
    }

    const manifest = pluginRow.manifest;
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return [];
    }

    const candidate = manifest as Partial<PluginManifest>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.version !== 'string' ||
      typeof candidate.description !== 'string' ||
      typeof candidate.enabled !== 'boolean'
    ) {
      return [];
    }

    const issues = Array.isArray(pluginRow.validation?.rows)
      ? pluginRow.validation.rows
      : [];

    return [
      {
        manifest: candidate as PluginManifest,
        issues,
        maturity: pluginRow.maturity,
      },
    ];
  });

export const fetchInstalledPlugins = async ({
  fetchImpl = fetch,
  getHeaders = defaultAuthHeadersLoader,
  endpoint = '/api/plugins/list',
}: FetchInstalledPluginsOptions = {}): Promise<
  InstalledPluginManifestRow[]
> => {
  const headers = await getHeaders();
  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(await parsePluginApiError(response));
  }

  const payload = (await response.json()) as {
    plugins?: PluginListRow[];
    error?: string;
  };

  if (!Array.isArray(payload.plugins)) {
    throw new Error(payload.error ?? 'Invalid plugins list response.');
  }

  return normalizeInstalledPluginRows(payload.plugins);
};

export const toggleInstalledPlugin = async ({
  pluginId,
  enabled,
  fetchImpl = fetch,
  getHeaders = defaultAuthHeadersLoader,
  endpoint = '/api/plugins/toggle',
}: ToggleInstalledPluginOptions): Promise<void> => {
  const headers = await getHeaders({
    'Content-Type': 'application/json',
  });
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: pluginId,
      enabled,
      confirm: true,
      confirmOverwrite: true,
    }),
  });

  if (!response.ok) {
    throw new Error(await parsePluginApiError(response));
  }
};
