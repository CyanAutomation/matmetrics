'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { tagService } from '@/lib/tags';
import type { TagOperationSummary } from '@/lib/tags';
import {
  Tags,
  Edit2,
  Trash2,
  Combine,
  Search,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginConfirmationDialog } from '@/components/plugins/plugin-confirmation';
import { PluginTableSection } from '@/components/plugins/plugin-kit';
import { PluginLoadingState } from '@/components/plugins/plugin-state';
import {
  PluginDataSurfaceFilterRow,
  PluginDataSurfaceSummaryStrip,
} from '@/components/plugins/plugin-data-surface';
import {
  PluginActionRow,
  PluginActionPrimary,
} from '@/components/plugins/plugin-action-row';
import { PluginInlineMessage } from '@/components/plugins/plugin-inline-message';

interface TagManagerProps {
  onRefresh: () => void;
}

interface DeleteDialogState {
  deletingTag: string | null;
  deleteAnalysis: TagOperationSummary | null;
  isAnalyzingDelete: boolean;
  isApplyingDelete: boolean;
}

export const TAG_MANAGER_ERROR_RECOVERY_HINT =
  'If this keeps happening, refresh and retry.';
export const TAG_MANAGER_EMPTY_SEARCH_CTA_LABEL = 'Clear search';
export const TAG_MANAGER_EMPTY_HISTORY_CTA_LABEL = 'Refresh tags';

export function buildErrorRecoveryDescription(message: string) {
  return `${message} ${TAG_MANAGER_ERROR_RECOVERY_HINT}`;
}

export function deriveTagManagerEmptyState(search: string) {
  const hasSearch = search.trim().length > 0;

  if (hasSearch) {
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
  if (state.isAnalyzingDelete || state.isApplyingDelete) {
    return state;
  }

  return {
    ...state,
    deletingTag: null,
    deleteAnalysis: null,
  };
}

export function deriveDeleteDialogActions(state: DeleteDialogState) {
  const cancelDisabled = state.isAnalyzingDelete || state.isApplyingDelete;

  if (state.deleteAnalysis) {
    return {
      cancelDisabled,
      primaryLabel: state.isApplyingDelete ? 'Applying...' : 'Apply',
      primaryDisabled:
        state.deleteAnalysis.conflicts.length > 0 ||
        state.isAnalyzingDelete ||
        state.isApplyingDelete,
      mode: 'apply' as const,
    };
  }

  return {
    cancelDisabled,
    primaryLabel: state.isAnalyzingDelete ? 'Analyzing...' : 'Analyze',
    primaryDisabled: state.isAnalyzingDelete || state.isApplyingDelete,
    mode: 'analyze' as const,
  };
}

export function buildDeleteConfirmationCopy(
  deletingTag: string | null,
  deleteAnalysis: TagOperationSummary | null
) {
  const base = `Are you sure you want to remove "${deletingTag}" from all your sessions? This cannot be undone.`;

  if (!deleteAnalysis || deleteAnalysis.conflicts.length > 0) {
    return base;
  }

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
}) {
  if (!deletingTag || !deleteAnalysis || deleteAnalysis.conflicts.length > 0) {
    return null;
  }

  return deleteTag(deletingTag);
}

