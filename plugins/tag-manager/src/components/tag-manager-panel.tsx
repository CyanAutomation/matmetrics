'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { tagService } from '@/lib/tags';
import { Tags, Search, AlertCircle } from 'lucide-react';
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
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginConfirmationDialog } from '@/components/plugins/plugin-confirmation';
import { PluginTableSection } from '@/components/plugins/plugin-kit';
import { PluginLoadingState } from '@/components/plugins/plugin-state';
import {
  PluginActionRow,
  PluginActionPrimary,
} from '@/components/plugins/plugin-action-row';
import { PluginInlineMessage } from '@/components/plugins/plugin-inline-message';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { useTagManagerData } from './use-tag-manager-data';
import { useTagManagerDialogState } from './use-tag-manager-dialog-state';
import { TagManagerInventory } from './tag-manager-inventory';
export {
  buildDeleteConfirmationCopy,
  buildErrorRecoveryDescription,
  deriveDeleteDialogActions,
  deriveTagManagerEmptyState,
  resolveDeleteDialogCancel,
  runDeleteConfirmation,
  TAG_MANAGER_EMPTY_HISTORY_CTA_LABEL,
  TAG_MANAGER_EMPTY_SEARCH_CTA_LABEL,
} from './tag-manager-view-model';
import {
  buildDeleteConfirmationCopy,
  buildErrorRecoveryDescription,
  deriveDeleteDialogActions,
  deriveTagManagerEmptyState,
  resolveDeleteDialogCancel,
  runDeleteConfirmation,
} from './tag-manager-view-model';

export interface TagManagerProps {
  onRefresh: () => void;
}

export function TagManager({ onRefresh }: TagManagerProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const { tags, refreshTags } = useTagManagerData(onRefresh);

  // States for actions
  const {
    editingTag,
    setEditingTag,
    newTagName,
    setNewTagName,
    mergingTag,
    setMergingTag,
    targetMergeTag,
    setTargetMergeTag,
    deletingTag,
    setDeletingTag,
    renameAnalysis,
    setRenameAnalysis,
    mergeAnalysis,
    setMergeAnalysis,
    deleteAnalysis,
    setDeleteAnalysis,
    renameError,
    setRenameError,
    mergeError,
    setMergeError,
    deleteError,
    setDeleteError,
    isAnalyzingRename,
    setIsAnalyzingRename,
    isApplyingRename,
    setIsApplyingRename,
    isAnalyzingMerge,
    setIsAnalyzingMerge,
    isApplyingMerge,
    setIsApplyingMerge,
    isAnalyzingDelete,
    setIsAnalyzingDelete,
    isApplyingDelete,
    setIsApplyingDelete,
  } = useTagManagerDialogState();

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
      title="Tag Manager"
      description="Search, rename, merge, or remove tagged techniques."
      icon={<Tags className="h-6 w-6" />}
      headerActions={
        <div className="relative w-full sm:w-80">
          <Search
            className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${getPluginUiTokenClassNames('icon.subtle')}`}
          />
          <Input
            aria-label="Search tags"
            placeholder="Search tags..."
            className="h-11 pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      }
    >
      {isMutatingTags ? (
        <PluginLoadingState
          title="Updating tags"
          description="Analyzing or applying tag changes. Please keep this page open."
          className="mb-4"
        />
      ) : null}
      <PluginTableSection
        hasRows={filteredTags.length > 0}
        emptyTitle="No tags to display"
        emptyDescription={emptyState.message}
        emptyCtaLabel={emptyState.ctaLabel}
        onEmptyCta={() => {
          if (emptyState.action === 'clearSearch') setSearch('');
          else refreshTags();
        }}
        emptyIcon={<Search className="h-4 w-4" />}
      >
        <TagManagerInventory
          tags={tags}
          filteredTags={filteredTags}
          search={search}
          onRename={(tag) => {
            setEditingTag(tag);
            setNewTagName(tag);
          }}
          onMerge={setMergingTag}
          onDelete={setDeletingTag}
        />
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
              <PluginInlineMessage
                tone="error"
                className="mt-4"
                icon={<AlertCircle className="h-4 w-4" />}
                title="Rename failed"
                description={renameError}
              />
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
            <PluginInlineMessage
              tone="warning"
              icon={<AlertCircle className="h-4 w-4" />}
              title="Heads up!"
              description={
                <>
                  The tag "{mergingTag}" will be completely replaced by "
                  {targetMergeTag || '...'}" across your history.
                </>
              }
            />
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
              <PluginInlineMessage
                tone="error"
                icon={<AlertCircle className="h-4 w-4" />}
                title="Delete failed"
                description={deleteError}
              />
            )}
          </PluginConfirmationDialog>
        );
      })()}
    </PluginPageShell>
  );
}
