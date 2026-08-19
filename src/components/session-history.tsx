'use client';

import { useMemo, useState } from 'react';
import {
  JudoSession,
  EFFORT_LABELS,
  EFFORT_COLORS,
  CATEGORY_COLORS,
} from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Trash2,
  Calendar,
  Edit2,
  ExternalLink,
  Filter,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { deleteSession } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SessionLogForm } from '@/components/session-log-form';
import { RessaImage } from '@/components/ressa-image';
import { cn, parseDateOnly } from '@/lib/utils';
import { DataSurface } from '@/components/ui/data-display';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SessionHistoryProps {
  sessions: JudoSession[];
  onRefresh: () => void;
  onLogSession?: () => void;
}

type GroupedSessions = {
  monthLabel: string;
  sessions: JudoSession[];
};

function groupSessionsByMonth(sessions: JudoSession[]): GroupedSessions[] {
  const groups: Map<string, JudoSession[]> = new Map();

  for (const session of sessions) {
    const date = parseDateOnly(session.date);
    const monthLabel = format(date, 'MMMM yyyy');
    if (!groups.has(monthLabel)) {
      groups.set(monthLabel, []);
    }
    groups.get(monthLabel)!.push(session);
  }

  return Array.from(groups.entries(), ([monthLabel, sessions]) => ({
    monthLabel,
    sessions,
  }));
}

interface SessionRowProps {
  session: JudoSession;
  onDelete: (id: string) => void;
  onEdit: (session: JudoSession) => void;
  onFilterTechnique: (technique: string) => void;
  deletingSessionId: string | null;
}

