import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiApiError,
  classifyAiError,
  getAiApiErrorMessage,
} from './ai-api-error';

test('classifyAiError identifies provider request rejections by HTTP status', () => {
  assert.equal(classifyAiError({ status: 400 }), 'AI_PROVIDER_REJECTED');
  assert.equal(classifyAiError({ status: 402 }), 'AI_PROVIDER_REJECTED');
  assert.equal(classifyAiError({ status: 404 }), 'AI_PROVIDER_REJECTED');
});

test('provider rejection responses preserve only the HTTP status', () => {
  assert.deepEqual(
    aiApiError('AI_PROVIDER_REJECTED', { providerStatus: 402 }),
    {
      status: 502,
      body: {
        error: {
          code: 'AI_PROVIDER_REJECTED',
          message: 'The AI provider rejected the check-in request.',
          providerStatus: 402,
        },
      },
    }
  );
  assert.deepEqual(aiApiError('AUTH_REQUIRED', { providerStatus: 401 }), {
    status: 401,
    body: {
      error: {
        code: 'AUTH_REQUIRED',
        message: 'AI service authentication is required.',
        providerStatus: 401,
      },
    },
  });
});

test('client error messages are selected by code and never echo provider text', () => {
  const providerSecret = 'provider echoed private session text';
  const result = getAiApiErrorMessage({
    error: {
      code: 'AI_PROVIDER_REJECTED',
      message: providerSecret,
      providerStatus: 400,
    },
  });

  assert.match(result, /HTTP 400/);
  assert.doesNotMatch(result, new RegExp(providerSecret));
  assert.match(
    getAiApiErrorMessage({
      error: { code: 'AUTH_REQUIRED', providerStatus: 401 },
    }),
    /HTTP 401/
  );
});

test('client falls back safely for unknown or malformed API errors', () => {
  assert.equal(
    getAiApiErrorMessage({ error: { code: 'UNKNOWN_ERROR' } }),
    'The training check-in could not be completed. Please try again.'
  );
  assert.equal(
    getAiApiErrorMessage({
      error: { code: 'AI_PROVIDER_REJECTED', providerStatus: 200 },
    }),
    'The training check-in could not be completed. Please try again.'
  );
});
