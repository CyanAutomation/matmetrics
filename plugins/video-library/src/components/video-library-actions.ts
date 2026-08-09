import type {
  JudoSession,
  SessionCategory,
  VideoLibraryPreferences,
} from '@/lib/types';
import { getAuthHeaders } from '@/lib/auth-session';
import { saveVideoLibraryPreference } from '@/lib/user-preferences';
import {
  mergeVideoLinkCheckResults,
  reconcileVideoLinkChecks,
} from '@/lib/video-library';

type VideoLibraryToast = (options: any) => void;

export type VideoLinkCheckRunOptions = {
  authAvailable: boolean;
  user: { uid: string } | null | undefined;
  sessionIds: string[];
  sessions: JudoSession[];
  customAllowedDomains: string[];
  reconciledLinkChecks: VideoLibraryPreferences['linkChecksBySessionId'];
  videoLibraryPreferences: VideoLibraryPreferences;
  expectedVideoCategories: SessionCategory[];
  toast: VideoLibraryToast;
  getAuthHeaders: typeof getAuthHeaders;
  savePreference: typeof saveVideoLibraryPreference;
  fetchImpl: typeof fetch;
  silent?: boolean;
};

export async function runVideoLinkCheck({
  authAvailable,
  user,
  sessionIds,
  sessions,
  customAllowedDomains,
  reconciledLinkChecks,
  videoLibraryPreferences,
  expectedVideoCategories,
  toast,
  getAuthHeaders: getHeaders,
  savePreference,
  fetchImpl,
  silent,
}: VideoLinkCheckRunOptions): Promise<void> {
  if (!authAvailable || !user) {
    toast({
      title: 'Sign-in required',
      description: 'Live link checks are available after sign-in.',
    });
    return;
  }
  if (sessionIds.length === 0) return;

  try {
    const headers = await getHeaders({ 'Content-Type': 'application/json' });
    const response = await fetchImpl('/api/video-library/check-links', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionIds }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to check video links');
    }
    const results = Array.isArray(payload.results) ? payload.results : [];
    const nextLinkChecks = reconcileVideoLinkChecks({
      sessions,
      customAllowedDomains,
      linkChecksBySessionId: mergeVideoLinkCheckResults({
        existing: reconciledLinkChecks,
        results,
      }),
    });
    await savePreference(user.uid, {
      ...videoLibraryPreferences,
      customAllowedDomains,
      linkChecksBySessionId: nextLinkChecks,
      expectedVideoCategories,
    });
    if (!silent) {
      toast({
        title: 'Link health refreshed',
        description: `Updated link status for ${results.length} videos.`,
      });
    }
  } catch (error) {
    console.error('Failed to check video links', error);
    toast({
      variant: 'destructive',
      title: 'Link check failed',
      description:
        'The Video Library could not complete the link check. Try again in a moment.',
    });
  }
}
