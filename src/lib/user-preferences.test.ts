import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_VIDEO_LIBRARY_PREFERENCES,
  normalizeLastAuditRun,
  normalizeSessionTypePreferences,
  normalizeExpectedVideoCategories,
  normalizeTrainingPlanPreferences,
  clearUserPreferencesState,
  initializeUserPreferences,
  PreferenceRequestError,
} from '@/lib/user-preferences';

test('normalizeSessionTypePreferences preserves valid enabled types and always enables Technical', () => {
  assert.deepEqual(
    normalizeSessionTypePreferences({
      enabledCategories: ['S&C', 'Cardio', 'Technical', 'Cardio'],
    }),
    { enabledCategories: ['Technical', 'Cardio', 'S&C'] }
  );

  assert.deepEqual(
    normalizeSessionTypePreferences({ enabledCategories: ['Randori'] }),
    { enabledCategories: ['Technical', 'Randori'] }
  );
});

test('normalizeSessionTypePreferences defaults legacy preferences to every session type', () => {
  assert.deepEqual(normalizeSessionTypePreferences(undefined), {
    enabledCategories: ['Technical', 'Randori', 'Shiai', 'Cardio', 'S&C'],
  });
});

test('normalizeExpectedVideoCategories keeps valid categories in canonical order', () => {
  assert.deepEqual(
    normalizeExpectedVideoCategories(['Shiai', 'Technical', 'Shiai']),
    ['Technical', 'Shiai']
  );
});

test('normalizeTrainingPlanPreferences keeps personal targets and migrates legacy monthly targets', () => {
  assert.deepEqual(
    normalizeTrainingPlanPreferences({
      categories: {
        Technical: {
          targetSessionsPerMonth: 3.6,
        },
        Randori: {
          targetSessions: 2,
          cadence: 'month',
        },
        Shiai: {
          targetSessions: 1,
          cadence: 'week',
        },
        Cardio: {
          targetSessions: 0,
          cadence: 'month',
        },
        'S&C': {
          targetSessions: 0,
          cadence: 'month',
        },
      },
    }),
    {
      categories: {
        Technical: {
          targetSessions: 4,
          cadence: 'month',
        },
        Randori: {
          targetSessions: 2,
          cadence: 'month',
        },
        Shiai: {
          targetSessions: 1,
          cadence: 'week',
        },
        Cardio: {
          targetSessions: 0,
          cadence: 'month',
        },
        'S&C': {
          targetSessions: 0,
          cadence: 'month',
        },
      },
    }
  );
});

test('normalizeExpectedVideoCategories falls back to default when invalid or empty', () => {
  // Product requirement: Technical sessions are expected to include video by default.
  assert.deepEqual(
    normalizeExpectedVideoCategories([]),
    DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories
  );
  assert.deepEqual(
    normalizeExpectedVideoCategories(['not-a-category']),
    DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories
  );
  assert.deepEqual(
    normalizeExpectedVideoCategories(undefined),
    DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories
  );

  const defaultBeforeMutation = [
    ...DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories,
  ];
  const normalized = normalizeExpectedVideoCategories(undefined);
  assert.notStrictEqual(
    normalized,
    DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories
  );
  normalized.push('Randori');
  assert.deepEqual(
    DEFAULT_VIDEO_LIBRARY_PREFERENCES.expectedVideoCategories,
    defaultBeforeMutation
  );
});

test('normalizeLastAuditRun preserves valid semantic availability summaries', () => {
  assert.deepEqual(
    normalizeLastAuditRun({
      sessions: [],
      ranAt: '2026-10-02T12:00:00.000Z',
      semanticAudit: {
        status: 'partial',
        assessedSessions: 4,
        failedSessions: 1,
      },
    }),
    {
      sessions: [],
      ranAt: '2026-10-02T12:00:00.000Z',
      semanticAudit: {
        status: 'partial',
        assessedSessions: 4,
        failedSessions: 1,
      },
    }
  );
});

test('normalizeLastAuditRun ignores malformed or legacy semantic summaries', () => {
  const legacy = normalizeLastAuditRun({ sessions: [], ranAt: '2026-10-02' });
  assert.deepEqual(legacy, { sessions: [], ranAt: '2026-10-02' });

  const malformed = normalizeLastAuditRun({
    sessions: [],
    ranAt: '2026-10-02',
    semanticAudit: {
      status: 'failed',
      assessedSessions: -1,
      failedSessions: Number.NaN,
    },
  });
  assert.deepEqual(malformed, { sessions: [], ranAt: '2026-10-02' });
});

test('preference initialization retries a failed GET instead of caching the failure', async () => {
  const originalFetch = globalThis.fetch;
  const originalBetterAuthFlag = process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
  process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'false';
  clearUserPreferencesState();

  let getRequests = 0;
  let putRequests = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') {
      putRequests += 1;
      return Response.json({ preferences: {}, revision: 1 });
    }

    getRequests += 1;
    if (getRequests === 1) {
      return Response.json(
        { error: 'temporarily unavailable' },
        { status: 503 }
      );
    }
    return Response.json({ preferences: null, revision: 0 });
  };

  try {
    await assert.rejects(
      initializeUserPreferences('retry-get-user'),
      (error) => {
        assert.ok(error instanceof PreferenceRequestError);
        assert.equal(error.method, 'GET');
        assert.equal(error.stage, 'response');
        assert.equal(error.status, 503);
        assert.equal(error.diagnostic, 'Preferences GET request returned HTTP 503');
        return true;
      }
    );

    await initializeUserPreferences('retry-get-user');

    assert.equal(getRequests, 2);
    assert.equal(putRequests, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearUserPreferencesState();
    if (originalBetterAuthFlag === undefined) {
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = originalBetterAuthFlag;
    }
  }
});

