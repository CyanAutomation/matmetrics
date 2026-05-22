// @ts-expect-error jsdom types not available
import { JSDOM } from 'jsdom';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act } from '@testing-library/react';

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

import { useAuditStateManager } from './use-audit-state-manager';
import type { AuditSessionResult } from '../components/log-doctor-state';
import type { AuditFlagCode } from '@/lib/types';

describe('useAuditStateManager', () => {
  const mockUserId = 'test-user-123';
  const mockSessionId = 'session-001';
  const mockAuditResult: AuditSessionResult = {
    sessionId: mockSessionId,
    sessionDate: '2026-03-18',
    flags: [
      { code: 'INVALID_MARKDOWN' as AuditFlagCode, severity: 'error', message: 'Invalid markdown' },
    ],
    reviewedAt: undefined,
    ignoredRules: [],
  };

  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should initialize with empty audit results', () => {
    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [])
    );

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

  it('should provide update methods', () => {
    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [mockAuditResult])
    );

    assert.ok(typeof result.current.markResolved === 'function');
    assert.ok(typeof result.current.dismissForNow === 'function');
    assert.ok(typeof result.current.ignoreRule === 'function');
    assert.ok(typeof result.current.unignoreRule === 'function');
    assert.ok(typeof result.current.setAuditResults === 'function');
  });

  // Firebase-dependent async tests are skipped since Firebase is not configured
  // in the test environment. The hook implementation is tested via
  // component integration tests with proper Firebase setup.
});

