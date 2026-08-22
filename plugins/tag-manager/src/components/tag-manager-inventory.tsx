'use client';

import { useMemo } from 'react';
import { AlertCircle, Combine, Edit2, Search, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PluginDataSurfaceFilterRow,
  PluginDataSurfaceSummaryStrip,
} from '@/components/plugins/plugin-data-surface';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { PluginInlineMessage } from '@/components/plugins/plugin-inline-message';

export function TagManagerInventory({
  tags,
  filteredTags,
  search,
  onSearchChange,
  onRename,
  onMerge,
  onDelete,
}: {
  tags: string[];
  filteredTags: string[];
  search: string;
  onSearchChange: (value: string) => void;
  onRename: (tag: string) => void;
  onMerge: (tag: string) => void;
  onDelete: (tag: string) => void;
}) {
  const possibleDuplicateGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const tag of tags) {
      const normalized = tag.toLocaleLowerCase().replace(/[\s-]+/g, '');
      if (!normalized) continue;
      groups.set(normalized, [...(groups.get(normalized) ?? []), tag]);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  }, [tags]);

  return (
    <>
      <PluginDataSurfaceFilterRow className="mb-6 lg:grid-cols-2">
        <div className="relative lg:col-span-2">
          <Search
            className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${getPluginUiTokenClassNames('icon.subtle')}`}
          />
          <Input
            placeholder="Search techniques..."
            className="pl-10"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
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
      {possibleDuplicateGroups.length > 0 ? (
        <PluginInlineMessage
          tone="warning"
          className="mb-4"
          icon={<AlertCircle className="h-4 w-4" />}
          title="Potential duplicate techniques"
          description={`Review and merge equivalent spellings: ${possibleDuplicateGroups
            .map((group) => group.join(' / '))
            .join('; ')}.`}
        />
      ) : null}
      <div className="divide-y rounded-xl border bg-background/40">
        {filteredTags.map((tag) => (
          <div
            key={tag}
            className="group flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/30"
          >
            <div className="min-w-0">
              <p className="font-medium">{tag}</p>
              <p className={`text-xs ${getPluginUiTokenClassNames('text.subtle')}`}>
                Technique tag · changes apply across your training history
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Rename ${tag}`}
                onClick={() => onRename(tag)}
              >
                <Edit2 className="h-4 w-4" />
                <span className="hidden sm:inline">Rename</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Merge ${tag}`}
                onClick={() => onMerge(tag)}
              >
                <Combine className="h-4 w-4" />
                <span className="hidden sm:inline">Merge</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                interaction="destructive"
                aria-label={`Delete ${tag}`}
                onClick={() => onDelete(tag)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
