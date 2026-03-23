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
        cache: 'no-store',
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errorMessage = `Plugin discovery failed with status ${response.status}`;

      try {
        const payload = (await response.json()) as { error?: string };
        if (typeof payload.error === 'string' && payload.error.trim()) {
          errorMessage = payload.error;
        }
      } catch {
        // Ignore invalid JSON and keep the status-based message.
      }

      throw new Error(errorMessage);
    }

    const payload = (await response.json()) as {
      extensions?: ResolvedDashboardTabExtension[];
    };

    return Array.isArray(payload.extensions) ? payload.extensions : [];
  } catch (error) {
    console.warn('Falling back to legacy plugin dashboard discovery', error);
    return fallbackLoader();
  }
};