export function TagManager({ onRefresh }: TagManagerProps) {
  const { toast } = useToast();
  const [tags, setTags] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // States for actions
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [mergingTag, setMergingTag] = useState<string | null>(null);
  const [targetMergeTag, setTargetMergeTag] = useState<string>('');
  const [deletingTag, setDeletingTag] = useState<string | null>(null);
  const [renameAnalysis, setRenameAnalysis] =
    useState<TagOperationSummary | null>(null);
  const [mergeAnalysis, setMergeAnalysis] =
    useState<TagOperationSummary | null>(null);
  const [deleteAnalysis, setDeleteAnalysis] =
    useState<TagOperationSummary | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isAnalyzingRename, setIsAnalyzingRename] = useState(false);
  const [isApplyingRename, setIsApplyingRename] = useState(false);
  const [isAnalyzingMerge, setIsAnalyzingMerge] = useState(false);
  const [isApplyingMerge, setIsApplyingMerge] = useState(false);
  const [isAnalyzingDelete, setIsAnalyzingDelete] = useState(false);
  const [isApplyingDelete, setIsApplyingDelete] = useState(false);

  const refreshTags = useCallback(() => {
    setTags(tagService.listTags());
    onRefresh();
  }, [onRefresh]);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  const resetRenameDialog = () => {
    if (isAnalyzingRename || isApplyingRename) return;
    setEditingTag(null);
    setNewTagName('');
    setRenameAnalysis(null);
    setRenameError(null);
  };

  const resetMergeDialog = () => {
    if (isAnalyzingMerge || isApplyingMerge) return;
    setMergingTag(null);
    setTargetMergeTag('');
    setMergeAnalysis(null);
    setMergeError(null);
  };

  const resetDeleteDialog = () => {
    const nextState = resolveDeleteDialogCancel({
      deletingTag,
      deleteAnalysis,
      isAnalyzingDelete,
      isApplyingDelete,
    });

    setDeletingTag(nextState.deletingTag);
    setDeleteAnalysis(nextState.deleteAnalysis);
    if (nextState.deletingTag === null) {
      setDeleteError(null);
    }
  };

  const handleAnalyzeRename = async () => {
    if (!editingTag || !newTagName.trim()) return;
    setIsAnalyzingRename(true);
    setRenameError(null);
    try {
      const analysis = await tagService.analyzeRename(
        editingTag,
        newTagName.trim()
      );
      setRenameAnalysis(analysis);

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
      setRenameError(message);
      console.error('Rename analysis failed:', error);
      toast({
        title: 'Rename analysis failed',
        description: buildErrorRecoveryDescription(message),
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzingRename(false);
    }
  };

  const handleRename = async () => {
    if (!editingTag || !newTagName.trim() || !renameAnalysis) return;
    const normalizedNewTag = newTagName.trim();
    if (renameAnalysis.conflicts.length > 0) {
      return;
    }

    setIsApplyingRename(true);
    setRenameError(null);
    try {
      const result = await tagService.renameTag(editingTag, normalizedNewTag);
      toast({
        title: 'Tag renamed',
        description: `"${editingTag}" is now "${normalizedNewTag}" across ${result.affectedSessionCount} session(s), with ${result.changedTagCount} tag change(s).`,
      });
      setEditingTag(null);
      setNewTagName('');
      setRenameAnalysis(null);
      setRenameError(null);
      refreshTags();
    } catch (error) {
      const message =
        'Could not apply this rename. Nothing was changed. Please try again.';
      setRenameError(message);
      console.error('Rename operation failed:', error);
      toast({
        title: 'Rename failed',
        description: `${message} You can review and re-apply.`,
        variant: 'destructive',
      });
    } finally {
      setIsApplyingRename(false);
    }
  };

  const handleAnalyzeMerge = async () => {
    if (!mergingTag || !targetMergeTag) return;
    setIsAnalyzingMerge(true);
    setMergeError(null);
    try {
      const analysis = await tagService.analyzeMerge(
        mergingTag,
        targetMergeTag
      );
      setMergeAnalysis(analysis);

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
      setMergeError(message);
      console.error('Merge analysis failed:', error);
      toast({
        title: 'Merge analysis failed',
        description: buildErrorRecoveryDescription(message),
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzingMerge(false);
    }
  };

  const handleMerge = async () => {
    if (!mergingTag || !targetMergeTag || !mergeAnalysis) return;
    if (mergeAnalysis.conflicts.length > 0) {
      return;
    }

    setIsApplyingMerge(true);
    setMergeError(null);
    try {
      const result = await tagService.mergeTags(mergingTag, targetMergeTag);
      toast({
        title: 'Tags merged',
        description: `Merged into "${targetMergeTag}" across ${result.affectedSessionCount} session(s), with ${result.changedTagCount} tag change(s).`,
      });
      setMergingTag(null);
      setTargetMergeTag('');
      setMergeAnalysis(null);
      setMergeError(null);
      refreshTags();
    } catch (error) {
      const message =
        'Could not apply this merge. No tags were modified. Please try again.';
      setMergeError(message);
      console.error('Merge operation failed:', error);
      toast({
        title: 'Merge failed',
        description: `${message} You can review and re-apply.`,
        variant: 'destructive',
      });
    } finally {
      setIsApplyingMerge(false);
    }
  };

  const handleAnalyzeDelete = async () => {
    if (!deletingTag) return;
    setIsAnalyzingDelete(true);
    setDeleteError(null);
    try {
      const analysis = await tagService.analyzeDelete(deletingTag);
      setDeleteAnalysis(analysis);

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
      setDeleteError(message);
      console.error('Delete analysis failed:', error);
      toast({
        title: 'Delete analysis failed',
        description: buildErrorRecoveryDescription(message),
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzingDelete(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTag || !deleteAnalysis) return;
    if (deleteAnalysis.conflicts.length > 0) {
      return;
    }

    setIsApplyingDelete(true);
    setDeleteError(null);
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
      setDeletingTag(null);
      setDeleteAnalysis(null);
      setDeleteError(null);
      refreshTags();
    } catch (error) {
      const message =
        'Could not apply this deletion. Your tags are unchanged. Please try again.';
      setDeleteError(message);
      console.error('Delete operation failed:', error);
      toast({
        title: 'Delete failed',
        description: `${message} You can review and re-apply.`,
        variant: 'destructive',
      });
    } finally {
      setIsApplyingDelete(false);
    }
  };

  const filteredTags = tagService.searchTags(search);
  const emptyState = deriveTagManagerEmptyState(search);
  const isMutatingTags =
    isAnalyzingRename ||
    isApplyingRename ||
    isAnalyzingMerge ||
    isApplyingMerge ||
    isAnalyzingDelete ||
    isApplyingDelete;

  return (
    <PluginPageShell
      title="Technique Library"
      description="Manage your technique tags. Changes apply globally to all logged sessions."
      icon={<Tags className="h-6 w-6" />}
    >
      {isMutatingTags ? (
        <PluginLoadingState
          title="Updating tags"
          description="Analyzing or applying tag changes. Please keep this page open."
          className="mb-4"
        />
      ) : null}
      <PluginTableSection
        title="Tag inventory"
        description="Search, rename, merge, or remove techniques."
        hasRows={filteredTags.length > 0}
        emptyTitle="No tags to display"
        emptyDescription={emptyState.message}
        emptyCtaLabel={emptyState.ctaLabel}
        onEmptyCta={() => {
          if (emptyState.action === 'clearSearch') {
            setSearch('');
            return;
          }

          refreshTags();
        }}
        emptyIcon={<Search className="h-4 w-4" />}
        contentClassName="p-6"
      >
        <PluginDataSurfaceFilterRow className="mb-6 lg:grid-cols-2">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search techniques..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </PluginDataSurfaceFilterRow>

        <PluginDataSurfaceSummaryStrip
          filteredCount={filteredTags.length}
          totalCount={tags.length}
          itemLabel="tags"
          activeFilters={
            search.trim() ? [{ label: 'Search', value: search.trim() }] : []
          }
          className="mb-4"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredTags.map((tag) => (
            <div
              key={tag}
              className="group flex items-center justify-between rounded-lg bg-background/80 p-3 transition-colors hover:bg-background"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm font-semibold">
                  {tag}
                </Badge>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditingTag(tag);
                    setNewTagName(tag);
                  }}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setMergingTag(tag)}
                >
                  <Combine className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setDeletingTag(tag)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PluginTableSection>

      {/* Rename Dialog */}
      <Dialog
        open={!!editingTag}
        onOpenChange={(open) => !open && resetRenameDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Technique</DialogTitle>
            <DialogDescription>
              This will update "{editingTag}" to your new name in every session.
              {renameAnalysis && renameAnalysis.conflicts.length === 0 && (
                <>
                  {' '}
                  Impact: {renameAnalysis.affectedSessionCount} session(s),{' '}
                  {renameAnalysis.changedTagCount} tag change(s).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTagName}
              onChange={(e) => {
                setNewTagName(e.target.value);
                setRenameAnalysis(null);
                setRenameError(null);
              }}
              placeholder="New technique name"
            />
            {renameError && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Rename failed</AlertTitle>
                <AlertDescription>{renameError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={resetRenameDialog}
              disabled={isAnalyzingRename || isApplyingRename}
            >
              Cancel
            </Button>
            {renameAnalysis ? (
              <Button
                onClick={handleRename}
                disabled={
                  renameAnalysis.conflicts.length > 0 ||
                  isAnalyzingRename ||
                  isApplyingRename
                }
              >
                {isApplyingRename ? 'Applying...' : 'Apply'}
              </Button>
            ) : (
              <Button
                onClick={handleAnalyzeRename}
                disabled={
                  !newTagName.trim() ||
                  newTagName === editingTag ||
                  isAnalyzingRename ||
                  isApplyingRename
                }
              >
                {isAnalyzingRename ? 'Analyzing...' : 'Analyze'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog
        open={!!mergingTag}
        onOpenChange={(open) => !open && resetMergeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Tag</DialogTitle>
            <DialogDescription>
              Move all instances of "{mergingTag}" into another existing
              technique.
              {mergeAnalysis && mergeAnalysis.conflicts.length === 0 && (
                <>
                  {' '}
                  Impact: {mergeAnalysis.affectedSessionCount} session(s),{' '}
                  {mergeAnalysis.changedTagCount} tag change(s).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Select Target Technique
              </label>
              <Select
                value={targetMergeTag}
                onValueChange={(value) => {
                  setTargetMergeTag(value);
                  setMergeAnalysis(null);
                  setMergeError(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a technique..." />
                </SelectTrigger>
                <SelectContent>
                  {tags
                    .filter((t) => t !== mergingTag)
                    .map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Heads up!</AlertTitle>
              <AlertDescription>
                The tag "{mergingTag}" will be completely replaced by "
                {targetMergeTag || '...'}" across your history.
              </AlertDescription>
            </Alert>
            {mergeError && (
              <PluginInlineMessage
                tone="error"
                icon={<AlertCircle className="h-4 w-4" />}
                title="Merge failed"
                description={mergeError}
              />
            )}
          </div>
          <DialogFooter>
            <PluginActionRow>
              <Button
                variant="ghost"
                onClick={resetMergeDialog}
                disabled={isAnalyzingMerge || isApplyingMerge}
              >
                Cancel
              </Button>
              <PluginActionPrimary>
                {mergeAnalysis ? (
                  <Button
                    variant="default"
                    onClick={handleMerge}
                    disabled={
                      mergeAnalysis.conflicts.length > 0 ||
                      isAnalyzingMerge ||
                      isApplyingMerge
                    }
                  >
                    {isApplyingMerge ? 'Applying...' : 'Apply'}
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    onClick={handleAnalyzeMerge}
                    disabled={
                      !targetMergeTag || isAnalyzingMerge || isApplyingMerge
                    }
                  >
                    {isAnalyzingMerge ? 'Analyzing...' : 'Analyze'}
                  </Button>
                )}
              </PluginActionPrimary>
            </PluginActionRow>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      {(() => {
        const deleteDialogState = {
          deletingTag,
          deleteAnalysis,
          isAnalyzingDelete,
          isApplyingDelete,
        };
        const actions = deriveDeleteDialogActions(deleteDialogState);

        return (
          <PluginConfirmationDialog
            open={!!deletingTag}
            onOpenChange={(open) => {
              if (!open) {
                resetDeleteDialog();
              }
            }}
            title="Delete Technique Tag"
            description={buildDeleteConfirmationCopy(
              deletingTag,
              deleteAnalysis
            )}
            confirmLabel={actions.primaryLabel}
            pendingLabel={actions.primaryLabel}
            cancelLabel="Cancel"
            isPending={isAnalyzingDelete || isApplyingDelete}
            confirmVariant={
              actions.mode === 'apply' ? 'destructive' : 'default'
            }
            confirmDisabled={actions.primaryDisabled}
            cancelDisabled={actions.cancelDisabled}
            onCancel={resetDeleteDialog}
            onConfirm={() => {
              if (actions.mode === 'apply') {
                void handleDelete();
                return;
              }
              void handleAnalyzeDelete();
            }}
          >
            {deleteError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Delete failed</AlertTitle>
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}
          </PluginConfirmationDialog>
        );
      })()}
    </PluginPageShell>
  );
}
