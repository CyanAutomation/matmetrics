'use client';

import React, { useId, useCallback, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RessaImage } from '@/components/ressa-image';
import { Brain, X, Sparkles, Loader2, Wand2, PlusCircle } from 'lucide-react';
import { EFFORT_LABELS, EFFORT_COLORS, JudoSession } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/components/auth-provider';
import { CARD_INTERACTION_CLASS } from '@/lib/interaction';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { useSessionFormAi } from '@/hooks/use-session-form-ai';
import { useSessionLogFormActions } from '@/hooks/use-session-log-form-actions';
import {
  useSessionFormState,
  useVideoUrlValidation,
  useFormSubmit,
} from '@/hooks/use-session-form';
import { SessionLogFormFooter } from './session-log-form-footer';

interface SessionLogFormProps {
  onSuccess: () => void;
  sessionToEdit?: JudoSession;
  onCancel?: () => void;
  hideHeader?: boolean;
  showAvatar?: boolean;
}

export function SessionLogForm({
  onSuccess,
  sessionToEdit,
  onCancel,
  hideHeader = false,
  showAvatar = true,
}: SessionLogFormProps) {
  const { toast } = useToast();
  const { canUseAi, authAvailable } = useAuth();
  const uniquePrefix = useId().replace(/[^a-zA-Z0-9]/g, 'id');
  const fid = (suffix: string) => `judo-log-${uniquePrefix}-${suffix}`;

  const shouldHideHeader = !!sessionToEdit || hideHeader;
  const aiForm = useSessionFormAi();
  const submitFeedback = useActionFeedback();
  const resetAiForm = aiForm.reset;
  const resetSubmitFeedback = submitFeedback.reset;

  // Use custom hooks for form state management
  const formState = useSessionFormState(sessionToEdit);
  const videoUrlValidationMessage = useVideoUrlValidation(formState.videoUrl);

  // Reset AI form and feedback when sessionToEdit changes
  useEffect(() => {
    resetAiForm();
    resetSubmitFeedback();
  }, [sessionToEdit, resetAiForm, resetSubmitFeedback]);

  // Form submit hook
  const { isSubmitting, submit: submitForm } = useFormSubmit(
    {
      date: formState.date,
      duration: formState.duration,
      description: formState.description,
      techniques: formState.techniques,
      effort: formState.effort,
      category: formState.category,
      notes: formState.notes,
      videoUrl: formState.videoUrl,
    },
    sessionToEdit,
    {
      onSuccess: () => {
        if (!formState.isEditing) {
          formState.reset();
        }
        submitFeedback.showSuccess();
        onSuccess();
      },
      onError: () => {
        submitFeedback.showError();
      },
      onStart: () => {
        submitFeedback.startLoading();
      },
      showToast: (toastProps) => {
        toast({
          variant: toastProps.variant as any,
          title: toastProps.title,
          description: toastProps.description,
        });
      },
    }
  );

  const { handleAddTech, handleTransform, handleSuggest, handleRemoveTech } =
    useSessionLogFormActions(formState, aiForm);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await submitForm();
    },
    [submitForm]
  );

  return (
    <Card
      className={cn(
        'max-w-4xl mx-auto shadow-lg',
        !shouldHideHeader && CARD_INTERACTION_CLASS
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
            </div>
          </div>
        </CardHeader>
      )}
      <form onSubmit={handleSubmit} autoComplete="off">
        <CardContent
          className={cn('space-y-6', !shouldHideHeader ? 'p-8' : 'p-4 sm:p-6')}
        >
          {!canUseAi && (
            <div className="ui-tone-warning-soft rounded-lg border px-4 py-3 text-sm">
              {authAvailable
                ? 'Guest mode can log sessions locally. Sign in to unlock AI transform and AI tag suggestion.'
                : 'Guest mode can log sessions locally. AI features are unavailable until Firebase authentication is configured.'}
            </div>
          )}

          {/* Header Section: Avatar + Session Controls */}
          <div
            className={cn(
              'bg-secondary/25 rounded-lg p-4 lg:-mx-0 lg:rounded-lg lg:p-5 lg:bg-secondary/25',
              !shouldHideHeader && '-mx-6 -mt-6'
            )}
          >
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
              {/* Avatar - Hidden on mobile, visible on lg and above */}
              {showAvatar && (
                <div className="hidden md:flex shrink-0">
                  <RessaImage
                    pose={1}
                    size="medium"
                    alt="Ressa in coach mode, ready to help log your training session"
                    className="shrink-0"
                  />
                </div>
              )}

              {/* Session Control Fields */}
              <div className="flex-1 w-full space-y-4">
                {/* Row 1: Date, Duration, Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 items-start">
                  {/* Session Date */}
                  <div className="space-y-2.5">
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
                      value={formState.date}
                      onChange={(e) => formState.setDate(e.target.value)}
                      required
                      className="bg-background h-11"
                    />
                  </div>

                  {/* Duration */}
                  <div className="space-y-2.5">
                    <Label
                      htmlFor={fid('duration')}
                      className="text-sm font-semibold block h-5"
                    >
                      Duration (min)
                    </Label>
                    <Input
                      id={fid('duration')}
                      name="sessionDuration"
                      type="number"
                      min="1"
                      max="999"
                      placeholder="90"
                      title="How long was your practice session in minutes?"
                      aria-label="Session duration in minutes"
                      value={formState.duration}
                      onChange={(e) => formState.setDuration(e.target.value)}
                      className="bg-background h-11"
                    />
                  </div>

                  {/* Session Type */}
                  <div className="space-y-2.5">
                    <Label
                      htmlFor={fid('category')}
                      className="text-sm font-semibold block h-5"
                    >
                      Session Type
                    </Label>
                    <Select
                      name="sessionCategory"
                      value={formState.category}
                      onValueChange={(val) =>
                        formState.setCategory(val as typeof formState.category)
                      }
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
                </div>

                {/* Row 2: Effort Level (Full Width) */}
                <div className="space-y-2.5">
                  <div className="h-5 flex items-center justify-between">
                    <Label className="text-sm font-semibold">
                      Effort Level
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {EFFORT_LABELS[formState.effort]}
                    </span>
                  </div>
                  <div className="flex gap-2 h-11 bg-background/90 rounded-md p-1.5">
                    {[1, 2, 3, 4, 5].map((val) => {
                      const effortVal = val as typeof formState.effort;
                      const isSelected = formState.effort === effortVal;
                      return (
                        <Button
                          key={fid(`effort-${val}`)}
                          type="button"
                          onClick={() => formState.setEffort(effortVal)}
                          className={cn(
                            'flex-1 px-0 font-semibold transition-all duration-200 text-sm',
                            isSelected
                              ? `${EFFORT_COLORS[effortVal]} border border-current shadow-sm`
                              : 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
                          )}
                          title={EFFORT_LABELS[effortVal]}
                          aria-label={`Effort level: ${EFFORT_LABELS[effortVal]}`}
                          aria-pressed={isSelected}
                        >
                          {val}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
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
                feedbackState={aiForm.isLoadingTransform ? 'loading' : 'idle'}
                disabled={
                  !canUseAi ||
                  aiForm.isLoadingTransform ||
                  isSubmitting ||
                  !formState.description
                }
                className="h-8 gap-2 text-primary border-primary/20 hover:bg-primary/5 text-xs"
              >
                {aiForm.isLoadingTransform ? (
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
              value={formState.description}
              onChange={(e) => formState.setDescription(e.target.value)}
              className="min-h-[112px] bg-background text-base"
            />

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label
                  htmlFor={fid('video-url')}
                  className="text-sm font-semibold text-muted-foreground"
                >
                  Relevant Video URL (Optional)
                </Label>
                <Input
                  id={fid('video-url')}
                  name="sessionVideoUrl"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ"
                  value={formState.videoUrl}
                  onChange={(e) => formState.setVideoUrl(e.target.value)}
                  aria-invalid={videoUrlValidationMessage ? 'true' : 'false'}
                  className="bg-background"
                />
                {videoUrlValidationMessage ? (
                  <p className="text-sm text-destructive">
                    {videoUrlValidationMessage}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Paste a public YouTube or other http(s) video link related
                    to this session.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-label-md text-muted-foreground">
                  Technique Tags
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSuggest}
                  feedbackState={aiForm.isLoadingSuggest ? 'loading' : 'idle'}
                  disabled={
                    !canUseAi ||
                    aiForm.isLoadingSuggest ||
                    isSubmitting ||
                    !formState.description
                  }
                  className="h-7 gap-1.5 text-muted-foreground hover:text-foreground text-xs"
                >
                  {aiForm.isLoadingSuggest ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Suggest tags
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[48px] p-4 rounded-lg bg-muted/45 ring-1 ring-black/5 dark:ring-white/10 [[data-contrast='high']_&]:ring-[hsl(var(--color-outline-variant)/0.9)]">
                {formState.techniques.length === 0 && (
                  <span className="text-sm text-muted-foreground/60 flex items-center gap-1.5">
                    <Brain className="h-4 w-4" />
                    Tags will appear here...
                  </span>
                )}
                {formState.techniques.map((tech) => (
                  <Badge
                    key={fid(`tech-badge-${tech}`)}
                    className="gap-1 bg-primary text-white py-1.5 px-3 text-sm"
                  >
                    {tech}
                    <button
                      type="button"
                      onClick={() => handleRemoveTech(tech)}
                      className="ml-1 rounded-full transition-[color,transform] duration-200 ease-snappy hover:text-destructive hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
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
                  value={formState.newTech}
                  onChange={(e) => formState.setNewTech(e.target.value)}
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
              value={formState.notes}
              onChange={(e) => formState.setNotes(e.target.value)}
              className="bg-background"
            />
          </div>
        </CardContent>
        <CardFooter className="p-0">
          <SessionLogFormFooter
            isSubmitting={isSubmitting}
            isEditing={formState.isEditing}
            shouldHideHeader={shouldHideHeader}
            feedbackState={submitFeedback.feedbackState}
            onCancel={onCancel}
          />
        </CardFooter>
      </form>
    </Card>
  );
}
