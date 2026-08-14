'use client';

import { useMemo } from 'react';
import { AlertCircle, Combine, Edit2, Search, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {filteredTags.map((tag) => (
          <div
            key={tag}
            className="group flex items-center justify-between rounded-lg bg-background/80 p-3 transition-colors hover:bg-background"
          >
            <Badge variant="secondary" className="text-sm font-semibold">
              {tag}
            </Badge>
            <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Rename ${tag}`}
                title={`Rename ${tag}`}
                onClick={() => onRename(tag)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Merge ${tag}`}
                title={`Merge ${tag}`}
                onClick={() => onMerge(tag)}
              >
                <Combine className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Delete ${tag}`}
                title={`Delete ${tag}`}
                onClick={() => onDelete(tag)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
