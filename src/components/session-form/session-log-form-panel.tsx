'use client';

import React, { useId, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';
import { JudoSession } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
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
import { AiUnavailableBanner } from './ai-unavailable-banner';
import { SessionEssentialsSection } from './session-essentials-section';
import { PracticeDescriptionSection } from './practice-description-section';
import { TechniqueTagsSection } from './technique-tags-section';
import { OptionalFieldsSection } from './optional-fields-section';

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
              <CardTitle>Log session</CardTitle>
            </div>
          </div>
        </CardHeader>
      )}
      <form onSubmit={handleSubmit} autoComplete="off">
        <CardContent
          className={cn('space-y-6', !shouldHideHeader ? 'p-8' : 'p-4 sm:p-6')}
        >
          <AiUnavailableBanner
            canUseAi={canUseAi}
            authAvailable={authAvailable}
          />

          <SessionEssentialsSection
            date={formState.date}
            duration={formState.duration}
            category={formState.category}
            effort={formState.effort}
            showAvatar={showAvatar}
            shouldHideHeader={shouldHideHeader}
            fid={fid}
            setDate={formState.setDate}
            setDuration={formState.setDuration}
            setCategory={formState.setCategory}
            setEffort={formState.setEffort}
          />

          <PracticeDescriptionSection
            description={formState.description}
            setDescription={formState.setDescription}
            canUseAi={canUseAi}
            isSubmitting={isSubmitting}
            transformLoading={aiForm.isLoadingTransform}
            fid={fid}
            onTransform={handleTransform}
          />

          <TechniqueTagsSection
            techniques={formState.techniques}
            newTech={formState.newTech}
            setNewTech={formState.setNewTech}
            canUseAi={canUseAi}
            isSubmitting={isSubmitting}
            suggestLoading={aiForm.isLoadingSuggest}
            description={formState.description}
            fid={fid}
            onSuggest={handleSuggest}
            onAddTech={handleAddTech}
            onRemoveTech={handleRemoveTech}
          />

          <OptionalFieldsSection
            videoUrl={formState.videoUrl}
            notes={formState.notes}
            setVideoUrl={formState.setVideoUrl}
            setNotes={formState.setNotes}
            videoUrlValidationMessage={videoUrlValidationMessage}
            isSubmitting={isSubmitting}
            fid={fid}
          />
        </CardContent>

        <SessionLogFormFooter
          isEditing={formState.isEditing}
          isSubmitting={isSubmitting}
          shouldHideHeader={shouldHideHeader}
          feedbackState={submitFeedback.feedbackState}
          onCancel={onCancel}
        />
      </form>
    </Card>
  );
}
