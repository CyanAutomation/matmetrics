import {
  ExternalLink,
  Film,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCcw,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PluginMediaTile } from '@/components/plugins/plugin-media-tile';
import { PluginTileActions } from '@/components/plugins/plugin-tile-actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type {
  VideoLibraryRow,
  VideoLibraryStatusFilter,
} from '@/lib/video-library';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';

interface VideoTileCardProps {
  row: VideoLibraryRow;
  nextRow?: VideoLibraryRow;
  showAdvanced: boolean;
  isCheckingLinks: boolean;
  getStatusVariant: (
    status: VideoLibraryStatusFilter
  ) => 'default' | 'secondary' | 'destructive' | 'outline';
  getEntryStatusLabel: (status: VideoLibraryStatusFilter) => string;
  onEdit: (row: VideoLibraryRow) => void;
  onRemove: (row: VideoLibraryRow) => void;
  onCheck: (row: VideoLibraryRow) => void;
  featured?: boolean;
}

export function VideoTileCard({
  row,
  nextRow,
  showAdvanced,
  isCheckingLinks,
  getStatusVariant,
  getEntryStatusLabel,
  onEdit,
  onRemove,
  onCheck,
  featured = false,
}: VideoTileCardProps) {
  const safeThumbnailUrl = (() => {
    if (!row.thumbnailUrl) {
      return null;
    }
    try {
      const parsed = new URL(row.thumbnailUrl);
      if (parsed.protocol !== 'https:') {
        return null;
      }
      if (
        parsed.hostname !== 'img.youtube.com' &&
        !parsed.hostname.endsWith('.img.youtube.com')
      ) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  })();

  const rawTitle =
    row.displayTitle ||
    row.session.description?.trim() ||
    `${row.session.date} • ${row.session.category}`;
  const title = rawTitle.length > 72
    ? `${rawTitle.slice(0, Math.max(0, rawTitle.slice(0, 72).lastIndexOf(' ')) || 72).trim()}…`
    : rawTitle;
  const hostname = row.provider || row.entry.hostname || 'Unknown provider';
  const hasPreview = Boolean(safeThumbnailUrl);

  return (
    <PluginMediaTile
      title={title}
      className={featured ? 'lg:col-span-2' : undefined}
      previewClassName={featured ? 'lg:aspect-[2/1]' : undefined}
      contentClassName={featured ? 'lg:p-5' : undefined}
      previewBackgroundStyle={
        safeThumbnailUrl
          ? { backgroundImage: `url(\"${safeThumbnailUrl}\")` }
          : undefined
      }
      previewContent={
        <>
          <div className="flex items-start justify-between gap-2">
            <Badge
              variant={getStatusVariant(row.displayStatus)}
              aria-label={`Status: ${getEntryStatusLabel(row.displayStatus)}`}
            >
              {getEntryStatusLabel(row.displayStatus)}
            </Badge>
            <Film
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Play
                className="ml-0.5 h-4 w-4 fill-current"
                aria-hidden="true"
              />
            </span>
            <span>{hasPreview ? 'Ready to watch' : `${hostname} video`}</span>
          </div>
        </>
      }
      metadata={
        <>
          <span>{row.session.date}</span>
          <span aria-hidden="true">•</span>
          <span>{row.session.category}</span>
          <Badge variant="outline" aria-label={`Host: ${hostname}`}>
            {hostname}
          </Badge>
        </>
      }
      supportingText={
        row.session.techniques.slice(0, 3).join(', ') || 'No techniques listed'
      }
      actions={
        <PluginTileActions
          leadingActions={
            <>
              {row.entry.url ? (
                <Button type="button" asChild className="flex-1 sm:flex-none">
                  <a
                    href={row.entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Watch video for ${title}`}
                  >
                    Watch
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              ) : null}
              {nextRow?.entry.url ? (
                <Button type="button" variant="outline" asChild>
                  <a
                    href={nextRow.entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Play next
                  </a>
                </Button>
              ) : null}
            </>
          }
          menuAction={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`More actions for ${title}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {showAdvanced && row.isCheckable ? (
                  <DropdownMenuItem
                    onClick={() => onCheck(row)}
                    disabled={isCheckingLinks}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Refresh link health
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => onEdit(row)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {row.entry.url ? (
                  <DropdownMenuItem
                    onClick={() => onRemove(row)}
                    className={getPluginUiTokenClassNames(
                      'action.destructive-menu-item'
                    )}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      }
    />
  );
}
