'use client';

const DEFAULT_SCOPE = 'signed-out';

let activeUserId: string | null = null;

export function setActiveUserId(userId: string | null | undefined): void {
  const normalized = typeof userId === 'string' ? userId.trim() : '';
  activeUserId = normalized || null;
}

export function getActiveUserId(): string | null {
  return activeUserId;
}

export function getScopedStorageKey(baseKey: string): string {
  return `${baseKey}:${activeUserId ?? DEFAULT_SCOPE}`;
}
