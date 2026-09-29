import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSessionNotePreview,
  getVideoHostname,
  getSafeVideoUrl,
} from './session-history-format';

test('accepts only absolute HTTP and HTTPS session video URLs', () => {
  assert.equal(
    getSafeVideoUrl('https://www.example.com/watch?v=1'),
    'https://www.example.com/watch?v=1'
  );
  assert.equal(getSafeVideoUrl('http://example.com/video'), 'http://example.com/video');
  assert.equal(getSafeVideoUrl('javascript:alert(1)'), null);
  assert.equal(getSafeVideoUrl('/relative/video'), null);
  assert.equal(getSafeVideoUrl('not a URL'), null);
});

test('formats video hostnames without the www prefix', () => {
  assert.equal(getVideoHostname('https://www.example.com/watch'), 'example.com');
  assert.equal(getVideoHostname('https://videos.example.com/watch'), 'videos.example.com');
  assert.equal(getVideoHostname('invalid URL'), '');
});

test('builds a compact note preview from description and notes', () => {
  assert.equal(
    getSessionNotePreview({
      description: '  Grip   movement ',
      notes: '  Good rounds\nwith partner ',
    }),
    'Grip movement · Good rounds with partner'
  );
  assert.equal(getSessionNotePreview({ description: '  ', notes: '' }), '');
});
