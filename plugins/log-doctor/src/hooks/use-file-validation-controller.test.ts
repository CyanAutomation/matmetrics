import { JSDOM } from 'jsdom';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook } from '@testing-library/react';
import { useFileValidationController } from './use-file-validation-controller';

// Setup jsdom for DOM-dependent tests
const dom = new JSDOM();
global.document = dom.window.document as any;
global.window = dom.window as any;

describe('useFileValidationController', () => {
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