test('preference initialization reloads and retries a failed initial save for the same user', async () => {
  const originalFetch = globalThis.fetch;
  const originalBetterAuthFlag = process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
  process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'false';
  clearUserPreferencesState();

  let getRequests = 0;
  let putRequests = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') {
      putRequests += 1;
      if (putRequests === 1) {
        return Response.json(
          { error: 'temporarily unavailable' },
          { status: 503 }
        );
      }
      return Response.json({ preferences: {}, revision: 1 });
    }

    getRequests += 1;
    return Response.json({ preferences: null, revision: 0 });
  };

  try {
    await assert.rejects(
      initializeUserPreferences('retry-put-user'),
      (error) => error instanceof PreferenceRequestError && error.status === 503
    );

    await initializeUserPreferences('retry-put-user');

    assert.equal(getRequests, 2);
    assert.equal(putRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearUserPreferencesState();
    if (originalBetterAuthFlag === undefined) {
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = originalBetterAuthFlag;
    }
  }
});

test('preference request errors classify temporary failures as retryable', async () => {
  const originalFetch = globalThis.fetch;
  const originalBetterAuthFlag = process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
  process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'false';
  clearUserPreferencesState();
  globalThis.fetch = async () =>
    Response.json(
      {
        error: 'internal worker detail must not be shown',
        code: 'PREFERENCES_UNAVAILABLE',
      },
      { status: 503 }
    );

  try {
    await assert.rejects(
      initializeUserPreferences('classified-unavailable-user'),
      (error) => {
        assert.ok(error instanceof PreferenceRequestError);
        assert.equal(error.category, 'unavailable');
        assert.equal(error.canRetry, true);
        assert.equal(error.message.includes('internal worker detail'), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearUserPreferencesState();
    if (originalBetterAuthFlag === undefined) {
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = originalBetterAuthFlag;
    }
  }
});

test('preference verifier outages are reported as retryable instead of expired sessions', async () => {
  const originalFetch = globalThis.fetch;
  const originalBetterAuthFlag = process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
  process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'false';
  clearUserPreferencesState();
  globalThis.fetch = async () =>
    Response.json(
      {
        error:
          'Authentication service is temporarily unavailable. Please try again.',
        code: 'AUTHENTICATION_UNAVAILABLE',
      },
      { status: 503 }
    );

  try {
    await assert.rejects(
      initializeUserPreferences('classified-verifier-outage-user'),
      (error) => {
        assert.ok(error instanceof PreferenceRequestError);
        assert.equal(error.category, 'unavailable');
        assert.equal(error.canRetry, true);
        assert.match(error.message, /temporarily unavailable/i);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearUserPreferencesState();
    if (originalBetterAuthFlag === undefined) {
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = originalBetterAuthFlag;
    }
  }
});

test('preference request errors make permanent auth configuration failures actionable and non-retryable', async () => {
  const originalFetch = globalThis.fetch;
  const originalBetterAuthFlag = process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
  process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'false';
  clearUserPreferencesState();
  globalThis.fetch = async () =>
    Response.json(
      {
        error: 'MATMETRICS_AUTH_ISSUER leaked detail',
        code: 'AUTH_CONFIGURATION',
      },
      { status: 500 }
    );

  try {
    await assert.rejects(
      initializeUserPreferences('classified-auth-config-user'),
      (error) => {
        assert.ok(error instanceof PreferenceRequestError);
        assert.equal(error.category, 'configuration');
        assert.equal(error.canRetry, false);
        assert.match(error.message, /contact the site administrator/i);
        assert.equal(error.message.includes('MATMETRICS_AUTH_ISSUER'), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearUserPreferencesState();
    if (originalBetterAuthFlag === undefined) {
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = originalBetterAuthFlag;
    }
  }
});

test('preference request errors do not offer retry for permanent request failures', async () => {
  const originalFetch = globalThis.fetch;
  const originalBetterAuthFlag = process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
  process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'false';
  clearUserPreferencesState();
  globalThis.fetch = async () =>
    Response.json(
      { error: 'worker detail', code: 'PREFERENCE_REQUEST_FAILED' },
      { status: 422 }
    );

  try {
    await assert.rejects(
      initializeUserPreferences('permanent-preference-request-user'),
      (error) => {
        assert.ok(error instanceof PreferenceRequestError);
        assert.equal(error.category, 'request');
        assert.equal(error.canRetry, false);
        assert.equal(error.message.includes('worker detail'), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearUserPreferencesState();
    if (originalBetterAuthFlag === undefined) {
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = originalBetterAuthFlag;
    }
  }
});