function SessionRow({
  session,
  onDelete,
  onEdit,
  onFilterTechnique,
  deletingSessionId,
}: SessionRowProps) {
  const sessionDateLabel = format(
    parseDateOnly(session.date),
    'EEEE, MMMM do, yyyy'
  );
  let safeVideoUrl: string | null = null;

  if (session.videoUrl) {
    try {
      const parsedUrl = new URL(session.videoUrl);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        safeVideoUrl = parsedUrl.toString();
      }
    } catch {
      safeVideoUrl = null;
    }
  }

  return (
    <div className="rounded-xl px-3 py-5 reveal-fade transition-colors hover:bg-muted/35 sm:px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-base">
                {format(parseDateOnly(session.date), 'EEEE, MMMM do')}
              </span>
              <Badge
                variant="outline"
                className={CATEGORY_COLORS[session.category || 'Technical']}
              >
                {session.category || 'Technical'}
              </Badge>
              {session.duration ? (
                <span className="text-xs font-medium text-muted-foreground">
                  {session.duration} min
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {session.techniques.slice(0, 3).map((tech, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onFilterTechnique(tech)}
                className="rounded-full border border-primary/30 bg-background/60 px-2.5 py-0.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title={`Show sessions tagged ${tech}`}
              >
                {tech}
              </button>
            ))}
            {session.techniques.length > 3 ? (
              <Badge
                variant="outline"
                className="bg-background/60 border-primary/30"
              >
                +{session.techniques.length - 3} more
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto shrink-0">
          <div className="flex flex-col items-end mr-1 md:mr-3">
            <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">
              Effort
            </span>
            <Badge className={EFFORT_COLORS[session.effort]}>
              {EFFORT_LABELS[session.effort]}
            </Badge>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-muted-foreground hover:text-primary hover:bg-primary/5"
                aria-label={`Actions for session from ${sessionDateLabel}`}
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(session)}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit session
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={deletingSessionId === session.id}
                onClick={() => onDelete(session.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(session.description || session.notes || safeVideoUrl) && (
        <details className="group mt-4 pl-7">
          <summary className="cursor-pointer select-none text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm">
            <span className="group-open:hidden">View session details</span>
            <span className="hidden group-open:inline">
              Hide session details
            </span>
          </summary>
          <div className="mt-3 space-y-3">
            {safeVideoUrl &&
              (() => {
                let videoHostname = '';
                try {
                  videoHostname = new URL(safeVideoUrl).hostname.replace(
                    /^www\./,
                    ''
                  );
                } catch {
                  videoHostname = '';
                }

                return (
                  <a
                    href={safeVideoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-2 rounded-md border border-primary/20 bg-background/80 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5 hover:text-primary/90"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    <span className="truncate">Watch relevant video</span>
                    {videoHostname && (
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        ({videoHostname})
                      </span>
                    )}
                  </a>
                );
              })()}
            {session.description && (
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                {session.description}
              </p>
            )}
            {session.notes && (
              <p className="text-sm text-muted-foreground italic">
                "{session.notes}"
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

export function SessionHistory({
  sessions,
  onRefresh,
  onLogSession,
}: SessionHistoryProps) {
  const { toast } = useToast();
  const [editingSession, setEditingSession] = useState<JudoSession | null>(
    null
  );
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null
  );
  const [sessionPendingDeletion, setSessionPendingDeletion] =
    useState<JudoSession | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [effortFilter, setEffortFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const handleDelete = async (id: string) => {
    if (deletingSessionId) {
      return;
    }

    setDeletingSessionId(id);
    try {
      const result = await deleteSession(id);
      onRefresh();
      toast({
        title: 'Session deleted',
        description:
          result.status === 'queued'
            ? 'The change is saved locally and queued to sync when the connection is ready.'
            : 'The training session has been removed from your history.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: 'The session could not be deleted.',
      });
    } finally {
      setDeletingSessionId(null);
    }
  };

  const requestDelete = (session: JudoSession) => {
    if (!deletingSessionId) setSessionPendingDeletion(session);
  };

  const filteredSessions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    return sessions.filter((session) => {
      if (categoryFilter !== 'all' && session.category !== categoryFilter) {
        return false;
      }
      if (effortFilter !== 'all' && session.effort !== Number(effortFilter)) {
        return false;
      }
      if (fromDate && session.date < fromDate) {
        return false;
      }
      if (toDate && session.date > toDate) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      return [
        ...session.techniques,
        session.category,
        session.description,
        session.notes,
        session.date,
      ]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [categoryFilter, effortFilter, fromDate, searchQuery, sessions, toDate]);

  const grouped = groupSessionsByMonth(filteredSessions);
  const filteredDuration = filteredSessions.reduce(
    (total, session) => total + (session.duration ?? 0),
    0
  );
  const filteredAverageEffort = filteredSessions.length
    ? filteredSessions.reduce((total, session) => total + session.effort, 0) /
      filteredSessions.length
    : 0;
  const activeFilterCount = [
    categoryFilter !== 'all',
    effortFilter !== 'all',
    !!fromDate,
    !!toDate,
  ].filter(Boolean).length;
  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setEffortFilter('all');
    setFromDate('');
    setToDate('');
  };
  const filterByTechnique = (technique: string) => {
    setSearchQuery(technique);
    setFiltersOpen(false);
  };
  const applyQuickFilter = (kind: 'week' | 'month' | 'high-effort') => {
    if (kind === 'high-effort') {
      setEffortFilter('4');
      setFromDate('');
      setToDate('');
      return;
    }
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - (kind === 'week' ? 6 : 29));
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(today.toISOString().slice(0, 10));
    setEffortFilter('all');
  };

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl bg-muted/45">
        <RessaImage
          pose={2}
          size="medium"
          alt="Ressa encouraging you to log your first session"
        />
        <p className="text-center font-semibold mt-4 mb-1">No sessions yet</p>
        <p className="text-center text-sm text-muted-foreground mb-6">
          Log your first training session and it will appear here.
        </p>
        {onLogSession && (
          <Button onClick={onLogSession}>Log your first session</Button>
        )}
      </div>
    );
  }

  return (
    <div className="reveal-fade-up max-w-4xl mx-auto w-full">
      <section
        aria-label="Filter training history"
        className="sticky top-3 z-[1] mb-6 rounded-2xl bg-card/95 p-3 shadow-[0_18px_32px_-28px_hsl(var(--foreground)/0.28)] backdrop-blur sm:p-4"
      >
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search techniques or notes"
            aria-label="Search training history"
            className="h-11 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            <Filter className="h-4 w-4" />
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick filters">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => applyQuickFilter('week')}
          >
            This week
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => applyQuickFilter('month')}
          >
            Last 30 days
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => applyQuickFilter('high-effort')}
          >
            High effort
          </Button>
        </div>
        <div
          className={cn(
            'mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5',
            filtersOpen ? 'grid' : 'hidden'
          )}
        >
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            aria-label="Filter by session type"
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All session types</option>
            <option value="Technical">Technical</option>
            <option value="Randori">Randori</option>
            <option value="Shiai">Shiai</option>
          </select>
          <select
            value={effortFilter}
            onChange={(event) => setEffortFilter(event.target.value)}
            aria-label="Filter by effort level"
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All effort levels</option>
            {[1, 2, 3, 4, 5].map((effort) => (
              <option key={effort} value={effort}>
                {EFFORT_LABELS[effort as keyof typeof EFFORT_LABELS]}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            aria-label="Sessions from date"
            className="h-11"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            aria-label="Sessions to date"
            className="h-11"
          />
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={clearFilters}
          >
            <X className="h-4 w-4" /> Clear filters
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Showing {filteredSessions.length} of {sessions.length} sessions ·
          average effort {filteredAverageEffort.toFixed(1)}/5
          {filteredDuration ? ` · ${filteredDuration} minutes` : ''}
        </p>
      </section>

      {filteredSessions.length === 0 ? (
        <div className="rounded-xl bg-muted/45 p-8 text-center">
          <p className="font-semibold">No sessions match these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different technique, date range, or effort level.
          </p>
        </div>
      ) : null}
      {grouped.map(({ monthLabel, sessions: monthSessions }) => (
        <div key={monthLabel} className="mb-8 last:mb-0">
          <h3 className="text-headline-sm mb-4">{monthLabel}</h3>
          <DataSurface className="p-6">
            {monthSessions.map((session, idx) => (
              <div key={session.id}>
                {idx > 0 && (
                  <Separator className="my-4 bg-[color:color-mix(in_srgb,var(--color-outline-variant)_0.15,transparent)]" />
                )}
                <SessionRow
                  session={session}
                  onDelete={(id) => {
                    const sessionToDelete = sessions.find(
                      (candidate) => candidate.id === id
                    );
                    if (sessionToDelete) requestDelete(sessionToDelete);
                  }}
                  onEdit={setEditingSession}
                  onFilterTechnique={filterByTechnique}
                  deletingSessionId={deletingSessionId}
                />
              </div>
            ))}
          </DataSurface>
        </div>
      ))}

      <Dialog
        open={!!editingSession}
        onOpenChange={(open) => !open && setEditingSession(null)}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-bold">
              Edit Practice Session
            </DialogTitle>
            <DialogDescription>
              Update your practice description, techniques, effort, or notes.
            </DialogDescription>
          </DialogHeader>
          {editingSession && (
            <div className="py-2">
              <SessionLogForm
                sessionToEdit={editingSession}
                onSuccess={() => {
                  setEditingSession(null);
                  onRefresh();
                }}
                onCancel={() => setEditingSession(null)}
                showAvatar={false}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!sessionPendingDeletion}
        onOpenChange={(open) => {
          if (!open && !deletingSessionId) setSessionPendingDeletion(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this session?</DialogTitle>
            <DialogDescription>
              {sessionPendingDeletion
                ? `This permanently removes the ${format(
                    parseDateOnly(sessionPendingDeletion.date),
                    'MMMM d, yyyy'
                  )} training session from your history.`
                : 'This permanently removes the training session from your history.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!!deletingSessionId}
              onClick={() => setSessionPendingDeletion(null)}
            >
              Keep session
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!!deletingSessionId}
              onClick={() => {
                if (!sessionPendingDeletion) return;
                void handleDelete(sessionPendingDeletion.id).then(() =>
                  setSessionPendingDeletion(null)
                );
              }}
            >
              {deletingSessionId ? 'Deleting…' : 'Delete session'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
