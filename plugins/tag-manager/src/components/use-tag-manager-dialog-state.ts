import { useState } from 'react';

import type { TagOperationSummary } from '@/lib/tags';

export function useTagManagerDialogState() {
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [mergingTag, setMergingTag] = useState<string | null>(null);
  const [targetMergeTag, setTargetMergeTag] = useState('');
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

  return {
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
  };
}
