import { NextResponse } from 'next/server';
import { getFirebaseAdminDb } from './firebase-admin';
import { normalizeGitHubConfig } from './session-storage';
import type { GitHubConfig } from './types';

type FirebasePreferences = {
  gitHub?: {
    config?: GitHubConfig;
  };
};

const FORBIDDEN_REPO_MESSAGE =
  'Forbidden: requested GitHub repository does not match your configured repository.';

function readTestModeGitHubConfig(): GitHubConfig | undefined {
  const rawConfig = process.env.MATMETRICS_TEST_USER_GITHUB_CONFIG;
  if (rawConfig) {
    try {
      return normalizeGitHubConfig(JSON.parse(rawConfig)) ?? undefined;
    } catch (error) {
      console.error('Invalid MATMETRICS_TEST_USER_GITHUB_CONFIG JSON', error);
      return undefined;
    }
  }

  return {
    owner: 'test-owner',
    repo: 'test-repo',
  };
}

export async function getStoredGitHubConfigForUser(
  uid: string
): Promise<GitHubConfig | undefined> {
  if (process.env.MATMETRICS_AUTH_TEST_MODE === 'true') {
    return readTestModeGitHubConfig();
  }

  const snapshot = await getFirebaseAdminDb()
    .collection('users')
    .doc(uid)
    .collection('preferences')
    .doc('app')
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  const preferences = snapshot.data() as FirebasePreferences;
  return normalizeGitHubConfig(preferences?.gitHub?.config) ?? undefined;
}

export async function resolveAuthorizedGitHubConfig(
  uid: string,
  requestedConfig: GitHubConfig | undefined
): Promise<{ config?: GitHubConfig; forbiddenResponse?: NextResponse }> {
  const storedConfig = await getStoredGitHubConfigForUser(uid);

  if (!requestedConfig) {
    return { config: undefined };
  }

  if (!storedConfig) {
    return {
      forbiddenResponse: NextResponse.json(
        { error: FORBIDDEN_REPO_MESSAGE },
        { status: 403 }
      ),
    };
  }

  if (
    requestedConfig.owner !== storedConfig.owner ||
    requestedConfig.repo !== storedConfig.repo ||
    (requestedConfig.branch !== undefined &&
      requestedConfig.branch !== storedConfig.branch)
  ) {
    return {
      forbiddenResponse: NextResponse.json(
        { error: FORBIDDEN_REPO_MESSAGE },
        { status: 403 }
      ),
    };
  }

  return { config: storedConfig };
}
