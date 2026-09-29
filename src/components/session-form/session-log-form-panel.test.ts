import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import type { SessionAssessment } from '@/lib/jev-client';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  DocumentFragment: dom.window.DocumentFragment,
  Event: dom.window.Event,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { cleanup, fireEvent, render, screen } =
  require('@testing-library/react') as typeof import('@testing-library/react');

const assessment: SessionAssessment = {
  suggestedCategory: 'Technical',
  categoryConfidence: 0.9,
  categoryFitProbability: 0.9,
  hasUsefulDetail: 0.8,
  hasReflection: 0.7,
  effortConflictProbability: 0.1,
  unsupportedTechniqueTags: [],
};
let initialAssessment: SessionAssessment | null = null;
let invalidationCount = 0;
let submissionCount = 0;
let SessionLogForm: typeof import('./session-log-form-panel').SessionLogForm;

const noOp = () => undefined;
const stableAiForm = {
  reset: noOp,
  isLoadingTransform: false,
  transformMessage: null,
  isLoadingSuggest: false,
  suggestMessage: null,
};
const stableFeedback = {
  reset: noOp,
  showSuccess: noOp,
  showError: noOp,
  startLoading: noOp,
  feedbackState: 'idle',
};

before(async () => {
  mock.module('@/components/auth-provider', {
    namedExports: {
      useAuth: () => ({
        canUseAi: true,
        authAvailable: true,
        preferences: {
          sessionTypes: { enabledCategories: ['Technical'] },
        },
      }),
    },
  });
  mock.module('@/hooks/use-toast', {
    namedExports: { useToast: () => ({ toast: noOp }) },
  });
  mock.module('@/hooks/use-session-form-ai', {
    namedExports: { useSessionFormAi: () => stableAiForm },
  });
  mock.module('@/hooks/use-action-feedback', {
    namedExports: { useActionFeedback: () => stableFeedback },
  });
  mock.module('@/hooks/use-session-log-form-actions', {
    namedExports: {
      useSessionLogFormActions: () => ({
        handleAddTech: noOp,
        handleTransform: noOp,
        handleSuggest: noOp,
        handleRemoveTech: noOp,
      }),
    },
  });
  mock.module('@/hooks/use-session-form', {
    namedExports: {
      useSessionFormState: () => {
        const [date, setDate] = React.useState('');
        const [duration, setDuration] = React.useState('');
        const [description, setDescription] = React.useState('');
        const [techniques, setTechniques] = React.useState<string[]>([]);
        const [newTech, setNewTech] = React.useState('');
        const [category, setCategory] = React.useState('Technical');
        const [effort, setEffort] = React.useState(3);
        const [notes, setNotes] = React.useState('');
        const [videoUrl, setVideoUrl] = React.useState('');
        return {
          date,
          setDate,
          duration,
          setDuration,
          description,
          setDescription,
          techniques,
          setTechniques,
          newTech,
          setNewTech,
          effort,
          setEffort,
          category,
          setCategory,
          notes,
          setNotes,
          videoUrl,
          setVideoUrl,
          reset: noOp,
          isEditing: false,
        };
      },
      useVideoUrlValidation: () => null,
      useFormSubmit: () => ({
        isSubmitting: false,
        submit: async () => {
          submissionCount += 1;
          return true;
        },
      }),
    },
  });
  mock.module('@/hooks/use-session-assessment', {
    namedExports: {
      useSessionAssessment: () => {
        const [currentAssessment, setCurrentAssessment] =
          React.useState(initialAssessment);
        const assessmentRef = React.useRef(currentAssessment);
        const invalidate = React.useCallback(() => {
          if (assessmentRef.current === null) return;
          assessmentRef.current = null;
          invalidationCount += 1;
          setCurrentAssessment(null);
        }, []);
        return {
          assessment: currentAssessment,
          assess: noOp,
          invalidate,
          isLoading: false,
        };
      },
    },
  });
  ({ SessionLogForm } = await import('./session-log-form-panel'));
});

