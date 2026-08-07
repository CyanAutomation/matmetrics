import type { TagOperationSummary } from '@/lib/tags';

export interface DeleteDialogState {
  deletingTag: string | null;
  deleteAnalysis: TagOperationSummary | null;
  isAnalyzingDelete: boolean;
  isApplyingDelete: boolean;
}

const TAG_MANAGER_ERROR_RECOVERY_HINT =
  'If this keeps happening, refresh and retry.';
export const TAG_MANAGER_EMPTY_SEARCH_CTA_LABEL = 'Clear search';
export const TAG_MANAGER_EMPTY_HISTORY_CTA_LABEL = 'Refresh tags';

export function buildErrorRecoveryDescription(message: string): string {
  return `${message} ${TAG_MANAGER_ERROR_RECOVERY_HINT}`;
}

export function deriveTagManagerEmptyState(search: string) {
  if (search.trim()) {
    return {
      message: 'No tags match your search.',
      ctaLabel: TAG_MANAGER_EMPTY_SEARCH_CTA_LABEL,
      action: 'clearSearch' as const,
    };
  }

  return {
    message: 'No technique tags found in your history.',
    ctaLabel: TAG_MANAGER_EMPTY_HISTORY_CTA_LABEL,
    action: 'refreshTags' as const,
  };
}

export function resolveDeleteDialogCancel(
  state: DeleteDialogState
): DeleteDialogState {
  if (state.isAnalyzingDelete || state.isApplyingDelete) return state;
  return { ...state, deletingTag: null, deleteAnalysis: null };
}

export function deriveDeleteDialogActions(state: DeleteDialogState) {
  const cancelDisabled = state.isAnalyzingDelete || state.isApplyingDelete;
  if (state.deleteAnalysis) {
    return {
      cancelDisabled,
      primaryLabel: state.isApplyingDelete ? 'Applying...' : 'Apply',
      primaryDisabled:
        state.deleteAnalysis.conflicts.length > 0 || cancelDisabled,
      mode: 'apply' as const,
    };
  }
  return {
    cancelDisabled,
    primaryLabel: state.isAnalyzingDelete ? 'Analyzing...' : 'Analyze',
    primaryDisabled: cancelDisabled,
    mode: 'analyze' as const,
  };
}

export function buildDeleteConfirmationCopy(
  deletingTag: string | null,
  deleteAnalysis: TagOperationSummary | null
): string {
  const base = `Are you sure you want to remove "${deletingTag}" from all your sessions? This cannot be undone.`;
  if (!deleteAnalysis || deleteAnalysis.conflicts.length > 0) return base;
  return `${base} Impact: ${deleteAnalysis.affectedSessionCount} session(s), ${deleteAnalysis.changedTagCount} tag change(s).`;
}

export async function runDeleteConfirmation({
  deletingTag,
  deleteAnalysis,
  deleteTag,
}: {
  deletingTag: string | null;
  deleteAnalysis: TagOperationSummary | null;
  deleteTag: (tag: string) => Promise<TagOperationSummary>;
}): Promise<TagOperationSummary | null> {
  if (!deletingTag || !deleteAnalysis || deleteAnalysis.conflicts.length > 0) {
    return null;
  }
  return deleteTag(deletingTag);
}
