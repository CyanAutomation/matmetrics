import {
  ExternalLink,
  Film,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  Star,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

  const title =
    row.displayTitle ||
    row.session.description?.trim() ||
    `${row.session.date} • ${row.session.category}`;
  const hostname = row.provider || row.entry.hostname || 'Unknown provider';

  return (
    <article className="group overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="aspect-video rounded-b-none rounded-t-xl bg-muted p-3">
        <div
          className="flex h-full flex-col justify-between rounded-lg border border-dashed border-border/70 bg-cover bg-center p-3"
          style={
            safeThumbnailUrl
              ? { backgroundImage: `url(\"${safeThumbnailUrl}\")` }
              : undefined
          }
        >
          <div className="flex items-start justify-between gap-2">
            <Badge
              variant={getStatusVariant(row.displayStatus)}
              aria-label={`Status: ${getEntryStatusLabel(row.displayStatus)}`}
            >
              {getEntryStatusLabel(row.displayStatus)}
            </Badge>
            <Film className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="line-clamp-2 text-sm font-medium">{title}</p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="space-y-1">
          <p className="line-clamp-2 font-semibold">{title}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{row.session.date}</span>
            <span aria-hidden="true">•</span>
            <span>{row.session.category}</span>
            <Badge variant="outline" aria-label={`Host: ${hostname}`}>
              {hostname}
            </Badge>
          </div>
          <p
            className="line-clamp-1 text-xs text-muted-foreground"
            title={
              row.latestCheck
                ? `Checked at ${new Date(row.latestCheck.checkedAt).toLocaleString()}`
                : 'Not checked yet'
            }
          >
            {row.session.techniques.join(', ') || 'No techniques listed'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            disabled
            aria-label={`Saved toggle placeholder for ${title}`}
            title="Saved toggle coming soon"
          >
            <Star className="h-4 w-4" />
          </Button>

          <div className="ml-auto opacity-100 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:opacity-0">
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
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </article>
  );
}
