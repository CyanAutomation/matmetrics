import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLogDoctorApiResponse } from './api-parser';

describe('parseLogDoctorApiResponse', () => {
  it('should parse successful JSON response', async () => {
    const data = { result: 'success', count: 42 };
    const response = new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    const result = await parseLogDoctorApiResponse<typeof data>(response);
    assert.deepEqual(result, data);
  });

  it('should handle application/json charset', async () => {
    const data = { result: 'success' };
    const response = new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });

    const result = await parseLogDoctorApiResponse<typeof data>(response);
    assert.deepEqual(result, data);
  });

  it('should handle custom +json content types', async () => {
    const data = { result: 'success' };
    const response = new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'application/vnd.api+json' },
    });

    const result = await parseLogDoctorApiResponse<typeof data>(response);
    assert.deepEqual(result, data);
  });

  it('should throw on non-200 status with JSON error message', async () => {
    const response = new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });

    try {
      await parseLogDoctorApiResponse(response);
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /Not found/);
    }
  });

  it('should throw on non-200 status without custom message', async () => {
    const response = new Response(JSON.stringify({}), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });

    try {
      await parseLogDoctorApiResponse(response);
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /Request failed/);
    }
  });

  it('should throw on malformed JSON', async () => {
    const response = new Response('{ invalid json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    try {
      await parseLogDoctorApiResponse(response);
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /malformed JSON/);
    }
  });

  it('should throw on non-JSON response', async () => {
    const response = new Response('<html>Not JSON</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    try {
      await parseLogDoctorApiResponse(response);
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /non-JSON response/);
    }
  });

  it('should throw on missing content-type header', async () => {
    const response = new Response(JSON.stringify({}), {
      status: 200,
      headers: {},
    });

    try {
      await parseLogDoctorApiResponse(response);
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /non-JSON response/);
    }
  });

  it('should include route hint in error for non-JSON responses', async () => {
    const response = new Response('plain text', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    
    // Mock the url property (would normally be set by fetch API)
    Object.defineProperty(response, 'url', {
      value: 'https://example.com/api/scan',
      writable: true,
    });

    try {
      await parseLogDoctorApiResponse(response);
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /\/api\/scan/);
    }
  });

  it('should truncate long response body in error message', async () => {
    const longBody = 'x'.repeat(500);
    const response = new Response(longBody, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });

    try {
      await parseLogDoctorApiResponse(response);
      assert.fail('Expected error to be thrown');
    } catch (error) {
      assert.ok(error instanceof Error);
      const message = (error as Error).message;
      assert.ok(message.includes('…'));
      assert.ok(message.length < 300);
    }
  });

  it('should handle case-insensitive content-type header', async () => {
    const data = { result: 'success' };
    const response = new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'APPLICATION/JSON' },
    });

    const result = await parseLogDoctorApiResponse<typeof data>(response);
    assert.deepEqual(result, data);
  });
});
