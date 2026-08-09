// @ts-expect-error jsdom types not available
import { JSDOM } from 'jsdom';
import { before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act, renderHook } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';

// Mock localStorage before importing modules
class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  clear(): void {
    this.store.clear();
  }
}

const localStorageMock = new LocalStorageMock();

// Setup jsdom for DOM-dependent tests
const dom = new JSDOM();
global.document = dom.window.document as any;
global.window = dom.window as any;

// Mock localStorage globally
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});
Object.defineProperty(global, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

import type { AuditSessionResult } from '../components/log-doctor-state';
import type { AuditFlagCode } from '@/lib/types';

type AuditStateManager = {
  auditResults: AuditSessionResult[];
  setAuditResults: Dispatch<SetStateAction<AuditSessionResult[]>>;
  markResolved: (sessionId: string) => Promise<void>;
  dismissForNow: (sessionId: string) => Promise<void>;
  ignoreRule: (sessionId: string, code: AuditFlagCode) => Promise<void>;
  unignoreRule: (sessionId: string, code: AuditFlagCode) => Promise<void>;
};

let useAuditStateManager: (
  userId: string | null,
  initialResults: AuditSessionResult[]
) => AuditStateManager;
let clearUserPreferencesState: () => void;

before(async () => {
  mock.module('firebase/firestore', {
    namedExports: {
      deleteField: () => undefined,
      doc: () => ({}),
      getDoc: async () => ({ exists: () => false }),
      getFirestore: () => ({}),
      serverTimestamp: () => undefined,
      setDoc: async () => undefined,
      updateDoc: async () => undefined,
    },
  });

  ({ useAuditStateManager } = await import('./use-audit-state-manager'));
  ({ clearUserPreferencesState } = await import('@/lib/user-preferences'));
});

describe('useAuditStateManager', () => {
  const mockUserId = 'test-user-123';
  const mockSessionId = 'session-001';
  const mockFlagCode = 'INVALID_MARKDOWN' as AuditFlagCode;
  const mockAuditResult: AuditSessionResult = {
    sessionId: mockSessionId,
    sessionDate: '2026-03-18',
    flags: [
      {
        code: mockFlagCode,
        severity: 'error',
        message: 'Invalid markdown',
      },
    ],
    reviewedAt: undefined,
    ignoredRules: [],
  };

  beforeEach(() => {
    localStorageMock.clear();
    clearUserPreferencesState();
  });

  const readPersistedAudit = () => {
    const cache = localStorageMock.getItem('matmetrics_user_preferences:guest');
    assert.ok(cache, 'expected the preferences cache to be persisted');
    return JSON.parse(cache).sessionAudits[mockSessionId];
  };

  const expectPersistedResultSurvivesRemount = (
    persistedAudit: Omit<AuditSessionResult, 'sessionDate'>
  ) => {
    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [
        { ...mockAuditResult, ...persistedAudit },
      ])
    );

    assert.deepEqual(result.current.auditResults, [
      { ...mockAuditResult, ...persistedAudit },
    ]);
  };

  it('should initialize with empty audit results', () => {
    const { result } = renderHook(() => useAuditStateManager(mockUserId, []));

    assert.deepEqual(result.current.auditResults, []);
  });

  it('should initialize with provided audit results', () => {
    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [mockAuditResult])
    );

    assert.deepEqual(result.current.auditResults, [mockAuditResult]);
  });

  it('should handle missing user gracefully', () => {
    const { result } = renderHook(() =>
      useAuditStateManager(null, [mockAuditResult])
    );

    assert.deepEqual(result.current.auditResults, [mockAuditResult]);
  });

  it('marks a result as resolved and persists it across remounts', async () => {
    const { result, unmount } = renderHook(() =>
      useAuditStateManager(mockUserId, [mockAuditResult])
    );

    await act(() => result.current.markResolved(mockSessionId));

    const resolved = result.current.auditResults[0];
    assert.match(resolved.reviewedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
    const persisted = readPersistedAudit();
    assert.deepEqual(persisted, {
      sessionId: mockSessionId,
      flags: mockAuditResult.flags,
      reviewedAt: resolved.reviewedAt,
      ignoredRules: [],
    });

    unmount();
    expectPersistedResultSurvivesRemount(persisted);
  });

  for (const {
    name,
    initialIgnoredRules,
    actOnResult,
    expectedIgnoredRules,
  } of [
    {
      name: 'dismisses every flag for now',
      initialIgnoredRules: [] as AuditFlagCode[],
      actOnResult: (manager: AuditStateManager) =>
        manager.dismissForNow(mockSessionId),
      expectedIgnoredRules: [mockFlagCode],
    },
    {
      name: 'ignores a rule',
      initialIgnoredRules: [] as AuditFlagCode[],
      actOnResult: (manager: AuditStateManager) =>
        manager.ignoreRule(mockSessionId, mockFlagCode),
      expectedIgnoredRules: [mockFlagCode],
    },
    {
      name: 'unignores a rule',
      initialIgnoredRules: [mockFlagCode],
      actOnResult: (manager: AuditStateManager) =>
        manager.unignoreRule(mockSessionId, mockFlagCode),
      expectedIgnoredRules: [] as AuditFlagCode[],
    },
  ]) {
    it(`${name} and persists the change across remounts`, async () => {
      const initialResult = {
        ...mockAuditResult,
        ignoredRules: initialIgnoredRules,
      };
      const { result, unmount } = renderHook(() =>
        useAuditStateManager(mockUserId, [initialResult])
      );

      await act(() => actOnResult(result.current));

      assert.deepEqual(
        result.current.auditResults[0].ignoredRules,
        expectedIgnoredRules
      );
      assert.equal(result.current.auditResults[0].reviewedAt, undefined);
      const persisted = readPersistedAudit();
      assert.deepEqual(persisted, {
        sessionId: mockSessionId,
        flags: mockAuditResult.flags,
        ignoredRules: expectedIgnoredRules,
      });

      unmount();
      expectPersistedResultSurvivesRemount(persisted);
    });
  }

  it('replaces audit results without persisting transient state', () => {
    const replacement = {
      ...mockAuditResult,
      sessionId: 'session-002',
      sessionDate: '2026-03-19',
    };
    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [mockAuditResult])
    );

    act(() => result.current.setAuditResults([replacement]));

    assert.deepEqual(result.current.auditResults, [replacement]);
    assert.equal(
      localStorageMock.getItem('matmetrics_user_preferences:guest'),
      null
    );
  });
});
