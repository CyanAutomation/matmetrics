"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Brain, X, Sparkles, Loader2, Save, Undo2, Wand2, PlusCircle } from "lucide-react";
import { EffortLevel, EFFORT_LABELS, JudoSession, SessionCategory } from "@/lib/types";
import { saveSession, updateSession } from "@/lib/storage";
import { suggestTechniqueTags } from "@/ai/flows/ai-technique-suggester";
import { transformPracticeDescription } from "@/ai/flows/practice-description-transformer";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SessionLogFormProps {
  onSuccess: () => void;
  sessionToEdit?: JudoSession;
  onCancel?: () => void;
}

export function SessionLogForm({ onSuccess, sessionToEdit, onCancel }: SessionLogFormProps) {
  const { toast } = useToast();
  const isEditing = !!sessionToEdit;

  const [date, setDate] = useState(sessionToEdit?.date || "");
  const [description, setDescription] = useState("");
  const [techniques, setTechniques] = useState<string[]>(sessionToEdit?.techniques || []);
  const [newTech, setNewTech] = useState("");
  const [effort, setEffort] = useState<EffortLevel>(sessionToEdit?.effort || 3);
  const [category, setCategory] = useState<SessionCategory>(sessionToEdit?.category || "Technical");
  const [notes, setNotes] = useState(sessionToEdit?.notes || "");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);

  // Avoid hydration mismatch by setting the default date on client-side mount
  useEffect(() => {
    if (!date && !isEditing) {
      setDate(new Date().toISOString().split('T')[0]);
    }
  }, [date, isEditing]);

  const handleAddTech = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (newTech.trim() && !techniques.includes(newTech.trim())) {
      setTechniques([...techniques, newTech.trim()]);
      setNewTech("");
    }
  };

  const removeTech = (tech: string) => {
    setTechniques(techniques.filter(t => t !== tech));
  };

  const handleTransform = async () => {
    if (!description.trim()) {
      toast({
        variant: "destructive",
        title: "Nothing to transform",
        description: "Please write a draft of what you practiced first.",
      });
      return;
    }

    setIsTransforming(true);
    try {
      const result = await transformPracticeDescription({ description });
      setDescription(result.transformedDescription);
      toast({
        title: "Description Refined",
        description: "AI has polished your training notes with better structure and terminology.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Transformation Failed",
        description: "There was an error refining your description.",
      });
    } finally {
      setIsTransforming(false);
    }
  };

  const handleSuggest = async () => {
    if (!description.trim()) {
      toast({
        variant: "destructive",
        title: "Missing description",
        description: "Please write what you practiced to get suggestions.",
      });
      return;
    }

    setIsSuggesting(true);
    try {
      const suggestions = await suggestTechniqueTags({ description });
      const uniqueNew = suggestions.filter(s => !techniques.includes(s));
      if (uniqueNew.length > 0) {
        setTechniques([...techniques, ...uniqueNew]);
        toast({
          title: "AI Suggestions Added",
          description: `Identified ${uniqueNew.length} techniques from your description.`,
        });
      } else if (suggestions.length > 0) {
        toast({
          description: "All suggested techniques are already tagged.",
        });
      } else {
        toast({
          description: "AI couldn't identify specific techniques. Try being more descriptive.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "AI Suggestion Failed",
        description: "There was an error connecting to the AI helper.",
      });
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (techniques.length === 0) {
      toast({
        variant: "destructive",
        title: "Incomplete log",
        description: "Please add at least one technique tag.",
      });
      return;
    }

    const sessionData: JudoSession = {
      id: sessionToEdit?.id || crypto.randomUUID(),
      date,
      techniques,
      effort,
      category,
      notes,
    };

    if (isEditing) {
      updateSession(sessionData);
      toast({
        title: "Session Updated!",
        description: "Your training session has been successfully modified.",
      });
    } else {
      saveSession(sessionData);
      toast({
        title: "Session Saved!",
        description: "Your training session has been successfully logged.",
      });
    }

    if (!isEditing) {
      setTechniques([]);
      setDescription("");
      setNotes("");
      setEffort(3);
      setCategory("Technical");
    }
    
    onSuccess();
  };

  return (
    <Card className={cn(
      "max-w-3xl mx-auto shadow-lg border-primary/10",
      isEditing && "shadow-none border-0 bg-transparent"
    )}>
      {!isEditing && (
        <CardHeader className="bg-primary/5 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary text-primary-foreground rounded-lg">
              <PlusCircle className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Log Practice Session</CardTitle>
              <CardDescription>Record your techniques, effort, and reflections from today's training.</CardDescription>
            </div>
          </div>
        </CardHeader>
      )}
      <form onSubmit={handleSubmit}>
        <CardContent className={cn("space-y-6", !isEditing ? "p-6" : "p-0")}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="date" className="text-sm font-semibold">Session Date</Label>
              <Input 
                id="date" 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)}
                required
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category" className="text-sm font-semibold">Session Type</Label>
              <Select value={category} onValueChange={(val) => setCategory(val as SessionCategory)}>
                <SelectTrigger id="category" className="bg-background">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Technical">Technical</SelectItem>
                  <SelectItem value="Randori">Randori</SelectItem>
                  <SelectItem value="Shiai">Shiai</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Effort Level</Label>
              <RadioGroup 
                value={effort.toString()} 
                onValueChange={(val) => setEffort(parseInt(val) as EffortLevel)}
                className="flex flex-wrap gap-x-4 gap-y-2 p-2 bg-secondary/50 rounded-lg border border-input min-h-10 items-center px-4"
              >
                {[1, 2, 3, 4, 5].map((val) => (
                  <div key={val} className="flex items-center space-x-2">
                    <RadioGroupItem value={val.toString()} id={`effort-${val}`} />
                    <Label htmlFor={`effort-${val}`} className="cursor-pointer font-medium text-xs whitespace-nowrap">
                      {EFFORT_LABELS[val as EffortLevel]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="description" className="text-sm font-semibold">What did you practice?</Label>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={handleTransform}
                disabled={isTransforming || !description}
                className="h-8 gap-2 text-primary hover:text-primary border-primary/20 hover:bg-primary/5 transition-all text-xs"
              >
                {isTransforming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                AI Transform
              </Button>
            </div>
            <Textarea 
              id="description" 
              placeholder="e.g., Practiced basic kuzushi, then moved into Ippon-seoi-nage drills..." 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px] bg-background focus:bg-background transition-colors"
            />
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Technique Tags</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSuggest}
                  disabled={isSuggesting || !description}
                  className="h-8 gap-2 text-primary hover:text-primary border-primary/20 hover:bg-primary/5 transition-all text-xs"
                >
                  {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  AI Tag Suggestion
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[40px] p-3 rounded-lg border border-dashed border-primary/20 bg-secondary/10">
                {techniques.length === 0 && (
                  <span className="text-sm text-muted-foreground/60 flex items-center gap-1.5">
                    <Brain className="h-4 w-4" />
                    Tags will appear here...
                  </span>
                )}
                {techniques.map((tech) => (
                  <Badge key={tech} className="gap-1 bg-primary text-white py-1 px-3">
                    {tech}
                    <button type="button" onClick={() => removeTech(tech)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Input 
                  placeholder="Manual tag (e.g. O-soto-gari)" 
                  value={newTech}
                  onChange={(e) => setNewTech(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTech();
                    }
                  }}
                  className="bg-background"
                />
                <Button type="button" variant="secondary" onClick={() => handleAddTech()}>
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-semibold">Personal Notes (Optional)</Label>
            <Textarea 
              id="notes" 
              placeholder="How did you feel? Any injuries or specific focus for next time?" 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-background focus:bg-background transition-colors"
            />
          </div>
        </CardContent>
        <CardFooter className={cn(
          "flex justify-end gap-3",
          !isEditing ? "bg-primary/5 border-t p-6" : "p-0 pt-6"
        )}>
          {isEditing && onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} className="gap-2">
              <Undo2 className="h-4 w-4" />
              Cancel
            </Button>
          )}
          <Button type="submit" className={cn(
            "gap-2 font-bold shadow-lg transition-transform hover:scale-[1.02]",
            !isEditing ? "px-8 py-6 text-lg" : "px-6 py-4"
          )}>
            <Save className="h-5 w-5" />
            {isEditing ? "Update Session" : "Log Training Session"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
