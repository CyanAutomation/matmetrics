'use client';

import type { RefObject } from 'react';
import type { useSessionAssessment } from '@/hooks/use-session-assessment';
import type { useSessionFormAi } from '@/hooks/use-session-form-ai';
import type { useSessionFormState, useVideoUrlValidation } from '@/hooks/use-session-form';
import type { useSessionLogFormActions } from '@/hooks/use-session-log-form-actions';
import type { SessionCategory } from '@/lib/types';
import { SessionEssentialsSection } from './session-essentials-section';
import { PracticeDescriptionSection } from './practice-description-section';
import { TechniqueTagsSection } from './technique-tags-section';
import { OptionalFieldsSection } from './optional-fields-section';
import { SessionCheckin } from './session-checkin';
import { SessionReviewSummary } from './session-review-summary';

type SessionLogFormStepContentProps = {
  step: number;
  fid: (suffix: string) => string;
  activeStepHeadingRef: RefObject<HTMLHeadingElement | null>;
  formState: ReturnType<typeof useSessionFormState>;
  availableCategories: SessionCategory[];
  showAvatar: boolean;
  canUseAi: boolean;
  isSubmitting: boolean;
  aiForm: ReturnType<typeof useSessionFormAi>;
  sessionAssessment: ReturnType<typeof useSessionAssessment>;
  formActions: ReturnType<typeof useSessionLogFormActions>;
  videoUrlValidationMessage: ReturnType<typeof useVideoUrlValidation>;
};

export function SessionLogFormStepContent({
  step,
  fid,
  activeStepHeadingRef,
  formState,
  availableCategories,
  showAvatar,
  canUseAi,
  isSubmitting,
  aiForm,
  sessionAssessment,
  formActions,
  videoUrlValidationMessage,
}: SessionLogFormStepContentProps) {
  if (step === 0) {
    return (
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
    );
  }

  if (step === 1) {
    return (
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
          onTransform={formActions.handleTransform}
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
    );
  }

  if (step === 2) {
    return (
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
          Add technique tags to make this session easier to find later. You can
          continue without adding any.
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
          onSuggest={formActions.handleSuggest}
          onAddTech={formActions.handleAddTech}
          onRemoveTech={formActions.handleRemoveTech}
        />
      </section>
    );
  }

  if (step === 3) {
    return (
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
    );
  }

  return null;
}
