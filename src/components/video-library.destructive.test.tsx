import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildVideoDomainRemovalConfirmationDescription,
  VIDEO_LIBRARY_REMOVE_DOMAIN_CANCEL_LABEL,
  VIDEO_LIBRARY_REMOVE_DOMAIN_CONFIRM_LABEL,
} from './video-library';

test('destructive criterion anchor: removing a domain warns when sessions would become disallowed', () => {
  const description = buildVideoDomainRemovalConfirmationDescription({
    domain: 'club.example.com',
    affectedSessionCount: 2,
    affectedSessionIds: ['session-1', 'session-2'],
  });

  assert.match(description, /Removing club\.example\.com/i);
  assert.match(description, /2 session\(s\)/i);
});

test('destructive criterion anchor: domain removal dialog preserves explicit confirm and cancel labels', () => {
  assert.equal(VIDEO_LIBRARY_REMOVE_DOMAIN_CONFIRM_LABEL, 'Remove domain');
  assert.equal(VIDEO_LIBRARY_REMOVE_DOMAIN_CANCEL_LABEL, 'Cancel');
});
