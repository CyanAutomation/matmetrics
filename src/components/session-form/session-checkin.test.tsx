import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PracticeDescriptionSection } from './practice-description-section';
import { SessionCheckin } from './session-checkin';
import { TechniqueTagsSection } from './technique-tags-section';

const sessionAssessment = {
  suggestedCategory: 'Technical' as const,
  categoryConfidence: 0.94,
  categoryFitProbability: 0.96,
  hasUsefulDetail: 0.9,
  hasReflection: 0.8,
  fatigueSignal: 0.2,
  injurySignal: 0.1,
  effortConflictProbability: 0.1,
  unsupportedTechniqueTags: [] as string[],
};

function renderCheckin(
  assessment: typeof sessionAssessment,
  currentCategory:
    'Technical' | 'Randori' | 'Shiai' | 'Cardio' | 'S&C' = 'Technical'
) {
  return renderToStaticMarkup(
    React.createElement(SessionCheckin, {
      canUseAi: true,
      disabled: false,
      isLoading: false,
      assessment,
      currentCategory,
      onAssess: () => undefined,
      onApplyCategory: () => undefined,
    })
  );
}

test('category check-in abstains when no existing category clearly fits', () => {
  const html = renderCheckin({
    ...sessionAssessment,
    categoryFitProbability: 0.42,
  });

  assert.match(html, /could not confidently match/i);
  assert.doesNotMatch(html, /Suggested type:/);
  assert.doesNotMatch(html, /Apply session type/);
});

test('category check-in exposes an apply action only when fit and confidence pass policy', () => {
  assert.match(renderCheckin(sessionAssessment), /Suggested type:/);
  assert.match(renderCheckin(sessionAssessment), /Apply session type/);
  assert.doesNotMatch(
    renderCheckin({ ...sessionAssessment, categoryConfidence: 0.79 }),
    /Apply session type/
  );
});

test('check-in describes a possible mismatch with the currently selected category', () => {
  const html = renderCheckin(sessionAssessment, 'Randori');
  assert.match(html, /Possible type mismatch/i);
  assert.match(html, /selected type is Randori/i);
});

test('check-in prompts for a useful detail without judging entry length', () => {
  const html = renderCheckin({
    ...sessionAssessment,
    hasUsefulDetail: 0.49,
  });

  assert.match(html, /add one concrete detail/i);
  assert.match(html, /short entry can still be useful/i);
});

test('check-in flags only high-confidence explicit effort conflicts', () => {
  const flagged = renderCheckin({
    ...sessionAssessment,
    effortConflictProbability: 0.8,
  });
  const clear = renderCheckin({
    ...sessionAssessment,
    effortConflictProbability: 0.79,
  });

  assert.match(flagged, /may conflict with the effort rating you chose/i);
  assert.doesNotMatch(clear, /may conflict with the effort rating you chose/i);
});

test('check-in labels saved technique tags for review without removing them', () => {
  const html = renderCheckin({
    ...sessionAssessment,
    unsupportedTechniqueTags: ['O-soto-gari'],
  });

  assert.match(html, /could not confirm these saved technique tags/i);
  assert.match(html, /O-soto-gari/);
  assert.match(html, /they have not been removed/i);
});

test('check-in distinguishes fatigue from pain or injury mentions', () => {
  const fatigueHtml = renderCheckin({
    ...sessionAssessment,
    fatigueSignal: 1,
    injurySignal: 0.1,
  });
  const injuryHtml = renderCheckin({
    ...sessionAssessment,
    fatigueSignal: 0.2,
    injurySignal: 0.8,
  });

  assert.match(fatigueHtml, /text mentions fatigue or difficult recovery/i);
  assert.doesNotMatch(fatigueHtml, /pain or injury/i);
  assert.match(injuryHtml, /text may mention pain or injury/i);
  assert.match(injuryHtml, /not a diagnosis/i);
  assert.doesNotMatch(injuryHtml, /next hard session/i);
});

test('AI form sections disclose external processing without naming providers or models', () => {
  const disclosureProps = {
    description: 'Drilled uchi mata.',
    setDescription: () => undefined,
    canUseAi: true,
    isSubmitting: false,
    transformLoading: false,
    transformMessage: null,
    fid: (suffix: string) => suffix,
    onTransform: () => undefined,
  };
  const tagProps = {
    techniques: [],
    newTech: '',
    setNewTech: () => undefined,
    canUseAi: true,
    isSubmitting: false,
    suggestLoading: false,
    suggestMessage: null,
    description: 'Drilled uchi mata.',
    fid: (suffix: string) => suffix,
    onSuggest: () => undefined,
    onAddTech: () => undefined,
    onRemoveTech: () => undefined,
  };
  const transformHtml = renderToStaticMarkup(
    React.createElement(PracticeDescriptionSection, disclosureProps)
  );
  const tagsHtml = renderToStaticMarkup(
    React.createElement(TechniqueTagsSection, tagProps)
  );
  const checkinHtml = renderCheckin(sessionAssessment);

  const combinedHtml = `${transformHtml} ${tagsHtml} ${checkinHtml}`;
  assert.match(tagsHtml, /external service/i);
  assert.match(checkinHtml, /external service/i);
  assert.doesNotMatch(
    combinedHtml,
    /JEV|TypeSafe|OpenRouter|Cloudflare|model/i
  );
  assert.match(checkinHtml, /description and notes/i);
});
