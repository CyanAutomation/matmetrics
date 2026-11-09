import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  linearStepProgressHtml,
  mountLinearStepProgress,
  type LinearStepProgressProps,
} from './linear-step-progress';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

function props(overrides: Partial<LinearStepProgressProps> = {}): LinearStepProgressProps {
  return {
    steps: ['Session details', 'Practice description', 'Review'],
    currentStep: 1,
    ...overrides,
  };
}

test('step progress exposes current and completed steps to assistive technology', () => {
  const dom = new JSDOM(linearStepProgressHtml(props()));
  const document = dom.window.document;
  const nav = document.querySelector('nav[aria-label="Form progress"]');
  const status = nav?.querySelector('[role="status"]');
  const steps = Array.from(
    nav?.querySelectorAll('ol[aria-label="Steps"] > li') ?? []
  ) as HTMLElement[];

  assert.equal(
    status?.textContent?.replace(/\s+/g, ' ').trim(),
    'Step 2 of 3 · Practice description'
  );
  assert.equal(steps.length, 3);
  assert.equal(steps[0].getAttribute('aria-label'), 'Step 1: Session details, complete');
  assert.equal(steps[0].getAttribute('aria-current'), null);
  assert.equal(steps[1].getAttribute('aria-label'), 'Step 2: Practice description');
  assert.equal(steps[1].getAttribute('aria-current'), 'step');
  assert.equal(steps[2].getAttribute('aria-label'), 'Step 3: Review');
  dom.window.close();
});

test('step progress escapes labels and updates markup when the current step changes', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div') as HTMLElement;
  const initial = props({ steps: ['<Details>', 'Review'] });
  host.innerHTML = linearStepProgressHtml(initial);
  const controller = mountLinearStepProgress(host, initial);

  assert.equal(host.querySelector('script'), null);
  assert.equal(host.querySelector('li')?.textContent?.includes('<Details>'), true);

  controller.update(props({ steps: ['Details', 'Review'], currentStep: 1 }));

  assert.equal(
    host.querySelector('[role="status"]')?.textContent?.replace(/\s+/g, ' ').trim(),
    'Step 2 of 2 · Review'
  );
  assert.equal(host.querySelector('li[aria-current="step"]')?.getAttribute('aria-label'), 'Step 2: Review');
  assert.equal(host.querySelectorAll('li').length, 2);
  controller.destroy();
  dom.window.close();
});
