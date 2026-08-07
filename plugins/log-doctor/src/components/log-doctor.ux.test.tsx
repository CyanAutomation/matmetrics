import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuditSummaryAction } from './log-doctor';

test('audit summary action: no audit run yet → shows "Run check" action', () => {
  const onRunAudit = () => {};
  const onReviewSession = () => {};
  const onReviewFindings = () => {};

  const action = createAuditSummaryAction({
    auditRanAt: null,
    auditNeedsAttentionCount: 0,
    auditStep: 'run-check',
    auditFeedbackState: 'idle',
    firstSessionNeedingAttention: null,
    onRunAudit,
    onReviewSession,
    onReviewFindings,
  });

  assert.equal(action.label, 'Run check');
  assert.equal(action.onClick, onRunAudit);
  assert.equal(action.disabled, false);
});

test('audit summary action: audit loading state → disables action', () => {
  const onRunAudit = () => {};
  const onReviewSession = () => {};
  const onReviewFindings = () => {};

  const action = createAuditSummaryAction({
    auditRanAt: null,
    auditNeedsAttentionCount: 0,
    auditStep: 'run-check',
    auditFeedbackState: 'loading',
    firstSessionNeedingAttention: null,
    onRunAudit,
    onReviewSession,
    onReviewFindings,
  });

  assert.equal(action.label, 'Run check');
  assert.equal(action.disabled, true);
});

test('audit summary action: audit ran with no issues → shows "Run check again" action', () => {
  const onRunAudit = () => {};
  const onReviewSession = () => {};
  const onReviewFindings = () => {};

  const action = createAuditSummaryAction({
    auditRanAt: Date.now(),
    auditNeedsAttentionCount: 0,
    auditStep: 'review-findings',
    auditFeedbackState: 'idle',
    firstSessionNeedingAttention: null,
    onRunAudit,
    onReviewSession,
    onReviewFindings,
  });

  assert.equal(action.label, 'Run check again');
  assert.equal(action.onClick, onRunAudit);
  assert.equal(action.disabled, false);
});

test('audit summary action: audit found issues → shows "Review findings" action', () => {
  const onRunAudit = () => {};
  const onReviewSession = () => {};
  const onReviewFindings = () => {};

  const action = createAuditSummaryAction({
    auditRanAt: Date.now(),
    auditNeedsAttentionCount: 3,
    auditStep: 'review-findings',
    auditFeedbackState: 'idle',
    firstSessionNeedingAttention: null,
    onRunAudit,
    onReviewSession,
    onReviewFindings,
  });

  assert.equal(action.label, 'Review findings');
  assert.equal(action.onClick, onReviewFindings);
  assert.equal(action.disabled, false);
});

test('audit summary action: in resolve mode with first session needing attention → shows "Mark fixed" action', () => {
  const onRunAudit = () => {};
  const onReviewSession = () => {};
  const onReviewFindings = () => {};
  const firstSession = { sessionId: 'session-123' };

  const action = createAuditSummaryAction({
    auditRanAt: Date.now(),
    auditNeedsAttentionCount: 5,
    auditStep: 'resolve-findings',
    auditFeedbackState: 'idle',
    firstSessionNeedingAttention: firstSession,
    onRunAudit,
    onReviewSession,
    onReviewFindings,
  });

  assert.equal(action.label, 'Mark fixed');
  assert.equal(action.disabled, false);

  // Verify the onClick calls onReviewSession with correct session ID
  let reviewedSessionId: string | null = null;
  const captureReviewSession = (sessionId: string) => {
    reviewedSessionId = sessionId;
  };

  const actionWithCapture = createAuditSummaryAction({
    auditRanAt: Date.now(),
    auditNeedsAttentionCount: 5,
    auditStep: 'resolve-findings',
    auditFeedbackState: 'idle',
    firstSessionNeedingAttention: firstSession,
    onRunAudit,
    onReviewSession: captureReviewSession,
    onReviewFindings,
  });

  actionWithCapture.onClick();
  assert.equal(reviewedSessionId, 'session-123');
});

test('audit summary action: in resolve mode with issues but no first session → shows "Review findings" action', () => {
  const onRunAudit = () => {};
  const onReviewSession = () => {};
  const onReviewFindings = () => {};

  const action = createAuditSummaryAction({
    auditRanAt: Date.now(),
    auditNeedsAttentionCount: 2,
    auditStep: 'resolve-findings',
    auditFeedbackState: 'idle',
    firstSessionNeedingAttention: null,
    onRunAudit,
    onReviewSession,
    onReviewFindings,
  });

  assert.equal(action.label, 'Review findings');
  assert.equal(action.onClick, onReviewFindings);
  assert.equal(action.disabled, false);
});

test('audit summary action: loading state overrides other conditions → disables even when audit ran', () => {
  const onRunAudit = () => {};
  const onReviewSession = () => {};
  const onReviewFindings = () => {};

  const action = createAuditSummaryAction({
    auditRanAt: Date.now(),
    auditNeedsAttentionCount: 0,
    auditStep: 'review-findings',
    auditFeedbackState: 'loading',
    firstSessionNeedingAttention: null,
    onRunAudit,
    onReviewSession,
    onReviewFindings,
  });

  assert.equal(action.label, 'Run check again');
  assert.equal(action.disabled, true);
});
