import type { JudoSession } from './types';

export function getSafeVideoUrl(videoUrl?: string): string | null {
  if (!videoUrl) return null;

  try {
    const parsedUrl = new URL(videoUrl);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return parsedUrl.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export function getVideoHostname(videoUrl: string): string {
  try {
    return new URL(videoUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function getSessionNotePreview(
  session: Pick<JudoSession, 'description' | 'notes'>
): string {
  return [session.description, session.notes]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' · ')
    .replace(/\s+/g, ' ')
    .trim();
}
