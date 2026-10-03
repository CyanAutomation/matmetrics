'use client';

import { useState } from 'react';
import {
  Calendar,
  Edit2,
  ExternalLink,
  MoreHorizontal,
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
import { deferMenuDialogOpen } from '@/lib/interaction';
import {
  getSafeVideoUrl,
  getSessionNotePreview,
  getVideoHostname,
} from '@/lib/session-history-format';
import { EFFORT_LABELS, type JudoSession } from '@/lib/types';
import { cn, formatDateLabel, parseDateOnly } from '@/lib/utils';

interface SessionHistoryRowProps {
  session: JudoSession;
  onDelete: (id: string) => void;
  onEdit: (session: JudoSession) => void;
  onFilterTechnique: (technique: string) => void;
  deletingSessionId: string | null;
  density: 'comfortable' | 'compact';
}

const categoryBadgeVariants = {
  Technical: 'technical',
  Randori: 'randori',
  Shiai: 'shiai',
  Cardio: 'cardio',
  'S&C': 'strengthConditioning',
} as const;

const effortBadgeVariants = {
  1: 'effortEasy',
  2: 'effortLight',
  3: 'effortNormal',
  4: 'effortHard',
  5: 'effortIntense',
} as const;

function SessionRowActions({
  session,
  sessionDateLabel,
  onDelete,
  onEdit,
  deletingSessionId,
}: Pick<
  SessionHistoryRowProps,
  'session' | 'onDelete' | 'onEdit' | 'deletingSessionId'
> & { sessionDateLabel: string }) {
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

  return (
    <DropdownMenu
      open={isActionsMenuOpen}
      onOpenChange={setIsActionsMenuOpen}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-muted-foreground hover:bg-primary/5 hover:text-primary"
          aria-label={`Actions for session from ${sessionDateLabel}`}
          title="Session actions"
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            setIsActionsMenuOpen(false);
            deferMenuDialogOpen(() => onEdit(session));
          }}
        >
          <Edit2 className="mr-2 h-4 w-4" />
          Edit session
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={deletingSessionId === session.id}
          onSelect={() => {
            setIsActionsMenuOpen(false);
            deferMenuDialogOpen(() => onDelete(session.id));
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete session
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionRowTechniques({
  techniques,
  onFilterTechnique,
}: {
  techniques: string[];
  onFilterTechnique: (technique: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {techniques.slice(0, 3).map((technique, index) => (
        <button
          key={`${technique}-${index}`}
          type="button"
          onClick={() => onFilterTechnique(technique)}
          className="max-w-full break-words rounded-full bg-[hsl(var(--color-surface-container-high))] px-2.5 py-1 text-left text-xs font-medium transition-colors hover:bg-[hsl(var(--color-primary-fixed)/0.18)] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          title={`Show sessions tagged ${technique}`}
        >
          {technique}
        </button>
      ))}
      {techniques.length > 3 ? (
        <Badge variant="secondary">+{techniques.length - 3} more</Badge>
      ) : null}
    </div>
  );
}

function SessionRowDetails({ session }: { session: JudoSession }) {
  const safeVideoUrl = getSafeVideoUrl(session.videoUrl);
  if (!session.description && !session.notes && !safeVideoUrl) return null;

  return (
    <details className="group mt-4 pl-7">
      <summary className="cursor-pointer select-none text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm">
        <span className="group-open:hidden">View session details</span>
        <span className="hidden group-open:inline">Hide session details</span>
      </summary>
      <div className="mt-3 space-y-3">
        {safeVideoUrl ? (
          <a
            href={safeVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-2 rounded-lg bg-[hsl(var(--color-surface-container-high))] px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-[hsl(var(--color-primary-fixed)/0.16)]"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">Watch relevant video</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              ({getVideoHostname(safeVideoUrl)})
            </span>
          </a>
        ) : null}
        {session.description ? (
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">
            {session.description}
          </p>
        ) : null}
        {session.notes ? (
          <p className="text-sm text-muted-foreground italic">
            &quot;{session.notes}&quot;
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function SessionHistoryRow({
  session,
  onDelete,
  onEdit,
  onFilterTechnique,
  deletingSessionId,
  density,
}: SessionHistoryRowProps) {
  const sessionDateLabel = formatDateLabel(
    parseDateOnly(session.date),
    'weekday-month-day-year'
  );
  const sessionCategory = session.category || 'Technical';
  const notePreview = getSessionNotePreview(session);

  return (
    <div
      className={cn(
        '@container/session-row rounded-xl bg-card/42 px-4 reveal-fade transition-colors hover:bg-card sm:px-5',
        density === 'compact' ? 'py-3' : 'py-4'
      )}
    >
      <div className="flex flex-col justify-between gap-3 @min-[44rem]/session-row:flex-row @min-[44rem]/session-row:items-center">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-base">
                {formatDateLabel(parseDateOnly(session.date), 'weekday-month-day')}
              </span>
              <Badge variant={categoryBadgeVariants[sessionCategory]}>
                {sessionCategory}
              </Badge>
              {session.duration ? (
                <span className="text-xs font-medium text-muted-foreground">
                  {session.duration} min
                </span>
              ) : null}
            </div>
          </div>
          <SessionRowTechniques
            techniques={session.techniques}
            onFilterTechnique={onFilterTechnique}
          />
          {notePreview ? (
            <p
              className={cn(
                'max-w-2xl text-sm leading-6 text-muted-foreground',
                density === 'compact' ? 'line-clamp-1' : 'line-clamp-2'
              )}
            >
              {notePreview}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-3 @min-[44rem]/session-row:w-auto @min-[44rem]/session-row:shrink-0 @min-[44rem]/session-row:justify-end">
          <div className="mr-1 flex flex-col items-end @min-[44rem]/session-row:mr-3">
            <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">
              Effort
            </span>
            <Badge variant={effortBadgeVariants[session.effort]}>
              {EFFORT_LABELS[session.effort]}
            </Badge>
          </div>
          <SessionRowActions
            session={session}
            sessionDateLabel={sessionDateLabel}
            onDelete={onDelete}
            onEdit={onEdit}
            deletingSessionId={deletingSessionId}
          />
        </div>
      </div>
      <SessionRowDetails session={session} />
    </div>
  );
}
