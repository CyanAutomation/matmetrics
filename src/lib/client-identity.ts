'use client';

export const GUEST_USER_ID = 'guest';

let activeUserId = GUEST_USER_ID;

function normalizeUserId(userId: string | null | undefined): string {
  const normalized = typeof userId === 'string' ? userId.trim() : '';
  return normalized || GUEST_USER_ID;
}

export function setActiveUserId(userId: string | null | undefined): void {
  activeUserId = normalizeUserId(userId);
}

export function getActiveUserId(): string {
  return activeUserId;
}

export function isGuestUserId(userId: string | null | undefined): boolean {
  return normalizeUserId(userId) === GUEST_USER_ID;
}

export function isGuestMode(): boolean {
  return activeUserId === GUEST_USER_ID;
}

export function getScopedStorageKeyForUser(
  baseKey: string,
  userId: string | null | undefined
): string {
  return `${baseKey}:${normalizeUserId(userId)}`;
}

export function getScopedStorageKey(baseKey: string): string {
  return getScopedStorageKeyForUser(baseKey, activeUserId);
}
