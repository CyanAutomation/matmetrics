'use client';

import './tag-manager-panel';

export {
  TagManager,
  buildDeleteConfirmationCopy,
  buildErrorRecoveryDescription,
  deriveDeleteDialogActions,
  deriveTagManagerEmptyState,
  resolveDeleteDialogCancel,
  runDeleteConfirmation,
  TAG_MANAGER_EMPTY_HISTORY_CTA_LABEL,
  TAG_MANAGER_EMPTY_SEARCH_CTA_LABEL,
} from './tag-manager-panel';
export type { TagManagerProps } from './tag-manager-panel';
