'use client';

import React, { useState, useEffect, useId, useRef } from 'react';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  X,
  Sparkles,
  Loader2,
  Save,
  Undo2,
  Wand2,
  PlusCircle,
} from 'lucide-react';
import {
  EffortLevel,
  EFFORT_LABELS,
  JudoSession,
  SessionCategory,
} from '@/lib/types';
import {
  saveSession,
  updateSession,
  getTransformerPrompt,
} from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { cn, formatLocalDateInputValue } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getAuthHeaders } from '@/lib/auth-session';
import { useAuth } from '@/components/auth-provider';
import { CARD_INTERACTION_CLASS } from '@/lib/interaction';
import { useActionFeedback } from '@/hooks/use-action-feedback';

interface SessionLogFormProps {
  onSuccess: () => void;
  sessionToEdit?: JudoSession;
  onCancel?: () => void;
  hideHeader?: boolean;
}

export function SessionLogForm({
  onSuccess,
  sessionToEdit,
  onCancel,
  hideHeader = false,
}: SessionLogFormProps) {
  const { toast } = useToast();
  const { canUseAi, authAvailable } = useAuth();
  const uniquePrefix = useId().replace(/[^a-zA-Z0-9]/g, 'id');
  const fid = (suffix: string) => `judo-log-${uniquePrefix}-${suffix}`;

  const isEditing = !!sessionToEdit;
  const shouldHideHeader = isEditing || hideHeader;

  const [date, setDate] = useState(sessionToEdit?.date || '');
  const [description, setDescription] = useState(
    sessionToEdit?.description || ''
  );
  const [techniques, setTechniques] = useState<string[]>(
    sessionToEdit?.techniques || []
  );
  const [newTech, setNewTech] = useState('');
  const [effort, setEffort] = useState<EffortLevel>(sessionToEdit?.effort || 3);
  const [category, setCategory] = useState<SessionCategory>(
    sessionToEdit?.category || 'Technical'
  );
  const [notes, setNotes] = useState(sessionToEdit?.notes || '');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const descriptionRef = useRef(description);
  const transformRequestIdRef = useRef(0);
  const suggestRequestIdRef = useRef(0);
  const transformFeedback = useActionFeedback();
  const suggestFeedback = useActionFeedback();
  const submitFeedback = useActionFeedback();
  const resetTransformFeedback = transformFeedback.reset;
  const resetSuggestFeedback = suggestFeedback.reset;
  const resetSubmitFeedback = submitFeedback.reset;

  useEffect(() => {
    setDate(sessionToEdit?.date || '');
    setDescription(sessionToEdit?.description || '');
    setTechniques(sessionToEdit?.techniques || []);
    setNewTech('');
    setEffort(sessionToEdit?.effort || 3);
    setCategory(sessionToEdit?.category || 'Technical');
    setNotes(sessionToEdit?.notes || '');
    setIsSuggesting(false);
    setIsTransforming(false);
    setIsSubmitting(false);
    transformRequestIdRef.current += 1;
    suggestRequestIdRef.current += 1;
    resetTransformFeedback();
    resetSuggestFeedback();
    resetSubmitFeedback();
  }, [
    sessionToEdit,
    resetTransformFeedback,
    resetSuggestFeedback,
    resetSubmitFeedback,
  ]);

  useEffect(() => {
    if (!date && !isEditing) {
      setDate(formatLocalDateInputValue(new Date()));
    }
  }, [date, isEditing]);

  useEffect(() => {
    descriptionRef.current = description;
  }, [description]);

  const handleAddTech = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (newTech.trim() && !techniques.includes(newTech.trim())) {
      setTechniques([...techniques, newTech.trim()]);
      setNewTech('');
    }
  };

  const removeTech = (tech: string) => {
    setTechniques(techniques.filter((t) => t !== tech));
  };

  const handleTransform = async () => {
    if (!canUseAi) {
      toast({
        title: 'Sign-in required',
        description: authAvailable
          ? 'AI description transforms are available after sign-in.'
          : 'AI description transforms are unavailable because authentication is not configured.',
      });
      return;
    }

    if (!description.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nothing to transform',
        description: 'Please write a draft of what you practiced first.',
      });
      return;
    }

    transformFeedback.startLoading();
    setIsTransforming(true);
    const requestId = ++transformRequestIdRef.current;
    const submittedDescription = description;
    try {
      const customPrompt = getTransformerPrompt();
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/ai/transform-description', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description,
          customPrompt,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to transform description');
      }
      const result = await response.json();
      if (
        requestId !== transformRequestIdRef.current ||
        descriptionRef.current !== submittedDescription
      ) {
        return;
      }
      setDescription(result.transformedDescription);
      transformFeedback.showSuccess();
      toast({
        title: 'Description Refined',
        description:
          'AI has polished your training notes based on your prompt settings.',
      });
    } catch {
      transformFeedback.showError();
      toast({
        variant: 'destructive',
        title: 'Transformation Failed',
        description: 'There was an error refining your description.',
      });
    } finally {
      setIsTransforming(false);
    }
  };

  const handleSuggest = async () => {
    if (!canUseAi) {
      toast({
        title: 'Sign-in required',
        description: authAvailable
          ? 'AI tag suggestions are available after sign-in.'
          : 'AI tag suggestions are unavailable because authentication is not configured.',
      });
      return;
    }

    if (!description.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing description',
        description: 'Please write what you practiced to get suggestions.',
      });
      return;
    }

    suggestFeedback.startLoading();
    setIsSuggesting(true);
    const requestId = ++suggestRequestIdRef.current;
    const submittedDescription = description;
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/ai/suggest-techniques', {
        method: 'POST',
        headers,
        body: JSON.stringify({ description }),
      });
      if (!response.ok) {
        throw new Error('Failed to suggest techniques');
      }
      const payload = await response.json();
      const suggestions: string[] = Array.isArray(payload.suggestions)
        ? payload.suggestions.filter(
            (suggestion: unknown): suggestion is string =>
              typeof suggestion === 'string'
          )
        : [];
      const uniqueNew = suggestions.filter(
        (suggestion) => !techniques.includes(suggestion)
      );
      if (
        requestId !== suggestRequestIdRef.current ||
        descriptionRef.current !== submittedDescription
      ) {
        return;
      }
      if (uniqueNew.length > 0) {
        setTechniques((previousTechniques) => {
          const merged = new Set(previousTechniques);
          uniqueNew.forEach((technique) => merged.add(technique));
          return Array.from(merged);
        });
        suggestFeedback.showSuccess();
        toast({
          title: 'AI Suggestions Added',
          description: `Identified ${uniqueNew.length} techniques from your description.`,
        });
      } else {
        suggestFeedback.reset();
        toast({
          description:
            suggestions.length > 0
              ? 'All suggested techniques are already tagged.'
              : "AI couldn't identify specific techniques.",
        });
      }
    } catch {
      suggestFeedback.showError();
      toast({
        variant: 'destructive',
        title: 'AI Suggestion Failed',
        description: 'There was an error connecting to the AI helper.',
      });
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (techniques.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Incomplete log',
        description: 'Please add at least one technique tag.',
      });
      return;
    }

    const sessionData: JudoSession = {
      id:
        sessionToEdit?.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2)),
      date,
      techniques,
      effort,
      category,
      description,
      notes,
    };

    setIsSubmitting(true);
    submitFeedback.startLoading();

    try {
      const result = isEditing
        ? await updateSession(sessionData)
        : await saveSession(sessionData);

      toast({
        title: isEditing ? 'Session Updated!' : 'Session Saved!',
        description:
          result.status === 'queued'
            ? 'Changes are saved locally and queued to sync when the connection is ready.'
            : undefined,
      });

      if (!isEditing) {
        setTechniques([]);
        setDescription('');
        setNotes('');
        setEffort(3);
        setCategory('Technical');
      }

      submitFeedback.showSuccess();
      onSuccess();
    } catch {
      submitFeedback.showError();
      toast({
        variant: 'destructive',
        title: isEditing ? 'Update Failed' : 'Save Failed',
        description:
          'The change could not be saved. Your local view has been reconciled to match persisted data.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card
      className={cn(
        'max-w-4xl mx-auto shadow-lg bg-card/95',
        !shouldHideHeader && CARD_INTERACTION_CLASS,
        shouldHideHeader && 'shadow-none border-0 bg-transparent'
      )}
    >
      {!shouldHideHeader && (
        <CardHeader className="bg-secondary/45">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary text-primary-foreground rounded-lg">
              <PlusCircle className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Log Practice Session</CardTitle>
              <CardDescription>
                Record your techniques, effort, and reflections.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      )}
      <form onSubmit={handleSubmit} autoComplete="off">
        <CardContent
          className={cn('space-y-8', !shouldHideHeader ? 'p-8' : 'p-0')}
        >
          {!canUseAi && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {authAvailable
                ? 'Guest mode can log sessions locally. Sign in to unlock AI transform and AI tag suggestion.'
                : 'Guest mode can log sessions locally. AI features are unavailable until Firebase authentication is configured.'}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-3 space-y-2.5">
              <Label
                htmlFor={fid('date')}
                className="text-sm font-semibold block h-5"
              >
                Session Date
              </Label>
              <Input
                id={fid('date')}
                name="sessionDate"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="bg-background h-11"
              />
            </div>
            <div className="md:col-span-3 space-y-2.5">
              <Label
                htmlFor={fid('category')}
                className="text-sm font-semibold block h-5"
              >
                Session Type
              </Label>
              <Select
                name="sessionCategory"
                value={category}
                onValueChange={(val) => setCategory(val as SessionCategory)}
              >
                <SelectTrigger
                  id={fid('category')}
                  className="bg-background h-11"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Technical">Technical</SelectItem>
                  <SelectItem value="Randori">Randori</SelectItem>
                  <SelectItem value="Shiai">Shiai</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-6 space-y-2.5">
              <Label className="text-sm font-semibold block h-5">
                Effort Level
              </Label>
              <RadioGroup
                name="sessionEffort"
                value={effort.toString()}
                onValueChange={(val) => setEffort(parseInt(val) as EffortLevel)}
                className="flex items-center justify-around h-11 px-2 bg-background/90 rounded-md"
              >
                {[1, 2, 3, 4, 5].map((val) => (
                  <div
                    key={fid(`effort-${val}`)}
                    className="flex items-center space-x-1"
                  >
                    <RadioGroupItem
                      value={val.toString()}
                      id={fid(`effort-radio-${val}`)}
                    />
                    <Label
                      htmlFor={fid(`effort-radio-${val}`)}
                      className="cursor-pointer font-medium text-[11px] leading-none whitespace-nowrap"
                    >
                      {EFFORT_LABELS[val as EffortLevel]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label
                htmlFor={fid('description')}
                className="text-sm font-semibold"
              >
                What did you practice?
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTransform}
                interaction="subtle"
                feedbackState={
                  isTransforming ? 'loading' : transformFeedback.feedbackState
                }
                disabled={
                  !canUseAi || isTransforming || isSubmitting || !description
                }
                className="h-8 gap-2 text-primary border-primary/20 hover:bg-primary/5 text-xs"
              >
                {isTransforming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                AI Transform
              </Button>
            </div>
            <Textarea
              id={fid('description')}
              name="practiceDescription"
              placeholder="Quick notes about drills, throws, or focus..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[140px] bg-background text-base"
            />

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Technique Tags
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSuggest}
                  interaction="subtle"
                  feedbackState={
                    isSuggesting ? 'loading' : suggestFeedback.feedbackState
                  }
                  disabled={
                    !canUseAi || isSuggesting || isSubmitting || !description
                  }
                  className="h-8 gap-2 text-primary border-primary/20 hover:bg-primary/5 text-xs"
                >
                  {isSuggesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI Tag Suggestion
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[48px] p-4 rounded-lg border border-dashed border-ghost bg-secondary/25">
                {techniques.length === 0 && (
                  <span className="text-sm text-muted-foreground/60 flex items-center gap-1.5">
                    <Brain className="h-4 w-4" />
                    Tags will appear here...
                  </span>
                )}
                {techniques.map((tech) => (
                  <Badge
                    key={fid(`tech-badge-${tech}`)}
                    className="gap-1 bg-primary text-white py-1.5 px-3 text-sm"
                  >
                    {tech}
                    <button
                      type="button"
                      onClick={() => removeTech(tech)}
                      className="ml-1 rounded-full transition-[color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-destructive hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  id={fid('manual-tag')}
                  name="manualTagEntry"
                  placeholder="Manual tag (e.g. O-soto-gari)"
                  value={newTech}
                  onChange={(e) => setNewTech(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTech();
                    }
                  }}
                  className="bg-background h-10"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleAddTech()}
                  interaction="subtle"
                  disabled={isSubmitting}
                  className="h-10 px-6"
                >
                  Add Tag
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor={fid('notes')}
              className="text-sm font-semibold text-muted-foreground"
            >
              Personal Notes (Optional)
            </Label>
            <Textarea
              id={fid('notes')}
              name="personalNotes"
              placeholder="How did you feel?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-background"
            />
          </div>
        </CardContent>
        <CardFooter
          className={cn(
            'flex justify-end gap-3',
            !shouldHideHeader ? 'bg-secondary/45 p-8' : 'p-0 pt-6'
          )}
        >
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              interaction="subtle"
              onClick={onCancel}
              disabled={isSubmitting}
              className="gap-2 h-11 px-6"
            >
              <Undo2 className="h-4 w-4" />
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={isSubmitting}
            interaction="primary-action"
            feedbackState={
              isSubmitting ? 'loading' : submitFeedback.feedbackState
            }
            className={cn(
              'gap-2 font-bold shadow-lg',
              !shouldHideHeader ? 'px-10 py-6 text-lg h-14' : 'px-8 py-5 h-12'
            )}
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            {isEditing ? 'Update Session' : 'Log Training Session'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
