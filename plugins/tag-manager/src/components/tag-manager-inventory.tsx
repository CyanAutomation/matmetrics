'use client';

import { useMemo } from 'react';
import {
  AlertCircle,
  Combine,
  Edit2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  PluginDataList,
  PluginDataListRow,
  PluginDataSurfaceSummaryStrip,
} from '@/components/plugins/plugin-data-surface';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { PluginInlineMessage } from '@/components/plugins/plugin-inline-message';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function TagManagerInventory({
  tags,
  filteredTags,
  search,
  onRename,
  onMerge,
  onDelete,
}: {
  tags: string[];
  filteredTags: string[];
  search: string;
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
      <PluginDataList role="list" aria-label="Technique tags">
        {filteredTags.map((tag) => (
          <PluginDataListRow key={tag} role="listitem">
            <div className="min-w-0">
              <p className="font-medium">{tag}</p>
            </div>
            <div className="ml-auto shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Actions for ${tag}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onRename(tag)}>
                    <Edit2 className="h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMerge(tag)}>
                    <Combine className="h-4 w-4" />
                    Merge
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={getPluginUiTokenClassNames(
                      'action.destructive-menu-item'
                    )}
                    onClick={() => onDelete(tag)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </PluginDataListRow>
        ))}
      </PluginDataList>
    </>
  );
}
