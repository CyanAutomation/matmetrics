// @ts-expect-error jsdom types not available
import { JSDOM } from 'jsdom';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, renderHook, waitFor } from '@testing-library/react';

// Mock localStorage before importing modules
class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  clear(): void {
    this.store.clear();
  }
}

const localStorageMock = new LocalStorageMock();

// Setup jsdom for DOM-dependent tests
const dom = new JSDOM();
global.document = dom.window.document as any;
global.window = dom.window as any;

// Mock localStorage globally
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});
Object.defineProperty(global, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

import { useFileValidationController } from './use-file-validation-controller';

const config = {
  owner: ' test-owner ',
  repo: ' test-repo ',
  branch: ' main ',
};

const authHeaders = async (headers?: HeadersInit): Promise<HeadersInit> => ({
  ...(headers as Record<string, string>),
  Authorization: 'Bearer test-token',
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('useFileValidationController', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() =>
      useFileValidationController(config, {
        getAuthHeaders: authHeaders,
        fetch: async () => jsonResponse({}),
      })
    );

    assert.equal(result.current.scanResult, null);
    assert.equal(result.current.fixResult, null);
    assert.equal(result.current.isScanning, false);
    assert.equal(result.current.isPreviewing, false);
    assert.equal(result.current.isApplying, false);
    assert.equal(result.current.errorMessage, null);
  });

  it('transitions from scanning to successful scan results', async () => {
    const scanResult = {
      success: true,
      message: 'Scan complete',
      branch: 'main',
      summary: { totalFiles: 1, validFiles: 0, invalidFiles: 1 },
      files: [
        {
          path: 'data/2026/08/session.md',
          status: 'invalid' as const,
          errors: ['Missing duration'],
        },
      ],
    };
    let resolveRequest!: (response: Response) => void;
    const request = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const { result } = renderHook(() =>
      useFileValidationController(config, {
        getAuthHeaders: authHeaders,
        fetch: (input, init) => {
          calls.push({ input, init });
          return request;
        },
      })
    );

    let scanPromise!: Promise<void>;
    act(() => {
      scanPromise = result.current.scanFiles();
    });
    await waitFor(() => assert.equal(result.current.isScanning, true));
    assert.equal(result.current.uiState.phase, 'loading');

    resolveRequest(jsonResponse(scanResult));
    await act(async () => scanPromise);

    assert.deepEqual(result.current.scanResult, scanResult);
    assert.equal(result.current.isScanning, false);
    assert.deepEqual(result.current.uiState, {
      phase: 'success',
      operation: 'scan',
      message: 'Findings ready.',
    });
    assert.equal(calls[0]?.input, '/api/github/log-doctor');
    assert.equal(calls[0]?.init?.headers instanceof Headers, false);
    assert.deepEqual(calls[0]?.init?.headers, {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    });
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      owner: 'test-owner',
      repo: 'test-repo',
      branch: 'main',
    });
  });

  it('surfaces a rejected scan request as an error message', async () => {
    const { result } = renderHook(() =>
      useFileValidationController(config, {
        getAuthHeaders: authHeaders,
        fetch: async () => {
          throw new Error('Repository unavailable');
        },
      })
    );

    await act(async () => result.current.scanFiles());

    assert.equal(result.current.uiState.phase, 'error');
    assert.match(result.current.errorMessage ?? '', /Repository unavailable/);
    assert.equal(result.current.isScanning, false);
  });

  it('cancels an in-flight scan', async () => {
    let observedSignal: AbortSignal | undefined;
    const { result } = renderHook(() =>
      useFileValidationController(config, {
        getAuthHeaders: authHeaders,
        fetch: (_input, init) => {
          observedSignal = init?.signal ?? undefined;
          return new Promise<Response>((_resolve, reject) => {
            observedSignal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        },
      })
    );

    let scanPromise!: Promise<void>;
    act(() => {
      scanPromise = result.current.scanFiles();
    });
    await waitFor(() => assert.equal(result.current.isScanning, true));
    await waitFor(() => assert.ok(observedSignal));

    act(() => result.current.cancelOperation());
    await act(async () => scanPromise);

    assert.equal(observedSignal?.aborted, true);
    assert.equal(result.current.isScanning, false);
    assert.match(result.current.errorMessage ?? '', /Request canceled/);
    assert.equal(result.current.uiState.phase, 'error');
  });

  it('reset clears scan and fix results derived from completed requests', async () => {
    const responses = [
      {
        success: true,
        message: 'Scan complete',
        summary: { totalFiles: 1, validFiles: 0, invalidFiles: 1 },
        files: [{ path: 'data/session.md', status: 'invalid' }],
      },
      {
        success: true,
        message: 'Preview complete',
        mode: 'dry-run',
        files: [
          {
            path: 'data/session.md',
            status: 'preview',
            validationState: { before: 'invalid', after: 'valid' },
            preview: {
              changed: true,
              diff: '+ duration: 60',
              originalBytes: 100,
              updatedBytes: 113,
            },
          },
        ],
      },
    ];
    const { result } = renderHook(() =>
      useFileValidationController(config, {
        getAuthHeaders: authHeaders,
        fetch: async () => jsonResponse(responses.shift()),
      })
    );

    await act(async () => result.current.scanFiles());
    await act(async () => result.current.previewFixes(['data/session.md']));
    assert.ok(result.current.scanResult);
    assert.ok(result.current.fixResult);

    act(() => result.current.reset());

    assert.equal(result.current.scanResult, null);
    assert.equal(result.current.fixResult, null);
    assert.equal(result.current.errorMessage, null);
    assert.deepEqual(result.current.uiState, {
      phase: 'idle',
      operation: null,
      message: '',
    });
  });
});
