import assert from 'node:assert/strict';
import test from 'node:test';

import { isBlockedNetworkHostname } from './network-safety';

test('blocks hostname policy for localhost and local domains', () => {
  assert.equal(isBlockedNetworkHostname('localhost'), true);
  assert.equal(isBlockedNetworkHostname('service.local'), true);
  assert.equal(isBlockedNetworkHostname('service.localdomain'), true);
  assert.equal(isBlockedNetworkHostname('example.com'), false);
});

test('blocks URL bypass targets across ipv4 and ipv6', () => {
  const blockedUrls = [
    'http://127.0.0.2/path',
    'http://[::1]/path',
    'http://[::ffff:127.0.0.1]/path',
    'http://169.254.1.1/path',
  ];

  for (const url of blockedUrls) {
    const parsed = new URL(url);
    assert.equal(
      isBlockedNetworkHostname(parsed.hostname),
      true,
      `expected blocked host for ${url}`
    );
  }
});

test('blocks additional private and internal address families', () => {
  const blockedHosts = [
    '10.2.3.4',
    '172.20.10.7',
    '192.168.5.6',
    '100.88.1.3',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
  ];

  for (const host of blockedHosts) {
    assert.equal(
      isBlockedNetworkHostname(host),
      true,
      `expected ${host} blocked`
    );
  }
});

test('allows public internet hosts and addresses', () => {
  const allowedHosts = ['example.com', '8.8.8.8', '2606:4700:4700::1111'];

  for (const host of allowedHosts) {
    assert.equal(
      isBlockedNetworkHostname(host),
      false,
      `expected ${host} allowed`
    );
  }
});
