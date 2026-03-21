import { type ResolvedDashboardTabExtension } from '@/lib/plugins/types';

export type LoadDashboardTabExtensionsOptions = {
  useLegacyRegistryFallback: boolean;
  fallbackLoader: () => ResolvedDashboardTabExtension[];
  fetchImpl?: typeof fetch;
  endpoint?: string;
  requestTimeoutMs?: number;
};

export const loadDashboardTabExtensions = async ({
  useLegacyRegistryFallback,
  fallbackLoader,
  fetchImpl = fetch,
  endpoint = '/api/plugins/discovered-dashboard-tabs',
  requestTimeoutMs = 5000,
}: LoadDashboardTabExtensionsOptions): Promise<
  ResolvedDashboardTabExtension[]
> => {
  if (useLegacyRegistryFallback) {
    return fallbackLoader();
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`Plugin discovery failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      extensions?: ResolvedDashboardTabExtension[];
    };

    return Array.isArray(payload.extensions) ? payload.extensions : [];
  } catch {
    return fallbackLoader();
  }
};
