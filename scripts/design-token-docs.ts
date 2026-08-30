import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format } from 'prettier';

import {
  DESIGN_TOKEN_GROUPS,
  LEGACY_DESIGN_TOKEN_MAPPINGS,
  type DesignTokenDefinition,
  type DesignTokenGroup,
} from '../src/lib/design-tokens';

const START_MARKER = '<!-- BEGIN GENERATED DESIGN TOKENS -->';
const END_MARKER = '<!-- END GENERATED DESIGN TOKENS -->';
const designDocumentPath = path.join(process.cwd(), 'DESIGN.md');

const renderValue = (value: string): string =>
  value.replace(/#[0-9a-f]+/gi, (hex) => `\`${hex}\``);

const renderTable = (tokens: readonly DesignTokenDefinition[]): string => {
  const rows = tokens.map(
    ({ key, value, usage }) =>
      `| \`${key}\` | ${renderValue(value)} | ${usage} |`
  );
  return [
    '| Token | Value | Intended usage |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
};

const renderGeneratedSection = (): string => {
  const lines = [
    START_MARKER,
    '### Canonical Token Guidance',
    '',
    'This section is generated from `src/lib/design-tokens.ts`, the sole machine-readable source of canonical token keys. Do not edit the generated tables directly; run `npm run docs:design-tokens` after changing the source.',
    '',
  ];

  for (const group of DESIGN_TOKEN_GROUPS as readonly DesignTokenGroup[]) {
    lines.push(`#### ${group.heading}`, '', group.description ?? '', '');
    if (group.tokens) {
      lines.push(renderTable(group.tokens), '');
    }
    for (const subsection of group.subsections ?? []) {
      lines.push(
        `##### ${subsection.heading}`,
        '',
        renderTable(subsection.tokens),
        ''
      );
    }
  }

  lines.push(
    '### Token Naming Convention',
    '',
    'Canonical token keys use lowercase letters and hyphen separators only (kebab-case).',
    '',
    '### Token Migration Mapping (Old -> Canonical)',
    '',
    'Use this mapping during migration for frontend and Go/CLI consumers so token lookups can be updated safely.',
    '',
    '| Old token | Canonical token |',
    '| --- | --- |',
    ...Object.entries(LEGACY_DESIGN_TOKEN_MAPPINGS).map(
      ([legacy, canonical]) => `| \`${legacy}\` | \`${canonical}\` |`
    ),
    END_MARKER
  );

  return lines.join('\n');
};

const currentDocument = readFileSync(designDocumentPath, 'utf8');
const start = currentDocument.indexOf(START_MARKER);
const end = currentDocument.indexOf(END_MARKER);

if ((start === -1) !== (end === -1)) {
  throw new Error('DESIGN.md has only one generated design-token marker.');
}

const generatedSection = renderGeneratedSection();
let documentPrefix: string;
let documentSuffix: string;
if (start === -1) {
  const oldStart = currentDocument.indexOf('### Canonical Token Guidance');
  const oldEnd = currentDocument.indexOf('\n\n**Migration note:**');
  if (oldStart === -1 || oldEnd === -1) {
    throw new Error('Could not locate the DESIGN.md token section.');
  }
  documentPrefix = currentDocument.slice(0, oldStart);
  documentSuffix = currentDocument.slice(oldEnd);
} else {
  documentPrefix = currentDocument.slice(0, start);
  documentSuffix = currentDocument.slice(end + END_MARKER.length);
}

void format(generatedSection, { parser: 'markdown' })
  .then((formattedGeneratedSection) => {
    const updatedDocument = `${documentPrefix}${formattedGeneratedSection.trimEnd()}${documentSuffix}`;
    if (process.argv.includes('--check')) {
      if (updatedDocument !== currentDocument) {
        console.error(
          'DESIGN.md design-token tables are stale. Regenerate them with `npm run docs:design-tokens`.'
        );
        process.exitCode = 1;
      }
    } else {
      writeFileSync(designDocumentPath, updatedDocument);
      console.log('Generated design-token tables in DESIGN.md.');
    }
  })
  .catch((error) => {
    console.error('Failed to format generated documentation:', error);
    process.exitCode = 1;
  });
