import assert from 'node:assert/strict';
import test from 'node:test';

import { getTabLabel } from './video-library-view-model';

test('video library tab labels identify what each count measures', () => {
  assert.equal(getTabLabel('watchable'), 'Watchable sessions');
  assert.equal(getTabLabel('attention'), 'Sessions to review');
  assert.equal(getTabLabel('all'), 'All sessions');
  assert.equal(getTabLabel('no_video'), 'No video');
});
