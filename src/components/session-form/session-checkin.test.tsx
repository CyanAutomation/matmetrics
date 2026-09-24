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
  hasTechniqueDetail: 0.9,
  hasReflection: 0.8,
  fatigueSignal: 0.2,
  injurySignal: 0.1,
};

function renderCheckin(assessment: typeof sessionAssessment) {
  return renderToStaticMarkup(
    React.createElement(SessionCheckin, {
      canUseAi: true,
      disabled: false,
      isLoading: false,
      assessment,
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

test('AI form sections disclose which providers receive session text', () => {
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

  assert.match(transformHtml, /Cloudflare/);
  assert.match(transformHtml, /OpenRouter/);
  assert.match(tagsHtml, /Cloudflare/);
  assert.match(tagsHtml, /OpenRouter/);
  assert.match(checkinHtml, /OpenRouter/);
  assert.match(checkinHtml, /description and notes/i);
});
