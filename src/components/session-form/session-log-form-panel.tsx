'use client';

import React, { useId, useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';
import { JudoSession, SessionCategory } from '@/lib/types';
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
import { SessionCheckin } from './session-checkin';
import { useSessionAssessment } from '@/hooks/use-session-assessment';
import { LinearStepProgress } from '@/components/ui/linear-step-progress';
import { SessionReviewSummary } from './session-review-summary';

const SESSION_FORM_STEPS = [
  'Session details',
  'Practice description',
  'Techniques',
  'Review',
] as const;

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
  const { canUseAi, authAvailable, preferences } = useAuth();
  const uniquePrefix = useId().replace(/[^a-zA-Z0-9]/g, 'id');
  const fid = (suffix: string) => `judo-log-${uniquePrefix}-${suffix}`;

  const shouldHideHeader = !!sessionToEdit || hideHeader;
  const [currentStep, setCurrentStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const activeStepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef(currentStep);
  const aiForm = useSessionFormAi();
  const sessionAssessment = useSessionAssessment();
  const invalidateSessionAssessment = sessionAssessment.invalidate;
  const submitFeedback = useActionFeedback();
  const resetAiForm = aiForm.reset;
  const resetSubmitFeedback = submitFeedback.reset;

  // Use custom hooks for form state management
  const formState = useSessionFormState(sessionToEdit);
  const availableCategories = sessionToEdit
    ? Array.from(
        new Set<SessionCategory>([
          ...preferences.sessionTypes.enabledCategories,
          sessionToEdit.category,
        ])
      )
    : preferences.sessionTypes.enabledCategories;
  const videoUrlValidationMessage = useVideoUrlValidation(formState.videoUrl);

  // Reset AI form and feedback when sessionToEdit changes
  useEffect(() => {
    resetAiForm();
    resetSubmitFeedback();
  }, [sessionToEdit, resetAiForm, resetSubmitFeedback]);

  useEffect(() => {
    setCurrentStep(0);
  }, [sessionToEdit?.id]);

  useEffect(() => {
    if (previousStepRef.current === currentStep) return;
    activeStepHeadingRef.current?.focus();
    previousStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    invalidateSessionAssessment();
  }, [
    formState.category,
    formState.description,
    formState.notes,
    formState.effort,
    formState.techniques,
    invalidateSessionAssessment,
  ]);

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
          setCurrentStep(0);
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
      if (currentStep !== SESSION_FORM_STEPS.length - 1) return;
      await submitForm();
    },
    [currentStep, submitForm]
  );

  const handleNext = useCallback(() => {
    if (formRef.current && !formRef.current.reportValidity()) return;
    setCurrentStep((step) => Math.min(step + 1, SESSION_FORM_STEPS.length - 1));
  }, []);

  const handlePrevious = useCallback(() => {
    setCurrentStep((step) => Math.max(step - 1, 0));
  }, []);

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
      <form ref={formRef} onSubmit={handleSubmit} autoComplete="off">
        <CardContent
          className={cn('space-y-6', !shouldHideHeader ? 'p-8' : 'p-4 sm:p-6')}
        >
          <LinearStepProgress
            steps={SESSION_FORM_STEPS}
            currentStep={currentStep}
          />

          <AiUnavailableBanner
            canUseAi={canUseAi}
            authAvailable={authAvailable}
          />

          {currentStep === 0 ? (
            <section aria-labelledby={fid('step-details-title')}>
              <h2
                ref={activeStepHeadingRef}
                id={fid('step-details-title')}
                tabIndex={-1}
                className="mb-4 text-lg font-semibold"
              >
                Session details
              </h2>
              <SessionEssentialsSection
                date={formState.date}
                duration={formState.duration}
                category={formState.category}
                availableCategories={availableCategories}
                effort={formState.effort}
                showAvatar={showAvatar}
                shouldHideHeader
                fid={fid}
                setDate={formState.setDate}
                setDuration={formState.setDuration}
                setCategory={formState.setCategory}
                setEffort={formState.setEffort}
              />
            </section>
          ) : null}

          {currentStep === 1 ? (
            <section
              aria-labelledby={fid('step-description-title')}
              className="space-y-5"
            >
              <h2
                ref={activeStepHeadingRef}
                id={fid('step-description-title')}
                tabIndex={-1}
                className="text-lg font-semibold"
              >
                Describe your practice
              </h2>
              <PracticeDescriptionSection
                description={formState.description}
                setDescription={formState.setDescription}
                canUseAi={canUseAi}
                isSubmitting={isSubmitting}
                transformLoading={aiForm.isLoadingTransform}
                transformMessage={aiForm.transformMessage}
                fid={fid}
                onTransform={handleTransform}
              />
              <SessionCheckin
                canUseAi={canUseAi}
                disabled={isSubmitting || !formState.description}
                isLoading={sessionAssessment.isLoading}
                assessment={sessionAssessment.assessment}
                currentCategory={formState.category}
                onAssess={() =>
                  sessionAssessment.assess({
                    description: formState.description,
                    notes: formState.notes,
                    category: formState.category,
                    effort: formState.effort,
                    techniques: formState.techniques,
                  })
                }
                onApplyCategory={formState.setCategory}
              />
            </section>
          ) : null}

          {currentStep === 2 ? (
            <section
              aria-labelledby={fid('step-techniques-title')}
              className="space-y-4"
            >
              <h2
                ref={activeStepHeadingRef}
                id={fid('step-techniques-title')}
                tabIndex={-1}
                className="text-lg font-semibold"
              >
                Techniques practiced
              </h2>
              <p className="text-sm text-muted-foreground">
                Add technique tags to make this session easier to find later.
                You can continue without adding any.
              </p>
              <TechniqueTagsSection
                techniques={formState.techniques}
                newTech={formState.newTech}
                setNewTech={formState.setNewTech}
                canUseAi={canUseAi}
                isSubmitting={isSubmitting}
                suggestLoading={aiForm.isLoadingSuggest}
                suggestMessage={aiForm.suggestMessage}
                description={formState.description}
                fid={fid}
                onSuggest={handleSuggest}
                onAddTech={handleAddTech}
                onRemoveTech={handleRemoveTech}
              />
            </section>
          ) : null}

          {currentStep === 3 ? (
            <section
              aria-labelledby={fid('step-review-title')}
              className="space-y-5"
            >
              <h2
                ref={activeStepHeadingRef}
                id={fid('step-review-title')}
                tabIndex={-1}
                className="text-lg font-semibold"
              >
                Review and finish
              </h2>
              <OptionalFieldsSection
                videoUrl={formState.videoUrl}
                notes={formState.notes}
                setVideoUrl={formState.setVideoUrl}
                setNotes={formState.setNotes}
                videoUrlValidationMessage={videoUrlValidationMessage}
                isSubmitting={isSubmitting}
                fid={fid}
              />
              <SessionReviewSummary
                date={formState.date}
                duration={formState.duration}
                description={formState.description}
                notes={formState.notes}
                videoUrl={formState.videoUrl}
                techniques={formState.techniques}
                effort={formState.effort}
                category={formState.category}
              />
            </section>
          ) : null}
        </CardContent>

        <SessionLogFormFooter
          isEditing={formState.isEditing}
          isSubmitting={isSubmitting}
          shouldHideHeader={shouldHideHeader}
          feedbackState={submitFeedback.feedbackState}
          currentStep={currentStep}
          totalSteps={SESSION_FORM_STEPS.length}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onCancel={onCancel}
        />
      </form>
    </Card>
  );
}
