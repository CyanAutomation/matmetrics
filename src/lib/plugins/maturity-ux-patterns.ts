import type { PluginMaturityUxCriterion } from '@/lib/plugins/types';

export type FeatureUxState =
  | 'loading'
  | 'error'
  | 'empty'
  | 'destructiveAction';

export const uxStatePatterns: Record<FeatureUxState, RegExp[]> = {
  loading: [
    /\bloading\b/i,
    /\bisLoading\b/i,
    /\bpending\b/i,
    /\bspinner\b/i,
    /\bskeleton\b/i,
  ],
  error: [/\berror\b/i, /\bfails?\b/i, /\bfailure\b/i, /\balert\b/i],
  empty: [/\bempty\b/i, /\bno data\b/i, /\bno results\b/i, /\bzero state\b/i],
  destructiveAction: [
    /\bdestructive\b/i,
    /\bconfirm(?:ation)?\b/i,
    /\bdelete(?:d|ion)?\b/i,
    /\breset(?:ting)?\b/i,
    /\bremove\b/i,
    /\bdanger\b/i,
  ],
};

export const uxRecoveryPatterns = [
  /\bretry\b/i,
  /\brecover(?:y)?\b/i,
  /\brefresh\b/i,
  /\btry again\b/i,
];

export const uxCtaPatterns = [
  /\bcta\b/i,
  /\baction\b/i,
  /\badd\b/i,
  /\bcreate\b/i,
  /\bconfigure\b/i,
  /\bretry\b/i,
  /\bsync\b/i,
];

export const uxCancelPatterns = [/\bcancel(?:ed|lation)?\b/i, /\bundo\b/i];
export const uxConfirmationPatterns = [/\bconfirm(?:ation)?\b/i];
export const assertionAnchorPattern =
  /\b(expect\s*\(|assert\.[a-z]+|getBy[A-Z]\w*|findBy[A-Z]\w*|queryBy[A-Z]\w*)/;

export const uxCriterionLabels: Record<PluginMaturityUxCriterion, string> = {
  loadingStatePresent: 'loading state present',
  errorStateWithRecovery: 'error state present with recovery',
  emptyStateWithCta: 'empty state present with CTA',
  destructiveActionSafety:
    'destructive action confirmation + cancellation path',
};
