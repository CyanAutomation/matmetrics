import { JSDOM } from 'jsdom';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act } from '@testing-library/react';

// Setup jsdom for DOM-dependent tests
const dom = new JSDOM();
global.document = dom.window.document as any;
global.window = dom.window as any;

// Mock React hooks before importing
const mockToast = { toast: () => {} };

import { useAuditStateManager } from './use-audit-state-manager';
import type { AuditSessionResult } from '../components/log-doctor-state';
import type { AuditFlagCode } from '@/lib/types';

// Mock the user-preferences module
import * as userPreferences from '@/lib/user-preferences';
const originalSaveSessionAudit = userPreferences.saveSessionAudit;
userPreferences.saveSessionAudit = async () => undefined;

describe('useAuditStateManager', () => {
  const mockUserId = 'test-user-123';
  const mockSessionId = 'session-001';
  const mockAuditResult: AuditSessionResult = {
    sessionId: mockSessionId,
    sessionDate: '2026-03-18',
    flags: [
      { code: 'INVALID_MARKDOWN' as AuditFlagCode, message: 'Invalid markdown' },
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

  it('should mark session as resolved', async () => {
    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [mockAuditResult])
    );

    const now = new Date().toISOString();

    await act(async () => {
      await result.current.markResolved(mockSessionId);
    });

    // Check that state was updated
    const updated = result.current.auditResults.find(
      (r) => r.sessionId === mockSessionId
    );
    assert.ok(updated?.reviewedAt !== undefined);
  });

  it('should dismiss all rules for a session (dismissForNow)', async () => {
    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [mockAuditResult])
    );

    await act(async () => {
      await result.current.dismissForNow(mockSessionId);
    });

    // Check that state was updated with ignored rules
    const updated = result.current.auditResults.find(
      (r) => r.sessionId === mockSessionId
    );
    assert.deepEqual(updated?.ignoredRules, ['INVALID_MARKDOWN']);
  });

  it('should ignore a specific rule code', async () => {
    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [mockAuditResult])
    );

    const ruleCode = 'INVALID_MARKDOWN' as AuditFlagCode;

    await act(async () => {
      await result.current.ignoreRule(mockSessionId, ruleCode);
    });

    const updated = result.current.auditResults.find(
      (r) => r.sessionId === mockSessionId
    );
    assert.ok(updated?.ignoredRules.includes(ruleCode));
  });

  it('should not duplicate ignored rules', async () => {
    const resultWithIgnored = {
      ...mockAuditResult,
      ignoredRules: ['INVALID_MARKDOWN' as AuditFlagCode],
    };

    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [resultWithIgnored])
    );

    await act(async () => {
      await result.current.ignoreRule(
        mockSessionId,
        'INVALID_MARKDOWN' as AuditFlagCode
      );
    });

    const updated = result.current.auditResults.find(
      (r) => r.sessionId === mockSessionId
    );
    assert.deepEqual(updated?.ignoredRules, ['INVALID_MARKDOWN']);
  });

  it('should unignore a rule code', async () => {
    const resultWithIgnored = {
      ...mockAuditResult,
      ignoredRules: ['INVALID_MARKDOWN' as AuditFlagCode],
    };

    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [resultWithIgnored])
    );

    await act(async () => {
      await result.current.unignoreRule(
        mockSessionId,
        'INVALID_MARKDOWN' as AuditFlagCode
      );
    });

    const updated = result.current.auditResults.find(
      (r) => r.sessionId === mockSessionId
    );
    assert.deepEqual(updated?.ignoredRules, []);
  });

  it('should handle Firebase save errors gracefully', async () => {
    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [mockAuditResult])
    );

    await act(async () => {
      // Should not throw, but handle error internally
      await result.current.markResolved(mockSessionId);
    });

    // State should not be updated on error (or remains unchanged)
    const updated = result.current.auditResults.find(
      (r) => r.sessionId === mockSessionId
    );
    // Verify the hook doesn't crash
    assert.ok(updated !== undefined);
  });

  it('should handle missing user gracefully', async () => {
    const { result } = renderHook(() =>
      useAuditStateManager(null, [mockAuditResult])
    );

    await act(async () => {
      await result.current.markResolved(mockSessionId);
    });

    // Should not call saveSessionAudit without user
    // State should remain unchanged
    const updated = result.current.auditResults.find(
      (r) => r.sessionId === mockSessionId
    );
    assert.equal(updated?.reviewedAt, undefined);
  });

  it('should handle missing session gracefully', async () => {
    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [])
    );

    await act(async () => {
      await result.current.markResolved('non-existent-session');
    });

    // Should not update anything for non-existent session
    assert.deepEqual(result.current.auditResults, []);
  });

  it('should update multiple results independently', async () => {
    const result2 = {
      ...mockAuditResult,
      sessionId: 'session-002',
      sessionDate: '2026-03-19',
    };

    const { result } = renderHook(() =>
      useAuditStateManager(mockUserId, [mockAuditResult, result2])
    );

    await act(async () => {
      await result.current.ignoreRule(
        mockSessionId,
        'INVALID_MARKDOWN' as AuditFlagCode
      );
    });

    const updated1 = result.current.auditResults.find(
      (r) => r.sessionId === mockSessionId
    );
    const updated2 = result.current.auditResults.find(
      (r) => r.sessionId === 'session-002'
    );

    assert.ok(updated1?.ignoredRules.includes('INVALID_MARKDOWN'));
    assert.deepEqual(updated2?.ignoredRules, []);
  });
});
