export type AuditSummaryAction = {
  label: string;
  onClick: () => void;
  disabled: boolean;
};

export function createAuditSummaryAction(params: {
  auditRanAt: string | null;
  auditNeedsAttentionCount: number;
  auditStep: 'run-check' | 'review-findings' | 'resolve-findings';
  auditFeedbackState: string;
  firstSessionNeedingAttention: { sessionId: string } | undefined | null;
  onRunAudit: () => void;
  onReviewSession: (sessionId: string) => void;
  onReviewFindings: () => void;
}): AuditSummaryAction {
  if (!params.auditRanAt) {
    return {
      label: 'Run check',
      onClick: params.onRunAudit,
      disabled: params.auditFeedbackState === 'loading',
    };
  }

  if (params.auditNeedsAttentionCount > 0) {
    if (
      params.auditStep === 'resolve-findings' &&
      params.firstSessionNeedingAttention
    ) {
      return {
        label: 'Mark fixed',
        onClick: () =>
          params.onReviewSession(
            params.firstSessionNeedingAttention!.sessionId
          ),
        disabled: false,
      };
    }
    return {
      label: 'Review findings',
      onClick: params.onReviewFindings,
      disabled: false,
    };
  }

  return {
    label: 'Run check again',
    onClick: params.onRunAudit,
    disabled: params.auditFeedbackState === 'loading',
  };
}
