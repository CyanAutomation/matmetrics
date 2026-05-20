/**
 * Utility functions extracted from src/app/page.tsx for better testability
 * These functions handle dashboard-specific logic like sync status text,
 * user initials, and badge labels.
 */

import type { SyncStatus } from '@/lib/sync-queue';

/**
 * Generate user initials from display name, email, or default label
 * @param displayName - User's display name
 * @param email - User's email
 * @param isGuest - Whether user is in guest mode
 * @returns 2-character initials string in uppercase
 */
export function getUserInitials(
  displayName: string | undefined | null,
  email: string | undefined | null,
  isGuest: boolean
): string {
  // If display name is provided, use it; otherwise extract from email prefix
  let nameToProcess = displayName;
  if (!nameToProcess && email) {
    // Extract username part before @ and replace dots/underscores with spaces
    nameToProcess = email.split('@')[0].replace(/[._-]/g, ' ');
  }
  
  // If still no name, return the appropriate default initials
  if (!nameToProcess) {
    return isGuest ? 'G' : 'MM';
  }

  // Extract initials from the name
  return nameToProcess
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Generate badge label for guest workspace state
 * @param workspaceSource - Either 'custom' (guest session data) or 'demo' (seeded preview)
 * @returns Human-readable label for the workspace state
 */
export function getGuestBadgeLabel(
  workspaceSource: 'custom' | 'demo'
): string {
  return workspaceSource === 'custom' ? 'Guest Workspace' : 'Demo Preview';
}

/**
 * Generate human-readable sync status text
 * @param syncStatus - Sync status object containing isOnline, isSyncing, pendingCount
 * @returns Status text suitable for display or title attribute
 */
export function getSyncStatusText(syncStatus: SyncStatus): string {
  if (!syncStatus.isOnline) {
    return 'Offline';
  }
  if (syncStatus.isSyncing) {
    return 'Syncing';
  }
  if (syncStatus.pendingCount > 0) {
    return `${syncStatus.pendingCount} pending`;
  }
  return 'Synced';
}

/**
 * Generate guest workspace description for footer
 * @param workspaceSource - Either 'custom' or 'demo'
 * @returns Description text for the guest workspace state
 */
export function getGuestWorkspaceDescription(
  workspaceSource: 'custom' | 'demo'
): string {
  return workspaceSource === 'custom'
    ? 'Local guest data'
    : 'Demo data loaded';
}

/**
 * Generate guest mode alert message body
 * @param workspaceSource - Either 'custom' or 'demo'
 * @param authAvailable - Whether auth is available in the current environment
 * @returns Alert description text explaining guest mode
 */
export function getGuestModeAlertMessage(
  workspaceSource: 'custom' | 'demo',
  authAvailable: boolean
): string {
  if (workspaceSource === 'custom') {
    return authAvailable
      ? 'You can keep logging sessions locally in this browser. Sign in to unlock AI tools, GitHub sync, and cloud-backed preferences.'
      : 'You can keep logging sessions locally in this browser. Sign-in is not available, but you can set up GitHub sync manually.';
  }
  return authAvailable
    ? 'You are browsing a seeded preview workspace. Start editing to turn it into your own local guest workspace.'
    : 'You are browsing a seeded preview workspace. Start editing to turn it into your own local guest workspace.';
}

/**
 * Get the appropriate sign-in button text based on auth availability
 * @param authAvailable - Whether auth is available
 * @returns Button text
 */
export function getSignInButtonText(authAvailable: boolean): string {
  return authAvailable ? 'Sign in to unlock more' : 'View sign-in setup';
}
