"use client"

import React from 'react';
import { JudoSession, EFFORT_LABELS, EFFORT_COLORS } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { deleteSession } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";

interface SessionHistoryProps {
  sessions: JudoSession[];
  onRefresh: () => void;
}

export function SessionHistory({ sessions, onRefresh }: SessionHistoryProps) {
  const { toast } = useToast();

  const handleDelete = (id: string) => {
    deleteSession(id);
    onRefresh();
    toast({
      title: "Session deleted",
      description: "The training session has been removed from your history.",
    });
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
                    <h4 className="font-bold text-lg">
                      {format(new Date(session.date), "EEEE, MMMM do")}
                    </h4>
                    <div className="flex items-center text-xs text-muted-foreground gap-1">
                      <Clock className="h-3 w-3" />
                      Logged at {format(new Date(session.date), "p")}
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

              <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Effort</span>
                  <Badge className={EFFORT_COLORS[session.effort]}>
                    {EFFORT_LABELS[session.effort]}
                  </Badge>
                </div>
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                  onClick={() => handleDelete(session.id)}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            </div>
            
            {session.notes && (
              <div className="px-5 pb-5 pt-0">
                 <p className="text-sm text-muted-foreground italic border-t pt-3">
                  "{session.notes}"
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}