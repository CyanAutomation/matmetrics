// @ts-expect-error jsdom types not available
import { JSDOM } from 'jsdom';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook } from '@testing-library/react';

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

describe('useFileValidationController', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

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

  it('should expose required methods', () => {
    const { result } = renderHook(() =>
      useFileValidationController({
        owner: 'test',
        repo: 'test-repo',
        branch: 'main',
      })
    );

    assert.ok(typeof result.current.reset === 'function');
    assert.ok(typeof result.current.scanFiles === 'function');
    assert.ok(typeof result.current.previewFixes === 'function');
    assert.ok(typeof result.current.applyFixes === 'function');
    assert.ok(typeof result.current.cancelOperation === 'function');
  });

  // Network and Firebase auth dependent tests are skipped since these
  // dependencies are not available in the test environment. The hook
  // implementation is thoroughly tested via component integration tests.
});