beforeEach(() => {
  initialAssessment = null;
  invalidationCount = 0;
  submissionCount = 0;
});

afterEach(cleanup);

function renderForm() {
  return render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(SessionLogForm, { onSuccess: noOp })
    )
  );
}

function assertCurrentStep(step: number) {
  assert.match(
    screen.getByRole('status').textContent ?? '',
    new RegExp(`Step ${step} of 4`)
  );
}

test('typing in the session description remains controlled without an update-depth error', () => {
  renderForm();
  fireEvent.change(screen.getByLabelText('Session date *'), {
    target: { value: '2026-09-28' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  const description = screen.getByRole('textbox', {
    name: 'What did you practise?',
  }) as HTMLTextAreaElement;

  assert.doesNotThrow(() => {
    fireEvent.change(description, { target: { value: 'Uchi mata entries' } });
    fireEvent.change(description, {
      target: { value: 'Uchi mata entries and finishes' },
    });
  });
  assert.equal(description.value, 'Uchi mata entries and finishes');
  assert.equal(invalidationCount, 0);
});

test('editing assessed input clears the stale assessment exactly once', () => {
  initialAssessment = assessment;
  renderForm();
  fireEvent.change(screen.getByLabelText('Session date *'), {
    target: { value: '2026-09-28' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  const description = screen.getByRole('textbox', {
    name: 'What did you practise?',
  }) as HTMLTextAreaElement;

  // Strict Mode sets the effect up twice, but guarded invalidation only changes
  // assessment state once. Further keystrokes are no-ops while it is null.
  assert.equal(invalidationCount, 1);
  fireEvent.change(description, { target: { value: 'First edit' } });
  fireEvent.change(description, { target: { value: 'Second edit' } });

  assert.equal(description.value, 'Second edit');
  assert.equal(invalidationCount, 1);
});

test('progresses through the session steps and submits only at the end', () => {
  renderForm();

  assertCurrentStep(1);
  assert.equal(
    screen.queryByRole('textbox', { name: 'What did you practise?' }),
    null
  );

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  assertCurrentStep(1);
  fireEvent.submit(
    screen
      .getByRole('button', { name: 'Continue' })
      .closest('form') as HTMLFormElement
  );
  assert.equal(submissionCount, 0);

  fireEvent.change(screen.getByLabelText('Session date *'), {
    target: { value: '2026-09-28' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  assertCurrentStep(2);

  fireEvent.change(
    screen.getByRole('textbox', { name: 'What did you practise?' }),
    {
      target: { value: 'Uchi mata entries and finishes' },
    }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  assertCurrentStep(3);
  assert.ok(screen.getByText('Technique tags'));
  assert.equal(submissionCount, 0);

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  assertCurrentStep(4);
  assert.ok(screen.getByText('Uchi mata entries and finishes'));
  assert.equal(submissionCount, 0);

  fireEvent.click(screen.getByText(/Add reflection or a relevant video/));
  fireEvent.change(screen.getByRole('textbox', { name: 'Reflection' }), {
    target: { value: 'Felt strong during the final rounds.' },
  });
  fireEvent.change(screen.getByLabelText('Relevant Video URL (Optional)'), {
    target: { value: 'https://example.com/session-video' },
  });
  assert.ok(
    screen.getByText('Felt strong during the final rounds.', {
      selector: 'dd',
    })
  );
  assert.ok(
    screen.getByText('https://example.com/session-video', { selector: 'dd' })
  );

  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));
  assert.equal(submissionCount, 1);
});

test('back navigation preserves entered values', () => {
  renderForm();
  fireEvent.change(screen.getByLabelText('Session date *'), {
    target: { value: '2026-09-28' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  const description = screen.getByRole('textbox', {
    name: 'What did you practise?',
  }) as HTMLTextAreaElement;
  fireEvent.change(description, { target: { value: 'Grip fighting rounds' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));

  assertCurrentStep(2);
  assert.equal(
    (
      screen.getByRole('textbox', {
        name: 'What did you practise?',
      }) as HTMLTextAreaElement
    ).value,
    'Grip fighting rounds'
  );
});
