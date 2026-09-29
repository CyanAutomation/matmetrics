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
import { useSessionAssessment } from '@/hooks/use-session-assessment';
import { LinearStepProgress } from '@/components/ui/linear-step-progress';
import { SessionLogFormStepContent } from './session-log-form-step-content';

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

  const formActions = useSessionLogFormActions(formState, aiForm);

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

  const handleFinish = useCallback(() => {
    formRef.current?.requestSubmit();
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

          <SessionLogFormStepContent
            step={currentStep}
            fid={fid}
            activeStepHeadingRef={activeStepHeadingRef}
            formState={formState}
            availableCategories={availableCategories}
            showAvatar={showAvatar}
            canUseAi={canUseAi}
            isSubmitting={isSubmitting}
            aiForm={aiForm}
            sessionAssessment={sessionAssessment}
            formActions={formActions}
            videoUrlValidationMessage={videoUrlValidationMessage}
          />
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
          onFinish={handleFinish}
          onCancel={onCancel}
        />
      </form>
    </Card>
  );
}
