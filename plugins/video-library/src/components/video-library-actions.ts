import type {
  JudoSession,
  SessionCategory,
  VideoLibraryPreferences,
} from '@/lib/types';
import { getAuthHeaders } from '@/lib/auth-session';
import { saveVideoLibraryPreference } from '@/lib/user-preferences';
import {
  mergeVideoLinkCheckResults,
  normalizeVideoDomainInput,
  reconcileVideoLinkChecks,
} from '@/lib/video-library';

type VideoLibraryToast = (options: any) => void;

export async function saveExpectedVideoCategory({
  category,
  user,
  canSavePreferences,
  expectedVideoCategories,
  videoLibraryPreferences,
  customAllowedDomains,
  reconciledLinkChecks,
  toast,
  setSaving,
  savePreference,
}: {
  category: SessionCategory;
  user: { uid: string } | null | undefined;
  canSavePreferences: boolean;
  expectedVideoCategories: SessionCategory[];
  videoLibraryPreferences: VideoLibraryPreferences;
  customAllowedDomains: string[];
  reconciledLinkChecks: VideoLibraryPreferences['linkChecksBySessionId'];
  toast: VideoLibraryToast;
  setSaving: (value: boolean) => void;
  savePreference: typeof saveVideoLibraryPreference;
}): Promise<void> {
  if (!user || !canSavePreferences) {
    toast({
      title: 'Sign-in required',
      description:
        'Category expectations are saved when authentication is configured and you are signed in.',
    });
    return;
  }

  const nextExpectedCategories = expectedVideoCategories.includes(category)
    ? expectedVideoCategories.filter((value) => value !== category)
    : [...expectedVideoCategories, category];

  setSaving(true);
  try {
    await savePreference(user.uid, {
      ...videoLibraryPreferences,
      customAllowedDomains,
      linkChecksBySessionId: reconciledLinkChecks,
      expectedVideoCategories: nextExpectedCategories,
    });
    toast({
      title: 'Category expectations updated',
      description:
        nextExpectedCategories.length > 0
          ? 'No-video reminders now follow your selected categories.'
          : 'No-video reminders are disabled for all categories.',
    });
  } catch (error) {
    console.error('Failed to save category expectations', error);
    toast({
      variant: 'destructive',
      title: 'Could not save expectations',
      description:
        'Your category expectation changes were not saved. Please try again.',
    });
  } finally {
    setSaving(false);
  }
}

export async function addVideoAllowedDomain({
  newDomain,
  user,
  canSavePreferences,
  allowedDomains,
  customAllowedDomains,
  videoLibraryPreferences,
  reconciledLinkChecks,
  expectedVideoCategories,
  toast,
  setNewDomain,
  setSaving,
  savePreference,
}: {
  newDomain: string;
  user: { uid: string } | null | undefined;
  canSavePreferences: boolean;
  allowedDomains: string[];
  customAllowedDomains: string[];
  videoLibraryPreferences: VideoLibraryPreferences;
  reconciledLinkChecks: VideoLibraryPreferences['linkChecksBySessionId'];
  expectedVideoCategories: SessionCategory[];
  toast: VideoLibraryToast;
  setNewDomain: (value: string) => void;
  setSaving: (value: boolean) => void;
  savePreference: typeof saveVideoLibraryPreference;
}): Promise<void> {
  if (!user || !canSavePreferences) {
    toast({
      title: 'Sign-in required',
      description:
        'Custom allowed domains are available when authentication is configured and you are signed in.',
    });
    return;
  }

  const normalizedDomain = normalizeVideoDomainInput(newDomain);
  if (!normalizedDomain) {
    toast({
      variant: 'destructive',
      title: 'Invalid domain',
      description:
        'Enter a hostname like youtube.com with no scheme, path, or port.',
    });
    return;
  }
  if (allowedDomains.includes(normalizedDomain)) {
    toast({
      variant: 'destructive',
      title: 'Domain already allowed',
      description: `${normalizedDomain} is already covered by the current allowlist.`,
    });
    return;
  }

  setSaving(true);
  try {
    await savePreference(user.uid, {
      ...videoLibraryPreferences,
      customAllowedDomains: Array.from(
        new Set([...customAllowedDomains, normalizedDomain])
      ).sort(),
      linkChecksBySessionId: reconciledLinkChecks,
      expectedVideoCategories,
    });
    setNewDomain('');
    toast({
      title: 'Allowed domains updated',
      description: `${normalizedDomain} can now be used in the Video Library allowlist.`,
    });
  } catch (error) {
    console.error('Failed to save video library preference', error);
    toast({
      variant: 'destructive',
      title: 'Could not save domain',
      description: 'Your allowlist changes were not saved. Please try again.',
    });
  } finally {
    setSaving(false);
  }
}

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
