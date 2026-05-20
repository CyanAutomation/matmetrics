import { JSDOM } from 'jsdom';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act } from '@testing-library/react';
import { useFileValidationController } from './use-file-validation-controller';
import type { ScanResult, FixResult } from '../components/log-doctor-state';

// Setup jsdom for DOM-dependent tests
const dom = new JSDOM();
global.document = dom.window.document as any;
global.window = dom.window as any;

describe('useFileValidationController', () => {
  const mockAuthHeaders = { 'Authorization': 'Bearer token' };
  const mockScanResult: ScanResult = {
    summary: { totalFiles: 2, invalidCount: 1 },
    files: [
      { path: 'data/2026/03/20260318-matmetrics.md', status: 'valid' },
      { path: 'data/2026/03/invalid.md', status: 'invalid', issues: ['Missing YAML frontmatter'] },
    ],
  };

  const mockFixResult: FixResult = {
    summary: { totalFiles: 2, fixedCount: 1 },
    files: [
      { path: 'data/2026/03/invalid.md', status: 'fixed', changes: ['Added YAML'] },
    ],
  };

  it('should initialize with empty state', () => {
    const { result } = renderHook(() =>
      useFileValidationController({
        owner: 'test',
        repo: 'test-repo',
        branch: 'main',
      })
    );

    assert.equal(result.current.scanResult, null);
    assert.equal(result.current.fixResult, null);
    assert.equal(result.current.isScanning, false);
    assert.equal(result.current.isPreviewing, false);
    assert.equal(result.current.isApplying, false);
    assert.equal(result.current.errorMessage, null);
  });

  it('should scan files', async () => {
    // Mock fetch for this test
    const originalFetch = global.fetch;
    let fetchCalled = false;
    (global.fetch as any) = async () => {
      fetchCalled = true;
      return {
        ok: true,
        json: async () => mockScanResult,
      };
    };

    const { result } = renderHook(() =>
      useFileValidationController({
        owner: 'test',
        repo: 'test-repo',
        branch: 'main',
      })
    );

    await act(async () => {
      await result.current.scanFiles();
    });

    assert.ok(fetchCalled);
    assert.deepEqual(result.current.scanResult, mockScanResult);
    assert.equal(result.current.errorMessage, null);

    global.fetch = originalFetch;
  });

  it('should handle scan errors', async () => {
    const originalFetch = global.fetch;
    const error = new Error('Network error');
    (global.fetch as any) = async () => {
      throw error;
    };

    const { result } = renderHook(() =>
      useFileValidationController({
        owner: 'test',
        repo: 'test-repo',
        branch: 'main',
      })
    );

    await act(async () => {
      await result.current.scanFiles();
    });

    assert.equal(result.current.scanResult, null);
    assert.ok(result.current.errorMessage !== null);
    assert.equal(result.current.isScanning, false);

    global.fetch = originalFetch;
  });

  it('should preview fixes for selected paths', async () => {
    const originalFetch = global.fetch;
    (global.fetch as any) = async () => {
      return {
        ok: true,
        json: async () => mockFixResult,
      };
    };

    const { result } = renderHook(() =>
      useFileValidationController({
        owner: 'test',
        repo: 'test-repo',
        branch: 'main',
      })
    );

    await act(async () => {
      await result.current.previewFixes(['data/2026/03/invalid.md']);
    });

    assert.deepEqual(result.current.fixResult, mockFixResult);

    global.fetch = originalFetch;
  });

  it('should prevent preview without selected paths', async () => {
    const originalFetch = global.fetch;
    let fetchCalled = false;
    (global.fetch as any) = async () => {
      fetchCalled = true;
      return {
        ok: true,
        json: async () => mockFixResult,
      };
    };

    const { result } = renderHook(() =>
      useFileValidationController({
        owner: 'test',
        repo: 'test-repo',
        branch: 'main',
      })
    );

    await act(async () => {
      await result.current.previewFixes([]);
    });

    assert.ok(!fetchCalled);
    assert.ok(result.current.errorMessage?.includes('at least one file'));

    global.fetch = originalFetch;
  });

  it('should apply fixes for selected paths', async () => {
    const originalFetch = global.fetch;
    (global.fetch as any) = async () => {
      return {
        ok: true,
        json: async () => mockFixResult,
      };
    };

    const { result } = renderHook(() =>
      useFileValidationController({
        owner: 'test',
        repo: 'test-repo',
        branch: 'main',
      })
    );

    await act(async () => {
      await result.current.applyFixes(['data/2026/03/invalid.md']);
    });

    assert.deepEqual(result.current.fixResult, mockFixResult);

    global.fetch = originalFetch;
  });

  it('should prevent apply without selected paths', async () => {
    const originalFetch = global.fetch;
    let fetchCalled = false;
    (global.fetch as any) = async () => {
      fetchCalled = true;
      return {
        ok: true,
        json: async () => mockFixResult,
      };
    };

    const { result } = renderHook(() =>
      useFileValidationController({
        owner: 'test',
        repo: 'test-repo',
        branch: 'main',
      })
    );

    await act(async () => {
      await result.current.applyFixes([]);
    });

    assert.ok(!fetchCalled);
    assert.ok(result.current.errorMessage?.includes('at least one file'));

    global.fetch = originalFetch;
  });

  it('should cancel active operation', async () => {
    const originalFetch = global.fetch;
    (global.fetch as any) = () => new Promise(() => {});

    const { result } = renderHook(() =>
      useFileValidationController({
        owner: 'test',
        repo: 'test-repo',
        branch: 'main',
      })
    );

    // Start a scan (which will be aborted)
    const scanPromise = act(async () => {
      await result.current.scanFiles();
    });

    // Allow the fetch to be initiated
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Cancel the operation
    await act(async () => {
      result.current.cancelOperation();
    });

    // The abort signal should have been called
    assert.equal(result.current.isScanning, false);

    global.fetch = originalFetch;
  });

  it('should reset state', () => {
    const { result } = renderHook(() =>
      useFileValidationController({
        owner: 'test',
        repo: 'test-repo',
        branch: 'main',
      })
    );

    // Set some state
    act(() => {
      result.current.setScanResult(mockScanResult);
      result.current.setFixResult(mockFixResult);
      result.current.setErrorMessage('Some error');
    });

    assert.ok(result.current.scanResult !== null);
    assert.ok(result.current.fixResult !== null);

    // Reset
    act(() => {
      result.current.reset();
    });

    assert.equal(result.current.scanResult, null);
    assert.equal(result.current.fixResult, null);
    assert.equal(result.current.errorMessage, null);
  });
});
