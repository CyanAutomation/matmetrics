'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { tagService } from '@/lib/tags';
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

interface TagManagerProps {
  onRefresh: () => void;
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

  const refreshTags = useCallback(() => {
    setTags(tagService.listTags());
    onRefresh();
  }, [onRefresh]);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  const handleRename = async () => {
    if (!editingTag || !newTagName.trim()) return;
    const normalizedNewTag = newTagName.trim();
    const preview = await tagService.renameTag(editingTag, normalizedNewTag, {
      dryRun: true,
    });

    if (preview.conflicts.length > 0) {
      toast({
        title: 'Unable to rename tag',
        description: preview.conflicts[0].message,
        variant: 'destructive',
      });
      return;
    }

    const result = await tagService.renameTag(editingTag, normalizedNewTag);
    toast({
      title: 'Tag renamed',
      description: `"${editingTag}" is now "${normalizedNewTag}" across ${result.affectedSessionCount} session(s), with ${result.changedTagCount} tag change(s).`,
    });
    setEditingTag(null);
    setNewTagName('');
    refreshTags();
  };

  const handleMerge = async () => {
    if (!mergingTag || !targetMergeTag) return;
    const preview = await tagService.mergeTags(mergingTag, targetMergeTag, {
      dryRun: true,
    });

    if (preview.conflicts.length > 0) {
      toast({
        title: 'Unable to merge tags',
        description: preview.conflicts[0].message,
        variant: 'destructive',
      });
      return;
    }

    const result = await tagService.mergeTags(mergingTag, targetMergeTag);
    toast({
      title: 'Tags merged',
      description: `Merged into "${targetMergeTag}" across ${result.affectedSessionCount} session(s), with ${result.changedTagCount} tag change(s).`,
    });
    setMergingTag(null);
    setTargetMergeTag('');
    refreshTags();
  };

  const handleDelete = async () => {
    if (!deletingTag) return;
    const preview = await tagService.deleteTag(deletingTag, { dryRun: true });

    if (preview.conflicts.length > 0) {
      toast({
        title: 'Unable to delete tag',
        description: preview.conflicts[0].message,
        variant: 'destructive',
      });
      return;
    }

    const result = await tagService.deleteTag(deletingTag);
    toast({
      title: 'Tag deleted',
      description: `"${deletingTag}" was removed from ${result.affectedSessionCount} session(s), with ${result.changedTagCount} tag change(s).`,
    });
    setDeletingTag(null);
    refreshTags();
  };

  const filteredTags = tagService.searchTags(search);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card className="border-primary/10">
        <CardHeader className="bg-primary/5 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary text-primary-foreground rounded-lg">
              <Tags className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Technique Library</CardTitle>
              <CardDescription>
                Manage your technique tags. Changes apply globally to all logged
                sessions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search techniques..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredTags.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground bg-secondary/20 rounded-lg border border-dashed">
              {search
                ? 'No tags match your search.'
                : 'No technique tags found in your history.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredTags.map((tag) => (
                <div
                  key={tag}
                  className="flex items-center justify-between p-3 rounded-lg border bg-background hover:border-primary/30 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="font-semibold text-sm"
                    >
                      {tag}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
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
                      className="h-8 w-8 text-muted-foreground hover:text-accent"
                      onClick={() => setMergingTag(tag)}
                    >
                      <Combine className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeletingTag(tag)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rename Dialog */}
      <Dialog
        open={!!editingTag}
        onOpenChange={(open) => !open && setEditingTag(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Technique</DialogTitle>
            <DialogDescription>
              This will update "{editingTag}" to your new name in every session.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="New technique name"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingTag(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!newTagName.trim() || newTagName === editingTag}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog
        open={!!mergingTag}
        onOpenChange={(open) => !open && setMergingTag(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Tag</DialogTitle>
            <DialogDescription>
              Move all instances of "{mergingTag}" into another existing
              technique.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Select Target Technique
              </label>
              <Select value={targetMergeTag} onValueChange={setTargetMergeTag}>
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergingTag(null)}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleMerge}
              disabled={!targetMergeTag}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Confirm Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={!!deletingTag}
        onOpenChange={(open) => !open && setDeletingTag(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete Technique Tag
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove "{deletingTag}" from all your
              sessions? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingTag(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Globally
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
