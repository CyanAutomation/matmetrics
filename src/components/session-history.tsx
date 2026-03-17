"use client"

import React, { useState } from 'react';
import { JudoSession, EFFORT_LABELS, EFFORT_COLORS, CATEGORY_COLORS } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Calendar, Clock, Edit2 } from "lucide-react";
import { format } from "date-fns";
import { deleteSession } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SessionLogForm } from "@/components/session-log-form";

interface SessionHistoryProps {
  sessions: JudoSession[];
  onRefresh: () => void;
}

export function SessionHistory({ sessions, onRefresh }: SessionHistoryProps) {
  const { toast } = useToast();
  const [editingSession, setEditingSession] = useState<JudoSession | null>(null);

  const handleDelete = (id: string) => {
    deleteSession(id);
    onRefresh();
    toast({
      title: "Session deleted",
      description: "The training session has been removed from your history.",
    });
  };

  const handleEditSuccess = () => {
    setEditingSession(null);
    onRefresh();
  };

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 bg-white/50 rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">No sessions logged yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
      {sessions.map((session) => (
        <Card key={session.id} className="overflow-hidden border-l-4 border-l-primary/30 hover:shadow-md transition-shadow">
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
                        {format(new Date(session.date), "EEEE, MMMM do")}
                      </h4>
                      <Badge variant="outline" className={CATEGORY_COLORS[session.category || 'Technical']}>
                        {session.category || 'Technical'}
                      </Badge>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground gap-1">
                      <Clock className="h-3 w-3" />
                      Logged {format(new Date(session.date), "p")}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {session.techniques.map((tech, idx) => (
                    <Badge key={idx} variant="outline" className="bg-background/50 border-primary/20">
                      {tech}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0">
                <div className="flex flex-col items-end mr-4">
                  <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Effort</span>
                  <Badge className={EFFORT_COLORS[session.effort]}>
                    {EFFORT_LABELS[session.effort]}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground hover:text-primary hover:bg-primary/5"
                    onClick={() => setEditingSession(session)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                    onClick={() => handleDelete(session.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            
            {(session.description || session.notes) && (
              <div className="px-5 pb-5 pt-0 space-y-3 border-t">
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
      ))}

      <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-bold">Edit Practice Session</DialogTitle>
            <DialogDescription>
              Update your practice description, techniques, effort, or notes for this training session.
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
