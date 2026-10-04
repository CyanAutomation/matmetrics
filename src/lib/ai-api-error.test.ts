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

test('classifyAiError treats missing or rejected provider keys as unavailable service', () => {
  assert.equal(classifyAiError(new Error('API key is not configured')), 'AUTH_REQUIRED');
  assert.equal(
    classifyAiError(new Error('CLOUDFLARE_API_TOKEN environment variable is not set')),
    'AUTH_REQUIRED'
  );
  assert.equal(classifyAiError({ status: 401 }), 'AUTH_REQUIRED');
  assert.equal(classifyAiError({ status: 403 }), 'AUTH_REQUIRED');
});

test('classifyAiError treats disconnected and timed-out API endpoints as unavailable', () => {
  assert.equal(classifyAiError(new TypeError('fetch failed')), 'SERVICE_UNAVAILABLE');
  assert.equal(
    classifyAiError(new DOMException('The request timed out', 'TimeoutError')),
    'SERVICE_UNAVAILABLE'
  );
});

test('provider rejection responses keep user-facing copy generic and preserve HTTP status', () => {
  assert.deepEqual(
    aiApiError('AI_PROVIDER_REJECTED', { providerStatus: 402 }),
    {
      status: 502,
      body: {
        error: {
          code: 'AI_PROVIDER_REJECTED',
          message: 'The training assistance request could not be accepted.',
          providerStatus: 402,
        },
      },
    }
  );
  assert.deepEqual(aiApiError('AUTH_REQUIRED', { providerStatus: 401 }), {
    status: 503,
    body: {
      error: {
        code: 'AUTH_REQUIRED',
        message: 'AI features are temporarily unavailable. Please try again later.',
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

  assert.match(result, /training assistance request could not be completed/i);
  assert.doesNotMatch(result, new RegExp(providerSecret));
  assert.match(
    getAiApiErrorMessage({
      error: { code: 'AUTH_REQUIRED', providerStatus: 401 },
    }),
    /temporarily unavailable/i
  );
});

test('client error messages hide model and provider implementation details', () => {
  const messages = [
    { code: 'AUTH_REQUIRED', providerStatus: 401 },
    { code: 'RATE_LIMITED', providerStatus: 429 },
    { code: 'SERVICE_UNAVAILABLE', providerStatus: 503 },
    { code: 'INVALID_AI_RESPONSE' },
    { code: 'AI_PROVIDER_REJECTED', providerStatus: 502 },
  ].map((error) => getAiApiErrorMessage({ error }));

  assert.doesNotMatch(
    messages.join(' '),
    /JEV|TypeSafe|OpenRouter|Cloudflare|model|provider/i
  );
});

test('client falls back safely for unknown or malformed API errors', () => {
  assert.equal(
    getAiApiErrorMessage({ error: { code: 'UNKNOWN_ERROR' } }),
    'Training assistance could not be completed. Please try again.'
  );
  assert.equal(
    getAiApiErrorMessage({
      error: { code: 'AI_PROVIDER_REJECTED', providerStatus: 200 },
    }),
    'Training assistance could not be completed. Please try again.'
  );
});
