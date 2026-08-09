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
import { Trash2, Calendar, Edit2, ExternalLink } from 'lucide-react';
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
import { parseDateOnly } from '@/lib/utils';
import { DataSurface } from '@/components/ui/data-display';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';

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
  deletingSessionId: string | null;
}

function SessionRow({
  session,
  onDelete,
  onEdit,
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
    <div className="py-6 reveal-fade">
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
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {session.techniques.map((tech, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className="bg-background/60 border-primary/30"
              >
                {tech}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto shrink-0">
          <div className="flex flex-col items-end mr-4 md:mr-6">
            <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">
              Effort
            </span>
            <Badge className={EFFORT_COLORS[session.effort]}>
              {EFFORT_LABELS[session.effort]}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/5"
              onClick={() => onEdit(session)}
              aria-label={`Edit session from ${sessionDateLabel}`}
              title={`Edit session from ${sessionDateLabel}`}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
              disabled={deletingSessionId === session.id}
              onClick={() => onDelete(session.id)}
              aria-label={`Delete session from ${sessionDateLabel}`}
              title={`Delete session from ${sessionDateLabel}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {(session.description || session.notes || safeVideoUrl) && (
        <details className="group mt-4 pl-7">
          <summary className="cursor-pointer select-none text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm">
            <span className="group-open:hidden">
              View session notes and media
            </span>
            <span className="hidden group-open:inline">
              Hide session notes and media
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
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [effortFilter, setEffortFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

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
        className="mb-6 grid gap-3 rounded-xl border border-border bg-card/60 p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search techniques or notes"
          aria-label="Search training history"
          className="lg:col-span-2"
        />
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label="Filter by session type"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All effort levels</option>
          {[1, 2, 3, 4, 5].map((effort) => (
            <option key={effort} value={effort}>
              {EFFORT_LABELS[effort as keyof typeof EFFORT_LABELS]}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSearchQuery('');
            setCategoryFilter('all');
            setEffortFilter('all');
            setFromDate('');
            setToDate('');
          }}
        >
          Clear filters
        </Button>
        <Input
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          aria-label="Sessions from date"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          aria-label="Sessions to date"
        />
        <p className="self-center text-sm text-muted-foreground lg:col-span-3">
          Showing {filteredSessions.length} of {sessions.length} sessions
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
                  onDelete={handleDelete}
                  onEdit={setEditingSession}
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
    </div>
  );
}
