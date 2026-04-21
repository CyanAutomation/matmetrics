'use client';

import { useState } from 'react';
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
  let safeVideoUrl: string | null = null;

  if (session.videoUrl) {
    try {
      const parsedUrl = new URL(session.videoUrl);
      if (
        parsedUrl.protocol === 'http:' ||
        parsedUrl.protocol === 'https:'
      ) {
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
              aria-label="Edit session"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
              disabled={deletingSessionId === session.id}
              onClick={() => onDelete(session.id)}
              aria-label="Delete session"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {(session.description || session.notes || safeVideoUrl) && (
        <div className="mt-4 space-y-3 pl-7">
          {safeVideoUrl && (() => {
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
      )}
    </div>
  );
}

export function SessionHistory({ sessions, onRefresh, onLogSession }: SessionHistoryProps) {
  const { toast } = useToast();
  const [editingSession, setEditingSession] = useState<JudoSession | null>(
    null
  );
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null
  );

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
        description:
          'The session could not be deleted.',
      });
    } finally {
      setDeletingSessionId(null);
    }
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

  const grouped = groupSessionsByMonth(sessions);

  return (
    <div className="reveal-fade-up">
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
