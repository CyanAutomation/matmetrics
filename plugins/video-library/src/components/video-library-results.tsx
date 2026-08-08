import {
  AlertCircle,
  ExternalLink,
  Pencil,
  RefreshCcw,
  Trash2,
} from 'lucide-react';

import { PluginGallerySection } from '@/components/plugins/plugin-gallery-section';
import { PluginTableSection } from '@/components/plugins/plugin-kit';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { VideoLibraryRow } from '@/lib/video-library';
import { VideoTileCard } from './video-tile-card';

export type VideoLibraryResultsProps = {
  presentationMode: 'lounge' | 'table';
  playNextEnabled: boolean;
  showAdvanced: boolean;
  isCheckingLinks: boolean;
  sortedFilteredRows: VideoLibraryRow[];
  loungeRows: VideoLibraryRow[];
  browseState: {
    hasRows: boolean;
    title: string;
    description: string;
    ctaLabel: string;
  };
  getStatusVariant: (
    status: VideoLibraryRow['displayStatus']
  ) => 'default' | 'secondary' | 'destructive' | 'outline';
  getEntryStatusLabel: (status: VideoLibraryRow['displayStatus']) => string;
  onEmptyCta: () => void;
  onCheckLinks: (sessionIds: string[]) => void;
  onEdit: (row: VideoLibraryRow) => void;
  onRemove: (row: VideoLibraryRow) => void;
};

export function VideoLibraryResults({
  presentationMode,
  playNextEnabled,
  showAdvanced,
  isCheckingLinks,
  sortedFilteredRows,
  loungeRows,
  browseState,
  getStatusVariant,
  getEntryStatusLabel,
  onEmptyCta,
  onCheckLinks,
  onEdit,
  onRemove,
}: VideoLibraryResultsProps) {
  const description =
    'Filter by tab, status, category, or host to focus your current review task. No-video reminders follow your category expectations.';

  if (presentationMode === 'table') {
    return (
      <PluginTableSection
        title="Saved Videos"
        description={description}
        hasRows={browseState.hasRows}
        emptyTitle={browseState.title}
        emptyDescription={browseState.description}
        emptyCtaLabel={browseState.ctaLabel}
        onEmptyCta={onEmptyCta}
        emptyIcon={<AlertCircle className="h-4 w-4" />}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Check age</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedFilteredRows.map((row) => (
              <TableRow key={row.session.id}>
                <TableCell className="font-medium">
                  <div>{row.session.date}</div>
                  <div
                    className={`text-xs ${getPluginUiTokenClassNames('text.subtle')}`}
                  >
                    {row.session.category}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(row.displayStatus)}>
                    {getEntryStatusLabel(row.displayStatus)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {row.entry.hostname ?? row.latestCheck?.hostname ?? '—'}
                </TableCell>
                <TableCell>
                  <span
                    className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
                  >
                    {row.latestCheck
                      ? new Date(row.latestCheck.checkedAt).toLocaleString()
                      : 'Not checked'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {row.entry.url ? (
                      <Button type="button" variant="ghost" size="icon" asChild>
                        <a
                          href={row.entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    ) : null}
                    {showAdvanced && row.isCheckable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onCheckLinks([row.session.id])}
                        disabled={isCheckingLinks}
                      >
                        <RefreshCcw className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(row)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {row.entry.url ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        interaction="destructive"
                        onClick={() => onRemove(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PluginTableSection>
    );
  }

  return (
    <PluginGallerySection
      title="Saved Videos"
      description={description}
      hasTiles={loungeRows.length > 0}
      emptyTitle={browseState.title}
      emptyDescription={browseState.description}
      emptyCtaLabel={browseState.ctaLabel}
      onEmptyCta={onEmptyCta}
      emptyIcon={<AlertCircle className="h-4 w-4" />}
    >
      {loungeRows.map((row, index) => (
        <VideoTileCard
          key={row.session.id}
          row={row}
          nextRow={playNextEnabled ? loungeRows[index + 1] : undefined}
          showAdvanced={showAdvanced}
          isCheckingLinks={isCheckingLinks}
          getStatusVariant={(status) =>
            getStatusVariant(status as VideoLibraryRow['displayStatus'])
          }
          getEntryStatusLabel={(status) =>
            getEntryStatusLabel(status as VideoLibraryRow['displayStatus'])
          }
          onEdit={onEdit}
          onRemove={onRemove}
          onCheck={(item) => onCheckLinks([item.session.id])}
        />
      ))}
    </PluginGallerySection>
  );
}
