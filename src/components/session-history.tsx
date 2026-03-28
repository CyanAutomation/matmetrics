'use client';

import { useState } from 'react';
import {
  JudoSession,
  EFFORT_LABELS,
  EFFORT_COLORS,
  CATEGORY_COLORS,
} from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Calendar, Clock, Edit2, ExternalLink } from 'lucide-react';
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
import { CARD_INTERACTION_CLASS } from '@/lib/interaction';

interface SessionHistoryProps {
  sessions: JudoSession[];
  onRefresh: () => void;
}

export function SessionHistory({ sessions, onRefresh }: SessionHistoryProps) {
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
          'The session could not be deleted. Your local view has been reconciled to match persisted data.',
      });
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleEditSuccess = () => {
    setEditingSession(null);
    onRefresh();
  };

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 rounded-lg border border-dashed border-ghost bg-secondary/20">
        <RessaImage
          pose={2}
          size="medium"
          alt="Ressa encouraging you to log your first session"
        />
        <p className="text-center text-muted-foreground mt-3">
          No sessions logged yet.
        </p>
        <p className="text-center text-sm text-muted-foreground mt-1">
          Your journey starts here. Log your first session!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
      {sessions.map((session) => {
        let videoHostname: string | null = null;

        if (session.videoUrl) {
          try {
            videoHostname = new URL(session.videoUrl).hostname.replace(
              /^www\./,
              ''
            );
          } catch {
            videoHostname = null;
          }
        }

        return (
          <Card
            key={session.id}
            className={cn('overflow-hidden bg-card/95', CARD_INTERACTION_CLASS)}
          >
            <CardContent className="p-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between p-5 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-secondary rounded-lg">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-lg">
                          {format(parseDateOnly(session.date), 'EEEE, MMMM do')}
                        </h4>
                        <Badge
                          variant="outline"
                          className={
                            CATEGORY_COLORS[session.category || 'Technical']
                          }
                        >
                          {session.category || 'Technical'}
                        </Badge>
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground gap-1">
                        <Clock className="h-3 w-3" />
                        {format(parseDateOnly(session.date), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2">
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

                <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto bg-secondary/25 rounded-md px-3 py-2 md:bg-transparent md:p-0">
                  <div className="flex flex-col items-end mr-4">
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
                      interaction="subtle"
                      className="text-muted-foreground hover:text-primary hover:bg-primary/5"
                      onClick={() => setEditingSession(session)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      interaction="destructive"
                      feedbackState={
                        deletingSessionId === session.id ? 'loading' : 'idle'
                      }
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                      disabled={deletingSessionId === session.id}
                      onClick={() => handleDelete(session.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {(session.description || session.notes || session.videoUrl) && (
                <div className="px-5 pb-5 pt-3 space-y-3 bg-secondary/25">
                  {session.videoUrl && (
                    <a
                      href={session.videoUrl}
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
                  )}
                  {session.description && (
                    <p className="text-sm text-foreground/90 pt-3 whitespace-pre-wrap">
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
            </CardContent>
          </Card>
        );
      })}

      <Dialog
        open={!!editingSession}
        onOpenChange={(open) => !open && setEditingSession(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-bold">
              Edit Practice Session
            </DialogTitle>
            <DialogDescription>
              Update your practice description, techniques, effort, or notes for
              this training session.
            </DialogDescription>
          </DialogHeader>
          {editingSession && (
            <div className="py-2">
              <SessionLogForm
                sessionToEdit={editingSession}
                onSuccess={handleEditSuccess}
                onCancel={() => setEditingSession(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
