'use client';

import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { tagService, type TagOperationSummary } from '@/lib/tags';
import {
  buildErrorRecoveryDescription,
  runDeleteConfirmation,
} from './tag-manager-view-model';

interface UseTagManagerOperationsProps {
  editingTag: string | null;
  newTagName: string;
  mergingTag: string | null;
  targetMergeTag: string;
  deletingTag: string | null;
  renameAnalysis: TagOperationSummary | null;
  mergeAnalysis: TagOperationSummary | null;
  deleteAnalysis: TagOperationSummary | null;
  isAnalyzingRename: boolean;
  isApplyingRename: boolean;
  isAnalyzingMerge: boolean;
  isApplyingMerge: boolean;
  isAnalyzingDelete: boolean;
  isApplyingDelete: boolean;
  onSetEditingTag: (tag: string | null) => void;
  onSetNewTagName: (name: string) => void;
  onSetRenameAnalysis: (analysis: TagOperationSummary | null) => void;
  onSetRenameError: (error: string | null) => void;
  onSetIsAnalyzingRename: (loading: boolean) => void;
  onSetIsApplyingRename: (loading: boolean) => void;
  onSetMergingTag: (tag: string | null) => void;
  onSetTargetMergeTag: (tag: string) => void;
  onSetMergeAnalysis: (analysis: TagOperationSummary | null) => void;
  onSetMergeError: (error: string | null) => void;
  onSetIsAnalyzingMerge: (loading: boolean) => void;
  onSetIsApplyingMerge: (loading: boolean) => void;
  onSetDeletingTag: (tag: string | null) => void;
  onSetDeleteAnalysis: (analysis: TagOperationSummary | null) => void;
  onSetDeleteError: (error: string | null) => void;
  onSetIsAnalyzingDelete: (loading: boolean) => void;
  onSetIsApplyingDelete: (loading: boolean) => void;
  onRefreshTags: () => void;
}

/**
 * Custom hook that consolidates tag operation handlers (rename, merge, delete).
 * Reduces component complexity by extracting async operation logic.
 */
