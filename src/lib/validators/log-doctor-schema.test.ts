import assert from 'node:assert/strict';
import test from 'node:test';
import { logDoctorFixRequestSchema } from './log-doctor-schema';

const validRequest = {
  owner: 'octocat',
  repo: 'matmetrics',
  paths: ['data/2026/03/session.md'],
};

const allEnabled = {
  normalizeFrontmatter: true,
  enforceSectionOrder: true,
  preserveUserContent: true,
};

test('log-doctor schema supplies complete options when options are omitted', () => {
  const result = logDoctorFixRequestSchema.parse(validRequest);

  assert.deepEqual(result.options, allEnabled);
});

test('log-doctor schema defaults only omitted option fields', () => {
  const result = logDoctorFixRequestSchema.parse({
    ...validRequest,
    options: { enforceSectionOrder: false },
  });

  assert.deepEqual(result.options, {
    ...allEnabled,
    enforceSectionOrder: false,
  });
});

test('log-doctor schema preserves explicit false values for every option', () => {
  const result = logDoctorFixRequestSchema.parse({
    ...validRequest,
    options: {
      normalizeFrontmatter: false,
      enforceSectionOrder: false,
      preserveUserContent: false,
    },
  });

  assert.deepEqual(result.options, {
    normalizeFrontmatter: false,
    enforceSectionOrder: false,
    preserveUserContent: false,
  });
});
