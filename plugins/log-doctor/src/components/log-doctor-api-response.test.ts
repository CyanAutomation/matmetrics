import assert from 'node:assert/strict';
import test from 'node:test';

import { parseApiResponse, toErrorReason } from './log-doctor';

test('parseApiResponse surfaces JSON error payload message', async () => {
  const response = new Response(JSON.stringify({ message: 'Bad request payload' }), {
    status: 400,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });

  await assert.rejects(
    () => parseApiResponse(response),
    (error: unknown) => {
      assert.equal(toErrorReason(error), 'Bad request payload');
      return true;
    }
  );
});

test('parseApiResponse handles text/plain error payload with status and route hint', async () => {
  const response = new Response('Gateway timeout while contacting upstream', {
    status: 504,
    headers: {
      'content-type': 'text/plain',
    },
  });
  Object.defineProperty(response, 'url', {
    value: 'https://example.test/api/github/log-doctor',
  });

  await assert.rejects(
    () => parseApiResponse(response),
    (error: unknown) => {
      const reason = toErrorReason(error);
      assert.match(reason, /HTTP 504/);
      assert.match(reason, /\/api\/github\/log-doctor/);
      assert.match(reason, /non-JSON response/);
      return true;
    }
  );
});

test('parseApiResponse handles HTML 404 payload with clear fallback messaging', async () => {
  const response = new Response('<html><body>Not Found</body></html>', {
    status: 404,
    headers: {
      'content-type': 'text/html',
    },
  });
  Object.defineProperty(response, 'url', {
    value: 'https://example.test/api/github/log-doctor/preview',
  });

  await assert.rejects(
    () => parseApiResponse(response),
    (error: unknown) => {
      const reason = toErrorReason(error);
      assert.match(reason, /HTTP 404/);
      assert.match(reason, /\/api\/github\/log-doctor\/preview/);
      assert.match(reason, /non-JSON response/);
      return true;
    }
  );
});

test('parseApiResponse reports malformed JSON payload with controlled message', async () => {
  const response = new Response('{"message": ', {
    status: 502,
    headers: {
      'content-type': 'application/json',
    },
  });

  await assert.rejects(
    () => parseApiResponse(response),
    (error: unknown) => {
      assert.equal(
        toErrorReason(error),
        'Service returned malformed JSON (HTTP 502).'
      );
      return true;
    }
  );
});