export function useTagManagerOperations({
  editingTag,
  newTagName,
  mergingTag,
  targetMergeTag,
  deletingTag,
  renameAnalysis,
  mergeAnalysis,
  deleteAnalysis,
  isAnalyzingRename: _isAnalyzingRename,
  isApplyingRename: _isApplyingRename,
  isAnalyzingMerge: _isAnalyzingMerge,
  isApplyingMerge: _isApplyingMerge,
  isAnalyzingDelete: _isAnalyzingDelete,
  isApplyingDelete: _isApplyingDelete,
  onSetEditingTag,
  onSetNewTagName,
  onSetRenameAnalysis,
  onSetRenameError,
  onSetIsAnalyzingRename,
  onSetIsApplyingRename,
  onSetMergingTag,
  onSetTargetMergeTag,
  onSetMergeAnalysis,
  onSetMergeError,
  onSetIsAnalyzingMerge,
  onSetIsApplyingMerge,
  onSetDeletingTag,
  onSetDeleteAnalysis,
  onSetDeleteError,
  onSetIsAnalyzingDelete,
  onSetIsApplyingDelete,
  onRefreshTags,
}: UseTagManagerOperationsProps) {
  const { toast } = useToast();

  const handleAnalyzeRename = useCallback(async () => {
    if (!editingTag || !newTagName.trim()) return;
    onSetIsAnalyzingRename(true);
    onSetRenameError(null);
    try {
      const analysis = await tagService.analyzeRename(
        editingTag,
        newTagName.trim()
      );
      onSetRenameAnalysis(analysis);

      if (analysis.conflicts.length > 0) {
        toast({
          title: 'Unable to rename tag',
          description: analysis.conflicts[0].message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      const message =
        'Could not analyze this rename. Check the tag name and try again.';
      onSetRenameError(message);
      console.error('Rename analysis failed:', error);
      toast({
        title: 'Rename analysis failed',
        description: buildErrorRecoveryDescription(message),
        variant: 'destructive',
      });
    } finally {
      onSetIsAnalyzingRename(false);
    }
  }, [
    editingTag,
    newTagName,
    onSetIsAnalyzingRename,
    onSetRenameError,
    onSetRenameAnalysis,
    toast,
  ]);

  const handleRename = useCallback(async () => {
    if (!editingTag || !newTagName.trim() || !renameAnalysis) return;
    const normalizedNewTag = newTagName.trim();
    if (renameAnalysis.conflicts.length > 0) {
      return;
    }

    onSetIsApplyingRename(true);
    onSetRenameError(null);
    try {
      const result = await tagService.renameTag(editingTag, normalizedNewTag);
      toast({
        title: 'Tag renamed',
        description: `"${editingTag}" is now "${normalizedNewTag}" across ${result.affectedSessionCount} session(s), with ${result.changedTagCount} tag change(s).`,
      });
      onSetEditingTag(null);
      onSetNewTagName('');
      onSetRenameAnalysis(null);
      onSetRenameError(null);
      onRefreshTags();
    } catch (error) {
      const message =
        'Could not apply this rename. Nothing was changed. Please try again.';
      onSetRenameError(message);
      console.error('Rename operation failed:', error);
      toast({
        title: 'Rename failed',
        description: `${message} You can review and re-apply.`,
        variant: 'destructive',
      });
    } finally {
      onSetIsApplyingRename(false);
    }
  }, [
    editingTag,
    newTagName,
    renameAnalysis,
    onSetIsApplyingRename,
    onSetRenameError,
    onSetEditingTag,
    onSetNewTagName,
    onSetRenameAnalysis,
    onRefreshTags,
    toast,
  ]);

  const handleAnalyzeMerge = useCallback(async () => {
    if (!mergingTag || !targetMergeTag) return;
    onSetIsAnalyzingMerge(true);
    onSetMergeError(null);
    try {
      const analysis = await tagService.analyzeMerge(
        mergingTag,
        targetMergeTag
      );
      onSetMergeAnalysis(analysis);

      if (analysis.conflicts.length > 0) {
        toast({
          title: 'Unable to merge tags',
          description: analysis.conflicts[0].message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      const message =
        'Could not analyze this merge. Confirm the target tag and try again.';
      onSetMergeError(message);
      console.error('Merge analysis failed:', error);
      toast({
        title: 'Merge analysis failed',
        description: buildErrorRecoveryDescription(message),
        variant: 'destructive',
      });
    } finally {
      onSetIsAnalyzingMerge(false);
    }
  }, [
    mergingTag,
    targetMergeTag,
    onSetIsAnalyzingMerge,
    onSetMergeError,
    onSetMergeAnalysis,
    toast,
  ]);

  const handleMerge = useCallback(async () => {
    if (!mergingTag || !targetMergeTag || !mergeAnalysis) return;
    if (mergeAnalysis.conflicts.length > 0) {
      return;
    }

    onSetIsApplyingMerge(true);
    onSetMergeError(null);
    try {
      const result = await tagService.mergeTags(mergingTag, targetMergeTag);
      toast({
        title: 'Tags merged',
        description: `Merged into "${targetMergeTag}" across ${result.affectedSessionCount} session(s), with ${result.changedTagCount} tag change(s).`,
      });
      onSetMergingTag(null);
      onSetTargetMergeTag('');
      onSetMergeAnalysis(null);
      onSetMergeError(null);
      onRefreshTags();
    } catch (error) {
      const message =
        'Could not apply this merge. No tags were modified. Please try again.';
      onSetMergeError(message);
      console.error('Merge operation failed:', error);
      toast({
        title: 'Merge failed',
        description: `${message} You can review and re-apply.`,
        variant: 'destructive',
      });
    } finally {
      onSetIsApplyingMerge(false);
    }
  }, [
    mergingTag,
    targetMergeTag,
    mergeAnalysis,
    onSetIsApplyingMerge,
    onSetMergeError,
    onSetMergingTag,
    onSetTargetMergeTag,
    onSetMergeAnalysis,
    onRefreshTags,
    toast,
  ]);

  const handleAnalyzeDelete = useCallback(async () => {
    if (!deletingTag) return;
    onSetIsAnalyzingDelete(true);
    onSetDeleteError(null);
    try {
      const analysis = await tagService.analyzeDelete(deletingTag);
      onSetDeleteAnalysis(analysis);

      if (analysis.conflicts.length > 0) {
        toast({
          title: 'Unable to delete tag',
          description: analysis.conflicts[0].message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      const message =
        'Could not analyze this deletion. Please try again in a moment.';
      onSetDeleteError(message);
      console.error('Delete analysis failed:', error);
      toast({
        title: 'Delete analysis failed',
        description: buildErrorRecoveryDescription(message),
        variant: 'destructive',
      });
    } finally {
      onSetIsAnalyzingDelete(false);
    }
  }, [
    deletingTag,
    onSetIsAnalyzingDelete,
    onSetDeleteError,
    onSetDeleteAnalysis,
    toast,
  ]);

  const handleDelete = useCallback(async () => {
    if (!deletingTag || !deleteAnalysis) return;
    if (deleteAnalysis.conflicts.length > 0) {
      return;
    }

    onSetIsApplyingDelete(true);
    onSetDeleteError(null);
    try {
      const result = await runDeleteConfirmation({
        deletingTag,
        deleteAnalysis,
        deleteTag: tagService.deleteTag,
      });

      if (!result) {
        return;
      }
      toast({
        title: 'Tag deleted',
        description: `"${deletingTag}" was removed from ${result.affectedSessionCount} session(s), with ${result.changedTagCount} tag change(s).`,
      });
      onSetDeletingTag(null);
      onSetDeleteAnalysis(null);
      onSetDeleteError(null);
      onRefreshTags();
    } catch (error) {
      const message =
        'Could not apply this deletion. Your tags are unchanged. Please try again.';
      onSetDeleteError(message);
      console.error('Delete operation failed:', error);
      toast({
        title: 'Delete failed',
        description: `${message} You can review and re-apply.`,
        variant: 'destructive',
      });
    } finally {
      onSetIsApplyingDelete(false);
    }
  }, [
    deletingTag,
    deleteAnalysis,
    onSetIsApplyingDelete,
    onSetDeleteError,
    onSetDeletingTag,
    onSetDeleteAnalysis,
    onRefreshTags,
    toast,
  ]);

  return {
    handleAnalyzeRename,
    handleRename,
    handleAnalyzeMerge,
    handleMerge,
    handleAnalyzeDelete,
    handleDelete,
  };
}
