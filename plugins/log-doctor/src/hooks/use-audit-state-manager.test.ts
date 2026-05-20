// @ts-expect-error jsdom types not available
import { JSDOM } from 'jsdom';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook } from '@testing-library/react';

// Setup jsdom for DOM-dependent tests
const dom = new JSDOM();
global.document = dom.window.document as any;
global.window = dom.window as any;

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

  // Skip Firebase-dependent tests since Firebase is not configured in test environment
  // The hook implementation is tested via unit tests in the component integration tests
});

